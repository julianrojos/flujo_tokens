-- Migration 042: persist Figma instance dependencies for component graph
CREATE TABLE IF NOT EXISTS component_figma_instance_dependencies (
  id                     BIGSERIAL PRIMARY KEY,
  component_id           BIGINT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  instance_node_id       TEXT NOT NULL,
  instance_node_name     TEXT NOT NULL,
  used_component_node_id TEXT NOT NULL,
  used_component_name     TEXT NOT NULL,
  used_component_key      TEXT NOT NULL DEFAULT '',
  status                 TEXT NOT NULL DEFAULT 'resolved' CHECK (status IN ('resolved', 'unresolved')),
  run_id                 TEXT,
  captured_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  schema_version         INTEGER NOT NULL DEFAULT 1,
  UNIQUE(component_id, instance_node_id, used_component_node_id, used_component_key)
);

CREATE INDEX IF NOT EXISTS idx_component_figma_instance_dependencies_component_id
  ON component_figma_instance_dependencies(component_id);
CREATE INDEX IF NOT EXISTS idx_component_figma_instance_dependencies_component_run
  ON component_figma_instance_dependencies(component_id, run_id);
CREATE INDEX IF NOT EXISTS idx_component_figma_instance_dependencies_used_node
  ON component_figma_instance_dependencies(used_component_node_id);
