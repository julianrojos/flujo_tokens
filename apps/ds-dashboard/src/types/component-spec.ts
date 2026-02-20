export interface SpecProperty {
  name: string;
  type: string;
  values?: string[];
  default: string | boolean | null;
  required: boolean;
  description: string;
}

export interface SpecAnatomyItem {
  id: string;
  description: string;
}

export interface ComponentSpec {
  name: string;
  status: "draft" | "ready" | string;
  figma: {
    file: string;
    page: string;
    component_set: string;
    component_set_node_id?: string;
  };
  summary: {
    purpose: string;
    when_to_use: string;
    when_not_to_use: string;
  };
  anatomy: SpecAnatomyItem[];
  properties: SpecProperty[];
  content_guidelines: { rules: string[] };
  best_practices: { do: string[]; dont: string[] };
  accessibility: {
    role: string;
    focus?: { tokens?: { inner?: string; outer?: string } };
    hit_area?: { desktop_token?: string; mobile_token?: string };
    labeling?: { rules?: string[] };
  };
  token_mapping: Record<string, Record<string, string>>;
  qa: string[];
  related_components?: string[];
}
