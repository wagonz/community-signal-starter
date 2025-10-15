# Community Signal Starter (Open‑Source, PWA + Node + PostGIS)

A minimal scaffold for a map‑centric “community alerts” app that avoids app stores.
- Frontend: Vite + React + Leaflet + PWA (vite-plugin-pwa)
- Backend: Node + Fastify + Socket.IO + Postgres (PostGIS)
- Reverse proxy: Caddy (HTTPS ready in prod; HTTP locally)
- Packaging: Docker Compose for reproducible dev/deploy

## Quick Start (Docker)
```bash
cd infra
cp .env.example .env
docker compose up --build
```
Open http://localhost:5173 (frontend). Backend runs at http://localhost:8080.

## Local Dev (without Docker)
- Backend:
  ```bash
  cd backend
  cp .env.example .env
  npm i
  npm run dev
  ```
- Frontend:
  ```bash
  cd frontend
  npm i
  npm run dev
  ```

## Default Ports
- Frontend: 5173
- Backend API: 8080
- Postgres (PostGIS): 5432
- Caddy (reverse proxy): 80 (HTTP dev), 443 in prod with real domain

## Env
Set `API_BASE_URL` and `WS_URL` in `infra/.env` (compose injects to frontend & backend).
- Example (dev): `API_BASE_URL=http://localhost:8080` and `WS_URL=http://localhost:8080`

## Features in this scaffold
- Drop an alert (title, type, radius) at your current map location
- See nearby alerts (auto-refresh + live via WebSocket)
- Alerts auto-expire (server cleans up on fetch based on `expires_at`)
- PWA installable (+ offline app shell; map tiles cache light)
- Geospatial queries via PostGIS `ST_DWithin`

## Next ideas
- Reputation & voting
- Topic channels
- Push notifications (Web Push, VAPID)
- Moderation dashboard
- MapLibre + vector tiles
