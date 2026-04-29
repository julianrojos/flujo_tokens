# ds-dashboard server

This directory contains the Hono API backend used by the Design System Dashboard.

The supported local entry point is the combined dashboard supervisor:

```bash
npm run dashboard:dev
```

That command starts the API and the Vite frontend together.

## Host binding (LAN / Docker)

By default, the API binds to loopback only (`127.0.0.1`) for safer local usage.

To expose the API over your network (LAN, Docker port mapping, VM), set:

```bash
DS_DASHBOARD_API_HOST=0.0.0.0
```

You can place it in `apps/ds-dashboard/.env` or export it before starting `dashboard:dev`.

## Database connection

Tooling commands that persist capture/registry data use `DATABASE_URL`.

Set it in `apps/ds-dashboard/.env` or export it before starting `dashboard:dev`:

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
