# ds-dashboard server

This directory contains the Hono API backend used by the Design System Dashboard.

The supported local entry point is the combined dashboard supervisor:

```bash
npm run dashboard:dev
```

That command starts the API and the Vite frontend together.

For a backend-only process, use:

```bash
npm run start
```

To test a split deployment locally, run:

```bash
npm run preview:split
```

## Frontend API base URL

Local development keeps using relative `/api` calls through the Vite proxy.
For a separate frontend deployment, set `VITE_API_URL` in the frontend build
environment so it points at the backend origin.
If the frontend is hosted on a different origin, set
`DS_DASHBOARD_ALLOWED_ORIGINS` on the backend to the frontend origin(s).

## Host binding (LAN / Docker)

By default, the API binds to loopback only (`127.0.0.1`) for safer local usage.

To expose the API over your network (LAN, Docker port mapping, VM), set:

```bash
DS_DASHBOARD_API_HOST=0.0.0.0
```

You can place it in `apps/ds-dashboard/.env` or export it before starting `dashboard:dev`.

Background jobs default to 2 workers. If jobs still stay in `Queued` for too long, increase worker parallelism:

```bash
DS_DASHBOARD_JOB_QUEUE_CONCURRENCY=2
```

You can raise it to `3` or `4` on machines with enough CPU/RAM.

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

## CORS

The API allows every origin by default in local development. For production,
set `DS_DASHBOARD_ALLOWED_ORIGINS` to a comma-separated list of frontend
origins, for example:

```bash
DS_DASHBOARD_ALLOWED_ORIGINS=https://dashboard.example
```

If `DATABASE_URL` is missing, the dashboard dev supervisor falls back to the
local database URL above. In production, missing database configuration is a
startup error.
