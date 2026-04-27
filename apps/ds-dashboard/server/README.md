# ds-dashboard server

This directory contains the independent Hono API backend for the Design System Dashboard.

## Testing the API in isolation

You can run and test the API completely decoupled from the Vite frontend.

```bash
# Levantar solo la API (sin Vite) en el puerto 8787
npm run dev:api

# Correr tests de rutas (o tests unitarios)
npx tsx --test server/routes/*.test.ts

# Testear endpoints con curl directamente
curl http://localhost:8787/api/component-catalog
```

## Host binding (LAN / Docker)

By default, the API binds to loopback only (`127.0.0.1`) for safer local usage.

To expose the API over your network (LAN, Docker port mapping, VM), set:

```bash
DS_DASHBOARD_API_HOST=0.0.0.0
```

You can place it in `apps/ds-dashboard/.env` or export it before starting `dev:api`.

## Database connection

Tooling commands that persist capture/registry data use `DATABASE_URL`.

Set it in `apps/ds-dashboard/.env` or export it before starting `dev:api`:

```bash
DB_PROVIDER=local
DATABASE_URL=postgres://ds:local@localhost:5432/ds_dashboard
```

To use Supabase, choose the Supabase provider in the dashboard Database panel
or set the environment explicitly:

```bash
DB_PROVIDER=supabase
SUPABASE_DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
DATABASE_URL=$SUPABASE_DATABASE_URL
```

Supabase is treated as hosted PostgreSQL. The server requires SSL for Supabase
connections and disables prepared statements automatically when the URL points
to the Supabase pooler (`pooler.supabase.*` or port `6543`).

If `DATABASE_URL` is missing, the dashboard dev supervisor falls back to the
local database URL above. In production, missing database configuration is a
startup error.
