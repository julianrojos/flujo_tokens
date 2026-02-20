export interface TokenGraphVizNode {
  id: string;
  path: string;
  slashPath: string;
  cssVar: string;
  type: string;
  collection: string;
  resolvedValue: string;
  displayKey: string;
  inDegree: number;
  outDegree: number;
  isCycleMember: boolean;
}

export interface TokenGraphVizEdge {
  source: string;
  target: string;
}

export interface TokenGraphVizCycle {
  kind: "strongly_connected_component" | "self_loop";
  size: number;
  nodes: string[];
  node_ids: string[];
}

export interface TokenGraphViz {
  ok: boolean;
  source: {
    registry_path: string;
  };
  summary: {
    nodes: number;
    edges: number;
    cycles: number;
    cycle_nodes: number;
    unresolved_css_var_refs_total: number;
    ambiguous_css_vars_total: number;
    graph_collisions: number;
  };
  nodes: TokenGraphVizNode[];
  edges: TokenGraphVizEdge[];
  cycles: TokenGraphVizCycle[];
  cycle_node_ids: string[];
  fingerprint: string;
}

