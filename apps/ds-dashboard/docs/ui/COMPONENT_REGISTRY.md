# DS Dashboard — Component Registry

The canonical catalog of all UI components. Every component in `src/components/ui/` and `src/components/composites/` must have an entry here. This file is the source of truth — if a component isn't here, it doesn't officially exist.

**Governance:** `ui-component-governance.mdc` · **Style:** `ui-style-contract.mdc` · **Architecture:** `ui-architecture-boundaries.mdc`

---

## Tier 0: Tokens

The design foundation. All visual values flow from here into components.

| Source | Purpose |
|--------|---------|
| `src/index.css` | Primitive color/spacing/motion variables (`--color-*`, `--font-*`) and semantic app tokens (`--app-*`) |
| `tailwind.config.ts` | Maps Tailwind utilities to `--app-*` vars. Never raw values. |

---

## Tier 1: Primitives

Generic, reusable building blocks. All follow **CVA + cn() + forwardRef** pattern.

### Badge

**Path:** `src/components/ui/badge.tsx`
**Import:** `import { Badge, badgeVariants } from "@/components/ui/badge"`

| Variant | Use case |
|---------|---------|
| `default` | Generic label with indigo accent |
| `success` | Confirmed, passing, healthy states |
| `warning` | Caution, partial, degraded states |
| `error` | Failed, blocked, critical states |
| `neutral` | Informational, secondary labels |

**Props:** `variant`, `className`, all `div` HTML attributes
**Use:** Status indicators, count labels, feature tags
**Don't use:** As a button, for interactive affordances

```tsx
<Badge variant="success">Valid</Badge>
<Badge variant="error">Failed</Badge>
```

---

### Button

**Path:** `src/components/ui/button.tsx`
**Import:** `import { Button, buttonVariants } from "@/components/ui/button"`

| Variant | Size | Notes |
|---------|------|-------|
| `default` | `sm` / `md` / `lg` | Primary action — indigo |
| `outline` | — | Secondary action |
| `ghost` | — | Tertiary, icon buttons |
| `destructive` | — | Irreversible actions |

**Special props:** `loading: boolean` — shows spinner and disables interaction
**Use:** All interactive triggers
**Don't use:** `<a>` links styled as buttons — use `asChild` or an anchor

```tsx
<Button variant="default" size="sm">Run pipeline</Button>
<Button variant="outline" loading={isRunning}>Syncing…</Button>
```

---

### Card

**Path:** `src/components/ui/card.tsx`
**Import:** `import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, cardVariants } from "@/components/ui/card"`

| Variant | Use case |
|---------|---------|
| `default` | Standard surface container |
| `elevated` | Prominent card with stronger shadow |
| `glass` | Subtle frosted-glass appearance |

**Composition:** `Card > CardHeader > (CardTitle + CardDescription)` + `CardContent` + `CardFooter`
**Use:** Data panels, form containers, section groupings
**Don't use:** For list items — use a `div` inside a list

```tsx
<Card variant="elevated">
  <CardHeader>
    <CardTitle>Token Count</CardTitle>
  </CardHeader>
  <CardContent>318 variables</CardContent>
</Card>
```

---

### Input

**Path:** `src/components/ui/input.tsx`
**Import:** `import { Input } from "@/components/ui/input"`

Standard text input with consistent styling. Passes all HTML `<input>` attributes.

**Use:** Text, URL, password, number, email inputs
**Don't use:** For boolean choices — use `<input type="checkbox">` directly (no Checkbox primitive yet)

```tsx
<Input type="url" placeholder="https://figma.com/…" value={url} onChange={…} />
<Input type="password" className="font-mono text-xs" placeholder="figd_…" />
```

---

### Loader

**Path:** `src/components/ui/loader.tsx`
**Import:** `import { Loader } from "@/components/ui/loader"`

| Variant | Size | Use case |
|---------|------|---------|
| `spinner` | `sm` / `md` / `lg` | Active loading operations |
| `skeleton` | `sm` / `md` / `lg` | Content placeholder while fetching |

**Accessibility:** Always include `role="status"` context
**Use:** Loading states at component level
**Don't use:** For button loading — use `Button` with `loading` prop

```tsx
<Loader variant="spinner" size="md" />
<Loader variant="skeleton" size="lg" />
```

---

### MarkdownViewer

