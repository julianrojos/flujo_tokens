---
name: ui-curation-governor
version: "1.1.0"
context:
  doc_type: frontend
  stage: frontend
compatible_agents:
  - codex
  - claude
  - gemini
requires_rules:
  - ui-architecture-boundaries
  - ui-style-contract
  - ui-component-governance
  - general-programming-principles
  - git-constraints
inputs:
  - name: target_paths
    type: path[]
    required: false
    default:
      - "apps/ds-dashboard/src/components"
      - "apps/ds-dashboard/src/features"
      - "apps/ds-dashboard/src/index.css"
      - "apps/ds-dashboard/tailwind.config.ts"
    description: "Paths under UI curation governance."
  - name: ui_registry_path
    type: path
    required: false
    default: "apps/ds-dashboard/docs/ui/COMPONENT_REGISTRY.md"
    description: "Canonical UI component registry."
outputs:
  - name: report
    type: report
    description: "Compliance report covering architecture, style, and governance."
---

# UI Curation Governor

## When to use this skill

Activate for **any** task that modifies files in:

- `apps/ds-dashboard/src/components/**` — UI primitives and composites
- `apps/ds-dashboard/src/features/**/*.tsx` — feature components
- `apps/ds-dashboard/src/index.css` — token foundation
- `apps/ds-dashboard/tailwind.config.ts` — token mapping
- `apps/ds-dashboard/docs/ui/COMPONENT_REGISTRY.md` — component catalog

This skill encodes the design identity and architecture rules for the DS Dashboard UI. It is the single source of truth for how the interface should look, feel, and be built.

---

## Context: What this app is

**Product:** A local-first dashboard for managing design systems — importing tokens from Figma, auditing naming quality, tracking component specs, running AI documentation jobs, and visualizing dependency impact.

**Audience:** Designers and design engineers who work with design tokens daily. They have trained eyes — generic interfaces feel cheap to them. The tool's credibility depends on its own interface quality.

**Core tension:** The app manages other people's design systems (Karmap/Iter, etc.) but must have its own independent visual identity. The app's tokens and the managed tokens must never cross-pollinate.

---

## Design Philosophy

### The identity: Dark SaaS for design professionals

Not "dark mode because it's trendy" — dark because this is a power tool. Designers spend hours in Figma's dark interface. This app sits alongside it. The dark surface creates focus; the typography creates warmth; the indigo accent creates trust.

### Three principles

**1. Token-sovereign:** Every visual value flows from `index.css` → `tailwind.config.ts` → components. Changing the app's look means editing one file, not hunting through features. The managed design systems' tokens never leak into the app's UI.

**2. Closed repertoire:** The component catalog is finite and curated. If a pattern isn't in the catalog, it doesn't exist — create a component or use an existing one. No ad-hoc `<div className="rounded-md border border-red-500/30...">` scattered across features.

**3. Layer discipline:** Primitives know nothing about features. Features know nothing about each other. Pages are dumb shells. This isn't bureaucracy — it's what makes the system changeable without fear.

---

## Design Decisions

### Color palette

| Role | Token | Value | Usage |
|------|-------|-------|-------|
| Background | `--app-bg` | `#0C0C0D` | Page background, deepest surface |
| Surface 1 | `--app-surface-1` | `#161618` | Cards, panels, sidebar |
| Surface 2 | `--app-surface-2` | `#1F1F22` | Inputs, muted areas, nested surfaces |
| Surface 3 | `--app-surface-3` | `#2A2A2E` | Hover states, active rows |
| Accent | `--app-accent` | `#6366F1` | Primary actions, focus rings, links |
| Accent hover | `--app-accent-hover` | `#818CF8` | Hover state for accent elements |
| Error | `--app-status-error-text` | `#F87171` | Error text, destructive actions |
| Success | `--app-status-success-text` | `#34D399` | Success messages, confirmations |
| Warning | `--app-status-warning-text` | `#FBBF24` | Warnings, caution states |

The palette intentionally avoids pure black (`#000`) — `#0C0C0D` has a subtle warm undertone that prevents the clinical feel of true black. Surfaces progress in 6-8% luminance steps for clear visual hierarchy without harsh contrast.

### Typography

