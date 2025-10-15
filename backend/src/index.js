import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { Server } from 'socket.io';
import pkg from 'pg';
import { randomUUID } from 'crypto';

const { Pool } = pkg;

const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || (NODE_ENV === 'production' ? false : '*');
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function initDb() {
  const maxRetries = 10;
  const retryDelay = 2000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const client = await pool.connect();
      try {
        await client.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);
        await client.query(`
          CREATE TABLE IF NOT EXISTS alerts (
            id UUID PRIMARY KEY,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            lat DOUBLE PRECISION NOT NULL,
            lng DOUBLE PRECISION NOT NULL,
            radius_m INTEGER NOT NULL DEFAULT 500,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            resolved BOOLEAN NOT NULL DEFAULT false,
            resolved_at TIMESTAMPTZ,
            geom geography(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED
          );
        `);
        // Add resolved columns if they don't exist (migration)
        await client.query(`
          ALTER TABLE alerts
          ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON alerts (resolved);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_alerts_geom ON alerts USING gist(geom);`);
        console.log('DB ready.');
        return;
      } finally {
        client.release();
      }
    } catch (err) {
      console.log(`DB connection attempt ${i + 1}/${maxRetries} failed:`, err.message);
      if (i === maxRetries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

// Cleanup expired alerts every 5 minutes
async function cleanupExpired() {
  try {
    const result = await pool.query(`DELETE FROM alerts WHERE expires_at < now()`);
    if (result.rowCount > 0) {
      console.log(`Cleaned up ${result.rowCount} expired alerts`);
    }
  } catch (e) {
    console.error('Error cleaning up expired alerts:', e);
  }
}

setInterval(cleanupExpired, 5 * 60 * 1000);

const app = Fastify({ logger: true });
await app.register(cors, { origin: CORS_ORIGIN });
await app.register(rateLimit, {
  max: 100,
  timeWindow: '15 minutes'
});

// Attach Socket.IO to Fastify's own server (no extra createServer)
const io = new Server(app.server, { cors: { origin: CORS_ORIGIN } });

io.on('connection', (socket) => {
  app.log.info('Socket connected ' + socket.id);
});

const DEFAULT_TTL_MIN = 120; // 2 hours

app.post('/api/alerts', {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '15 minutes'
    }
  }
}, async (req, reply) => {
  try {
    const { type, title, description = '', lat, lng, radius_m = 500, ttl_minutes = DEFAULT_TTL_MIN } = req.body || {};

    // Validate required fields
    if (!type || !title || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return reply.code(400).send({ error: 'Missing required fields: type, title, lat, lng' });
    }

    // Validate type
    const validTypes = ['hazard', 'traffic', 'police', 'weather', 'event', 'other'];
    if (!validTypes.includes(type)) {
      return reply.code(400).send({ error: 'Invalid type' });
    }

    // Validate coordinates
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return reply.code(400).send({ error: 'Invalid coordinates' });
    }

    // Validate and sanitize inputs
    const sanitizedTitle = String(title).trim().slice(0, 200);
    const sanitizedDesc = String(description).trim().slice(0, 1000);
    const validRadius = Math.min(Math.max(Number(radius_m), 100), 10000);
    const validTTL = Math.min(Math.max(Number(ttl_minutes), 5), 1440); // 5 min to 24 hours

    if (!sanitizedTitle) {
      return reply.code(400).send({ error: 'Title cannot be empty' });
    }

    const id = randomUUID();
    const expires = new Date(Date.now() + validTTL * 60 * 1000);
    const q = `
      INSERT INTO alerts (id, type, title, description, lat, lng, radius_m, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id, type, title, description, lat, lng, radius_m, expires_at, created_at, resolved, resolved_at;
    `;
    const { rows } = await pool.query(q, [id, type, sanitizedTitle, sanitizedDesc, lat, lng, validRadius, expires]);
    const alert = rows[0];
    io.emit('alert:new', alert);
    return { ok: true, alert };
  } catch (e) {
    req.log.error(e);
    return reply.code(500).send({ error: 'Server error' });
  }
});

app.get('/api/alerts', async (req, reply) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radius = Number(req.query.radius ?? 5000);
    const type = req.query.type;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return reply.code(400).send({ error: 'lat & lng required' });
    }

    const params = [lng, lat, radius];
    let filterType = '';
    if (type) {
      filterType = 'AND type = $4';
      params.push(type);
    }

    const q = `
      SELECT id, type, title, description, lat, lng, radius_m, expires_at, created_at, resolved, resolved_at
      FROM alerts
      WHERE expires_at > now()
        AND resolved = false
        AND ST_DWithin(
          geom,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          $3
        )
        ${filterType}
      ORDER BY created_at DESC
      LIMIT 200;
    `;
    const { rows } = await pool.query(q, params);
    return { ok: true, alerts: rows };
  } catch (e) {
    req.log.error(e);
    return reply.code(500).send({ error: 'Server error' });
  }
});

// Mark alert as resolved
app.patch('/api/alerts/:id/resolve', async (req, reply) => {
  try {
    const { id } = req.params;

    const q = `
      UPDATE alerts
      SET resolved = true, resolved_at = now()
      WHERE id = $1 AND resolved = false
      RETURNING id, type, title, description, lat, lng, radius_m, expires_at, created_at, resolved, resolved_at;
    `;
    const { rows } = await pool.query(q, [id]);

    if (rows.length === 0) {
      return reply.code(404).send({ error: 'Alert not found or already resolved' });
    }

    const alert = rows[0];
    io.emit('alert:resolved', { id: alert.id });
    return { ok: true, alert };
  } catch (e) {
    req.log.error(e);
    return reply.code(500).send({ error: 'Server error' });
  }
});

// Health check
app.get('/api/health', async () => ({ ok: true }));

await initDb();
await app.listen({ port: PORT, host: '0.0.0.0' });
app.log.info(`HTTP+WS listening on ${PORT}`);