**Path:** `src/components/ui/markdown-viewer.tsx`
**Import:** `import { MarkdownViewer } from "@/components/ui/markdown-viewer"`

Renders markdown content with `react-markdown` + `remark-gfm`. Dark prose styles via `prose-invert`.

**Props:** `content: string`, `className?: string`
**Use:** AI-generated doc previews, spec content, README-style content
**Don't use:** For user-editable content — use a textarea

```tsx
<MarkdownViewer content={docMarkdown} className="max-h-96 overflow-y-auto" />
```

---

### Modal

**Path:** `src/components/ui/overlay/modal.tsx`
**Import:** `import { Modal, ModalContent, ModalHeader, ModalFooter } from "@/components/ui/overlay"`

The **only** portal implementation. Handles scroll lock, escape key, backdrop, and z-index stacking.

| Size | Max width | Use case |
|------|-----------|---------|
| `sm` | 28rem | Confirmations, small forms |
| `md` | 42rem | Standard dialogs |
| `lg` | 56rem | Complex forms, previews |
| `full` | 96vw | Full-screen editors |

**Props:** `open: boolean`, `onClose: () => void`, `zIndex?: number`
**Composition:** `Modal > ModalContent > ModalHeader + {children} + ModalFooter`
**Use:** All modal dialogs, confirmation prompts, inline editors
**Don't use:** `createPortal` directly — always go through Modal

```tsx
<Modal open={isOpen} onClose={() => setIsOpen(false)}>
  <ModalContent size="lg">
    <ModalHeader>
      <h2 className="text-lg font-semibold">Dialog Title</h2>
    </ModalHeader>
    <div className="p-5">…content…</div>
    <ModalFooter>
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button onClick={onConfirm}>Confirm</Button>
    </ModalFooter>
  </ModalContent>
</Modal>
```

---

### Select

**Path:** `src/components/ui/select.tsx`
**Import:** `import { Select } from "@/components/ui/select"`

Standard `<select>` wrapper with consistent styling. Always add `className="w-full"` when full-width is needed (not default).

**Use:** Dropdown choices with known options
**Don't use:** For async/searchable options — use a combobox pattern

```tsx
<Select className="w-full" value={format} onChange={(e) => setFormat(e.target.value)}>
  <option value="png">PNG</option>
  <option value="svg">SVG</option>
</Select>
```

---

### Sidebar

**Path:** `src/components/ui/sidebar.tsx`
**Import:** `import { Sidebar, SidebarContent, … } from "@/components/ui/sidebar"`

13 sub-components for the collapsible app navigation. Based on shadcn/ui sidebar primitive with app token integration.

**Sub-components:** `Sidebar`, `SidebarContent`, `SidebarFooter`, `SidebarGroup`, `SidebarGroupContent`, `SidebarGroupLabel`, `SidebarHeader`, `SidebarMenu`, `SidebarMenuButton`, `SidebarMenuItem`, `SidebarProvider`, `SidebarTrigger`, `useSidebar`
**Use:** App-level navigation only
**Don't use:** For in-page navigation — use tabs or a nav section

---

### SortableTableHead

**Path:** `src/components/ui/sortable-table-head.tsx`
**Import:** `import { SortableTableHead } from "@/components/ui/sortable-table-head"`

`TableHead` with a sort trigger button and `ArrowUpDown` icon.

**Props:** `label: ReactNode`, `onSort: () => void`, `className?`, `buttonClassName?`, `ariaLabel?`
**Use:** Sortable column headers in data tables
**Don't use:** For non-sortable columns — use `TableHead` directly

```tsx
<SortableTableHead
  label="Token name"
  onSort={() => handleSort("name")}
  ariaLabel="Sort by token name"
/>
```

---

### StatusAlert

**Path:** `src/components/ui/status-alert.tsx`
**Import:** `import { StatusAlert, StatusAlertTitle, StatusAlertDescription } from "@/components/ui/status-alert"`

| Variant | Token | Use case |
|---------|-------|---------|
| `error` | `status-error` | Blocking errors, failures |
| `success` | `status-success` | Confirmations, completions |
| `warning` | `status-warning` | Caution, non-blocking issues |
| `info` | `accent` | Contextual information |

