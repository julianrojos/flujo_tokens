-- Migration 003: Remove legacy sync/stale configuration columns from ds_consumers
-- These columns (sync_interval_hours, max_stale_hours) were never used for actual configuration.
-- Stale threshold is now a fixed internal constant (DEFAULT_CONSUMER_STALE_HOURS = 72).
-- This migration removes unused configuration columns and does not change sync/report behavior.
-- Requires SQLite >= 3.35.0 for ALTER TABLE ... DROP COLUMN.

ALTER TABLE ds_consumers DROP COLUMN sync_interval_hours;
ALTER TABLE ds_consumers DROP COLUMN max_stale_hours;
