# PostgreSQL migrations (`migrations-pg`)

This directory is the canonical migration source for `ds-dashboard` on PostgreSQL.

## Numbering policy

- Files keep a monotonic sequence (`001` ... current latest).
- Sequence numbers are not reused and are never renumbered once introduced.
- Some versions are intentionally no-op or "removed" markers to preserve ordering/history from previous SQLite-era changes and avoid version drift across environments.

## Why some files are no-op markers

Examples: `008_*_removed.sql`, `011_*_removed.sql`, `012_*_removed.sql`, `014_*_removed.sql`, `025_noop_reserved.sql`.

They exist to:

- preserve migration version compatibility,
- keep the migration ledger deterministic,
- document that specific staging/legacy steps were intentionally removed in PostgreSQL.

## Operational note

`schema_migrations.version` is the source of truth. Do not delete, reorder, or rename existing migration files after they are applied in any environment.
