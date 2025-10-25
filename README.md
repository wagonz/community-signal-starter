# Community Signal Starter

A real-time community signaling application with interactive mapping features. Built with React, Node.js, PostgreSQL/PostGIS, and WebSockets.

## Tech Stack

- **Frontend**: React + Vite, Leaflet (interactive maps), Socket.IO client
- **Backend**: Node.js, Fastify, Socket.IO, PostgreSQL/PostGIS
- **Database**: PostgreSQL with PostGIS extension
- **Reverse Proxy**: Caddy (for Docker deployment)

## Prerequisites

### For Docker Setup (Recommended)
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

### For Local Development
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [PostgreSQL](https://www.postgresql.org/download/) (v16+ with PostGIS extension)
- npm (comes with Node.js)

## Quick Start with Docker

1. **Navigate to the infrastructure directory**:
   ```bash
   cd infra
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and configure your settings:
   ```env
   POSTGRES_USER=signals
   POSTGRES_PASSWORD=signals_pw
   POSTGRES_DB=signals
   API_BASE_URL=http://localhost:8080
   WS_URL=ws://localhost:8080
   ```

3. **Start all services**:
   ```bash
   docker-compose up
   ```

4. **Access the application**:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8080
   - Caddy reverse proxy: http://localhost:80

5. **Stop the services**:
   ```bash
   docker-compose down
   ```

## Local Development Setup

### 1. Database Setup

Install and start PostgreSQL with PostGIS:

```bash
# macOS (using Homebrew)
brew install postgresql@16 postgis
brew services start postgresql@16

# Ubuntu/Debian
sudo apt-get install postgresql-16 postgresql-16-postgis-3
sudo systemctl start postgresql

# Create database and user
psql -U postgres
CREATE USER signals WITH PASSWORD 'signals_pw';
CREATE DATABASE signals OWNER signals;
\c signals
CREATE EXTENSION postgis;
\q
```

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Edit .env with your settings (default values work for local development)
# DATABASE_URL=postgres://signals:signals_pw@localhost:5432/signals
# PORT=8080
# CORS_ORIGIN=http://localhost:5173

# Start the backend server
npm run dev
```

The backend will be available at http://localhost:8080

### 3. Frontend Setup

In a new terminal:

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

The frontend will be available at http://localhost:5173

## Available Scripts

### Backend

- `npm run dev` - Start the backend in development mode with auto-reload
- `npm start` - Start the backend in production mode

### Frontend

- `npm run dev` - Start the Vite development server
- `npm run build` - Build for production
- `npm run preview` - Preview the production build locally

## Project Structure

```
community-signal-starter/
├── backend/           # Node.js backend API
│   ├── src/          # Backend source code
│   ├── .env.example  # Backend environment variables template
│   ├── Dockerfile    # Backend Docker configuration
│   └── package.json  # Backend dependencies
├── frontend/         # React frontend
│   ├── src/         # Frontend source code
│   ├── public/      # Static assets
│   ├── Dockerfile   # Frontend Docker configuration
│   └── package.json # Frontend dependencies
└── infra/           # Infrastructure configuration
    ├── docker-compose.yml  # Docker Compose configuration
    ├── .env.example        # Infrastructure environment template
    └── Caddyfile          # Caddy reverse proxy config
```

## Environment Variables

### Backend (.env in backend/)
- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Backend server port (default: 8080)
- `CORS_ORIGIN` - Allowed CORS origin (default: http://localhost:5173)

### Infrastructure (.env in infra/)
- `POSTGRES_USER` - Database user
- `POSTGRES_PASSWORD` - Database password
- `POSTGRES_DB` - Database name
- `API_BASE_URL` - Backend API URL for frontend
- `WS_URL` - WebSocket URL for frontend

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running: `brew services list` (macOS) or `systemctl status postgresql` (Linux)
- Check connection string in backend/.env matches your database credentials
- Verify PostGIS extension is installed: `psql -U signals -d signals -c "SELECT PostGIS_version();"`

### Port Already in Use
- Backend (8080): Change `PORT` in backend/.env
- Frontend (5173): Vite will automatically suggest another port
- PostgreSQL (5432): Check for other PostgreSQL instances

### Docker Issues
- Clean rebuild: `docker-compose down -v && docker-compose up --build`
- Check logs: `docker-compose logs -f [service-name]`
- Verify Docker resources: Ensure Docker has enough memory allocated

## License

This project is part of a community signal starter kit.