| Element | Font | Weight | Rationale |
|---------|------|--------|-----------|
| Page headings (`h1`, `h2`) | Bitter (serif) | 600–700 | Warmth and personality in a dark interface. Serif headings on sans body creates intentional contrast — the app feels curated, not generated. |
| UI text, labels, body | Geist (sans) | 400–500 | Designed by Vercel for interfaces. Excellent legibility at small sizes in dark mode. Geometric but humanist. |
| Token paths, code values | Geist Mono | 400 | Technical content needs monospace. Geist Mono shares metrics with Geist — they sit together naturally. |

### Motion

| Token | Duration | Easing | Use case |
|-------|----------|--------|----------|
| `--app-motion-fast` | 150ms | ease-out | Hover states, toggles, micro-feedback |
| `--app-motion-base` | 250ms | ease-out | Panel reveals, content transitions |
| `--app-motion-slow` | 400ms | ease-in-out | Modal entrances, page transitions |

Motion exists to communicate state — not to decorate. Every animation must answer: "what changed and why?"

---

## Architecture: Layer model

```
Tier 0   Foundations     index.css, tailwind.config.ts
  ↓                     (tokens — the single source of visual truth)
Tier 1   Primitives      ui/button, ui/card, ui/input, ui/overlay/modal...
  ↓                     (generic building blocks, CVA + cn + forwardRef)
Tier 1.5 Composites      composites/page-header, composites/metric-card...
  ↓                     (shared layout patterns, compose only primitives)
Tier 2   Features        features/tokens/**, features/health/**...
  ↓                     (domain-specific, self-contained per feature)
Tier 3   Pages           route components
                         (dumb shells — layout + composition only)
```

Dependencies flow **downward only**. A primitive never knows about a feature. A feature never imports from another feature. Pages never contain business logic.

See `ui-architecture-boundaries.mdc` for detailed import rules.

---

## Component catalog

### Tier 1: Primitives

| Component | Path | Variants | Key props |
|-----------|------|----------|-----------|
| Button | `ui/button` | default, outline, ghost, destructive, loading | `variant`, `size`, `loading` |
| Badge | `ui/badge` | default, success, warning, neutral, error | `variant` |
| Card | `ui/card` | default, elevated, glass | `variant` |
| Input | `ui/input` | — | Standard HTML input props |
| Select | `ui/select` | — | Standard HTML select props |
| Table | `ui/table` | — | Composition: Table > TableHeader > TableRow > TableCell |
| StatusAlert | `ui/status-alert` | error, success, warning, info | `variant`, `title`, `description` |
| Loader | `ui/loader` | spinner, skeleton | `variant`, `size` |
| Modal | `ui/overlay/modal` | sm, md, lg, full | `open`, `onClose`, `zIndex` |
| MarkdownViewer | `ui/markdown-viewer` | — | `content`, `className` |
| Sidebar | `ui/sidebar` | — | 13 sub-components, collapsible |

### Tier 1.5: Composites

| Component | Path | Purpose |
|-----------|------|---------|
| PageHeader | `composites/page-header` | Page title (serif) + description + action slot |
| SectionHeader | `composites/section-header` | Section title + badge + action |
| MetricCard | `composites/metric-card` | Label + value + trend indicator |
| FilterBar | `composites/filter-bar` | Search input + filter slots + count badge |
| EmptyState | `composites/empty-state` | Icon + message + action for empty views |
| DataPanel | `composites/data-panel` | Card with header + scrollable content area |

Full reference: `apps/ds-dashboard/docs/ui/COMPONENT_REGISTRY.md`

---

## Mandatory patterns

### 1. Token-first styling

```tsx
// ✓ Always
<div className="bg-surface-1 text-foreground border-border" />
<Badge variant="error">Failed</Badge>
<StatusAlert variant="warning" title="Rate limited" />

// ✗ Never
<div className="bg-[#161618] text-white border-gray-700" />
<div className="rounded-md border border-red-500/30 bg-red-500/10 text-red-700">Failed</div>
<span className="text-amber-600">Rate limited</span>
```

### 2. CVA + cn() + forwardRef for primitives

See `ui-component-governance.mdc` for the full pattern. The short version: if it's in `ui/`, it uses CVA for variants, cn() for className composition, and forwardRef for DOM access.

### 3. Modal for all overlays

```tsx
// ✓ Always
<Modal open={isOpen} onClose={() => setIsOpen(false)}>
  <ModalContent size="lg">...</ModalContent>
</Modal>

// ✗ Never
{isMounted && createPortal(
  <div className="fixed inset-0 z-[1000]">...</div>,
  document.body
)}
```

