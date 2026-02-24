# ds-dashboard server

This directory contains the independent Hono API backend for the Design System Dashboard.

## Testing the API in isolation

You can run and test the API completely decoupled from the Vite frontend.

```bash
# Levantar solo la API (sin Vite) en el puerto 8787
npm run dev:api

# Correr tests de rutas (o tests unitarios)
node --test server/routes/*.test.mjs

# Testear endpoints con curl directamente
curl http://localhost:8787/api/component-registry
```
