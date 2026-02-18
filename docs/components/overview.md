---
doc_type: overview
doc_status: ready
---

# Components

One page per component. This documentation is design-first (Figma) and token-backed (JSON).

## How to add a component

1. Create a spec: `docs/_spec/components/<Component>.yml` (copy from `_template.yml`)
2. Run: `/ds-component-doc component_name=<Component>`

## Definition of done

- Spec YAML exists in `docs/_spec/components/` for the component.
- YAML frontmatter present (`doc_type`, `doc_status`, `figma.*`)
- Summary filled (no TBD)
- Anatomy filled
- Properties table complete (matches Figma)
- Accessibility notes present
- Token mapping references real token keys
- `Discrepancias detectadas` included only when real mismatches exist
- Gaps / TBD empty or explicitly accepted

## Component list

- [Alert](alert.md)
- [Avatar](avatar.md)
- [Bottom Bar](bottom_bar.md)
- [Status Bar](status_bar.md)