### 4. Composites for repeated layout patterns

If you find yourself writing `flex items-center justify-between` + heading + action button for the third time — stop. Use `<PageHeader>` or `<SectionHeader>`. If the pattern doesn't exist, create a composite.

### 5. Registry for every new component

No component enters `ui/` or `composites/` without an entry in `COMPONENT_REGISTRY.md`. This is the catalog. If it's not in the catalog, it doesn't officially exist.

---

## Prohibited patterns

### Hardcoded colors in features

```
bg-red-*  bg-emerald-*  bg-amber-*  bg-green-*  bg-yellow-*
text-red-* text-emerald-* text-amber-* text-green-* text-yellow-*
border-red-* border-emerald-* border-amber-* border-green-* border-yellow-*
```

**No exceptions** for new code. Use `status-error`, `status-success`, `status-warning` tokens or wrap in `<StatusAlert>` / `<Badge>`.

### Inline structural styles

`style={{}}` for layout, colors, spacing, or borders. Allowed only for dynamic values that Tailwind cannot express (user-provided colors, calculated dimensions).

### Cross-feature imports

`features/X` importing from `features/Y`. Extract shared logic to `lib/`, `hooks/`, or `composites/`.

### `dark:` prefix

The app is always dark. The `dark:` prefix is dead code — it adds visual noise and suggests a toggle that doesn't exist.

### Duplicate `createPortal`

All portals go through `ui/overlay/modal.tsx`. Zero exceptions.

---

## Automation guard

Run this quick guard whenever a UI task touches `components/**`, `features/**`, `index.css`, or `tailwind.config.ts`:

```bash
npm run ds:ui:guard
```

What it enforces today:
- No raw status color classes (`text-red-*`, `bg-emerald-*`, etc.) inside `features/**`.
- No `dark:` prefix inside `features/**` (dark-first contract).
- No `createPortal` outside `components/ui/overlay/modal.tsx`.

Use this before final verification to catch regressions early.

---

## Quality gate: The credibility test

Before marking any UI task as complete, ask:

> Would a designer using this tool feel confident in the product's craft?

The audience builds design systems professionally. They notice:
- Inconsistent spacing between similar elements
- Color values that don't match across states
- Typography that switches fonts without reason
- Loading states that feel unfinished
- Status messages that look like afterthoughts

If any of these are present, the task is not complete.

---

## Pre-delivery checklist

Run before considering any UI change done:

### Structural

- [ ] No hardcoded colors in `features/` → `grep -rn "text-red-[0-9]\|bg-red-[0-9]\|border-red-[0-9]" src/features/ --include="*.tsx" | wc -l` returns 0
- [ ] No `createPortal` outside overlay → `grep -rn "createPortal" src/ --include="*.tsx" | grep -v "overlay/modal" | wc -l` returns 0
- [ ] No cross-feature imports → `grep -rn "from.*@/features/" src/components/ --include="*.tsx" | wc -l` returns 0

### Component quality

- [ ] New `ui/` components use CVA + cn() + forwardRef
- [ ] New components have entry in `COMPONENT_REGISTRY.md`
- [ ] No component exceeds ~10 props without justification
- [ ] Compositions use children/slots over configuration props

### Build

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] No duplicate Tailwind classes (e.g., `text-status-error text-status-error`)
- [ ] No `dark:` prefixes in new code

### Visual coherence

- [ ] Headings use `font-serif` (Bitter) via PageHeader/SectionHeader
- [ ] Status messages use `<StatusAlert>` or `<Badge>`, not inline markup
- [ ] Spacing is consistent within the feature being modified
- [ ] Empty states are handled (not blank screens)

---

## Companion rules

This skill works in conjunction with three `.mdc` rules that are automatically applied when editing UI files:

| Rule | Scope | Governs |
|------|-------|---------|
| `ui-architecture-boundaries.mdc` | `src/**/*.{ts,tsx}` | Layer isolation, import direction |
| `ui-style-contract.mdc` | `src/**/*.tsx` | Token usage, prohibited colors, portals, typography, motion |
| `ui-component-governance.mdc` | `src/components/**/*.tsx` | CVA pattern, registry, naming, a11y, orphan criteria |

When in doubt about a specific rule, check the relevant `.mdc` file — it has the authoritative detail.