**Accessibility:** Renders with `role="alert"` — screen readers announce immediately
**Props:** `variant`, `title?`, `description?`, `className`
**Use:** Any status feedback to the user — replaces all `border-red-*/bg-red-*` inline patterns
**Don't use:** `<Badge>` for multi-line messages

```tsx
<StatusAlert variant="error" title="Sync failed" description={error.message} />
<StatusAlert variant="success">Spec saved successfully.</StatusAlert>
```

---

### Table

**Path:** `src/components/ui/table.tsx`
**Import:** `import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"`

Composition-based table with consistent dark-mode styling.

**Sub-components:** `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead` (accepts `showSortIcon`), `TableCell`
**Use:** Structured data — token lists, component specs, diff views
**Don't use:** For layout — use CSS grid/flex

```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Value</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell className="font-mono">--color-primary</TableCell>
      <TableCell>#6366F1</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

---

## Tier 1.5: Composites

Shared layout patterns built from Tier 1 primitives. Never import from `features/`.

### DataPanel

**Path:** `src/components/composites/data-panel.tsx`
**Import:** `import { DataPanel } from "@/components/composites/data-panel"`

Card with a sticky header and scrollable content area.

**Props:** `title: string`, `action?: ReactNode`, `className?`, `children`
**Use:** Lists and data displays that need constrained height with scrolling
**Don't use:** For static content that doesn't scroll

---

### EmptyState

**Path:** `src/components/composites/empty-state.tsx`
**Import:** `import { EmptyState } from "@/components/composites/empty-state"`

Icon + message + optional action for empty views. Prevents blank screens.

**Props:** `icon?: LucideIcon`, `title: string`, `description?: string`, `action?: ReactNode`
**Use:** Every list/table that can be empty
**Don't use:** For loading states — use `Loader`

```tsx
<EmptyState
  icon={Package}
  title="No components yet"
  description="Import from Figma to get started."
  action={<Button>Import</Button>}
/>
```

---

### FilterBar

**Path:** `src/components/composites/filter-bar.tsx`
**Import:** `import { FilterBar } from "@/components/composites/filter-bar"`

Search input + filter slots + result count badge.

**Props:** `searchValue?`, `onSearchChange?`, `placeholder?`, `filters?: ReactNode`, `count?: number`, `className?`
**Use:** Header of any filterable list or table
**Don't use:** When there's no search or filter — use `SectionHeader`

---

### MetricCard

**Path:** `src/components/composites/metric-card.tsx`
**Import:** `import { MetricCard } from "@/components/composites/metric-card"`

Label + numeric value + optional trend indicator.

**Props:** `label: string`, `value: string | number`, `trend?: "up" | "down" | "neutral"`, `className?`
**Use:** Dashboard stat boxes, health score summaries
**Don't use:** For non-numeric content — use `Card`

---

### PageHeader

**Path:** `src/components/composites/page-header.tsx`
**Import:** `import { PageHeader } from "@/components/composites/page-header"`

Page-level heading in Bitter (serif) with optional description and action slot.

**Props:** `title: string`, `description?: string`, `action?: ReactNode`, `className?`
**Use:** Top of every page — `<h1>` with consistent typography
**Don't use:** For section headers — use `SectionHeader`

```tsx
<PageHeader
  title="Design Systems Admin"
  description="Manage and configure your connected design systems."
  action={<Button>Add System</Button>}
/>
```

---

### SectionHeader

**Path:** `src/components/composites/section-header.tsx`
**Import:** `import { SectionHeader } from "@/components/composites/section-header"`

Section title + optional badge + optional action. Uses `<h2>`.

**Props:** `title: string`, `badge?: ReactNode`, `action?: ReactNode`, `className?`
**Use:** Section groupings within a page
**Don't use:** For the main page title — use `PageHeader`

```tsx
<SectionHeader
  title="Active Tokens"
  badge={<Badge variant="neutral">{count}</Badge>}
  action={<Button variant="outline" size="sm">Export</Button>}
/>
```

---

## Deprecation policy

1. Add `@deprecated` JSDoc with migration path and target removal date.
2. Add deprecation notice in this file under the component entry.
3. Migrate all consumers within 2 sprints.
4. Delete only after 0 remaining consumers — verify with:
   ```bash
   grep -rn "ComponentName" apps/ds-dashboard/src/ --include="*.tsx" | wc -l
   ```

---

*Last updated: 2026-03-20 — mirrors working-tree state post UI overhaul.*
