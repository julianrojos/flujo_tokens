-- Migration 049: Consumer name uniqueness per design system
-- Version: 049
-- PostgreSQL migration

CREATE UNIQUE INDEX IF NOT EXISTS idx_ds_consumers_ds_file_consumer_name_unique
  ON ds_consumers(ds_file_key, consumer_name);
