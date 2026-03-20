# Component Registry v1

Design System Dashboard — UI Component Catalog

---

## Governance Check

Run `npm run ds:ui:guard` after any UI change to enforce core UI contract checks:
- no raw status colors in `features/**`
- no `dark:` variants in `features/**`
- no `createPortal` outside `ui/overlay/modal.tsx`

---

## Table of Contents

1. [Tier 0 — Foundations](#tier-0--foundations)
2. [Tier 1 — Primitives](#tier-1--primitives)
3. [Tier 1.5 — Composites](#tier-15--composites)
4. [Tier 2 — Feature Components](#tier-2--feature-components)
5. [Deprecation Policy](#deprecation-policy)

---

## Tier 0 — Foundations

### Token System

All UI components consume CSS custom properties defined in `apps/ds-dashboard/src/index.css`.

#### Color Primitives

| Token | Value | Usage |
|-------|-------|-------|
| `--color-gray-0` – `--color-gray-12` | #0c0c0d → #fafafa | Base grayscale |
| `--color-indigo-1` – `--color-indigo-9` | Indigo scale | Accent colors |
| `--color-red-1` – `--color-red-7` | Red scale | Error states |
| `--color-emerald-1` – `--color-emerald-6` | Emerald scale | Success states |
| `--color-amber-1` – `--color-amber-6` | Amber scale | Warning states |

#### Semantic Tokens

| Token | Maps To | Usage |
|-------|---------|-------|
| `--app-bg` | `--color-gray-0` | Page background |
| `--app-surface-1` | `--color-gray-1` | Card/panel background |
| `--app-surface-2` | `--color-gray-2` | Elevated surfaces |
| `--app-surface-3` | `--color-gray-3` | Nested surfaces |
| `--app-surface-glass` | `rgba(22,22,24,0.85)` | Glassmorphism |
| `--app-surface-elevated` | `--color-gray-2` | Elevated cards |
| `--app-text` | `--color-gray-12` | Primary text |
| `--app-text-muted` | `--color-gray-9` | Secondary text |
| `--app-text-subtle` | `--color-gray-7` | Tertiary text |
| `--app-accent` | `--color-indigo-5` | Primary actions |
| `--app-accent-hover` | `--color-indigo-6` | Hover states |
| `--app-accent-fg` | `--color-gray-0` | Text on accent |
| `--app-border` | `--color-gray-4` | Default borders |
| `--app-border-soft` | `rgba(106,106,112,0.4)` | Subtle borders |
| `--app-border-focus` | `--color-indigo-5` | Focus rings |
| `--app-status-error-*` | Red scale | Error states |
| `--app-status-success-*` | Emerald scale | Success states |
| `--app-status-warning-*` | Amber scale | Warning states |

#### Motion Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--app-motion-fast` | 150ms | Micro-interactions |
| `--app-motion-base` | 250ms | Standard transitions |
| `--app-motion-slow` | 400ms | Complex animations |

#### Typography Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--font-sans` | Geist | UI text |
| `--font-serif` | Bitter | Headings |
| `--font-mono` | Geist Mono | Code |

---

## Tier 1 — Primitives

Location: `apps/ds-dashboard/src/components/ui/`

### Button

**Path:** `ui/button.tsx`

**Variants:** `default`, `outline`, `ghost`, `destructive`, `loading`
**Sizes:** `default`, `sm`

```tsx
<Button variant="default" size="default">Click me</Button>
```

**When to use:** Interactive actions, form submissions, triggers.
**When NOT to use:** Navigation links (use `<Link>`), toggles (use `<Switch>` or `<Checkbox>`).

---

### Badge

**Path:** `ui/badge.tsx`

**Variants:** `default`, `success`, `warning`, `neutral`, `error`

```tsx
<Badge variant="success">Active</Badge>
```

**When to use:** Status indicators, labels, tags.
**When NOT to use:** Interactive elements (use Button), long text (truncate first).

---

### Card

**Path:** `ui/card.tsx`

**Variants:** `default`, `elevated`, `glass`

**Sub-components:** `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`

```tsx
<Card variant="elevated">
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>Content here</CardContent>
</Card>
```

**When to use:** Grouping related content, containers for metrics, settings panels.
**When NOT to use:** Simple lists (use native ul/ol), full-page layouts.

---

### Input

**Path:** `ui/input.tsx`

**Types:** All HTML input types via `type` prop.

```tsx
<Input type="text" placeholder="Enter name" />
```

**When to use:** Text input, email, password, search, number inputs.
**When NOT to use:** Multi-line text (use Textarea), select options (use Select).

---

### Select

**Path:** `ui/select.tsx`

```tsx
<Select>
  <option value="1">Option 1</option>
</Select>
```

**When to use:** Dropdown selection from predefined options.
**When NOT to use:** Single toggle (use Checkbox), many options (>50, consider custom dropdown).

---

### Table

**Path:** `ui/table.tsx`

**Sub-components:** `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`

```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Data</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

**When to use:** Tabular data, sortable lists with multiple columns.
**When NOT to use:** Single column lists (use ul/ol), layout purposes.

---

### SortableTableHead

**Path:** `ui/sortable-table-head.tsx`

```tsx
<SortableTableHead label="Name" onSort={() => setSort('name')} />
```

**When to use:** Clickable column headers with sort icon.
**When NOT to use:** Non-sortable columns (use TableHead).

---

### Sidebar

**Path:** `ui/sidebar.tsx`

**Sub-components:** `SidebarProvider`, `Sidebar`, `SidebarInset`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`, `SidebarGroup`, `SidebarGroupContent`, `SidebarGroupLabel`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarTrigger`

```tsx
<SidebarProvider>
  <Sidebar>
    <SidebarHeader>Logo</SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Navigation</SidebarGroupLabel>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton isActive>Dashboard</SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
  <SidebarInset>Main content</SidebarInset>
</SidebarProvider>
```

**When to use:** App navigation, collapsible side panels.
**When NOT to use:** Top navigation (use Header), mobile drawer (use Dialog).

---

### Modal (Overlay)

**Path:** `ui/overlay/modal.tsx`

**Sub-components:** `Modal`, `ModalContent`, `ModalHeader`, `ModalFooter`

**Sizes:** `sm`, `md`, `lg`, `full`

```tsx
<Modal open={isOpen} onClose={() => setIsOpen(false)}>
  <ModalContent size="lg">
    <ModalHeader>
      <h3>Title</h3>
    </ModalHeader>
    <div>Content</div>
    <ModalFooter>
      <Button>Actions</Button>
    </ModalFooter>
  </ModalContent>
</Modal>
```

**When to use:** Dialogs, confirmations, forms requiring focus.
**When NOT to use:** Non-blocking notifications (use Toast), simple confirmations (consider native confirm for dev tools).

---

### StatusAlert

**Path:** `ui/status-alert.tsx`

**Variants:** `error`, `success`, `warning`, `info`

**Sub-components:** `StatusAlertTitle`, `StatusAlertDescription`

```tsx
<StatusAlert variant="error" title="Error" description="Something went wrong" />
```

**When to use:** Form validation errors, operation results, system notifications.
**When NOT to use:** Inline validation (use FormField), non-blocking toasts.

---

### Loader

**Path:** `ui/loader.tsx`

**Variants:** `spinner`, `skeleton`
**Sizes:** `sm`, `md`, `lg`

```tsx
<Loader variant="spinner" size="md" />
<Loader variant="skeleton" size="lg" className="w-full" />
```

**When to use:** Loading states, async operations, content placeholders.
**When NOT to use:** Progress with percentage (use ProgressBar), instant operations (<100ms).

---

### MarkdownViewer

**Path:** `ui/markdown-viewer.tsx`

```tsx
<MarkdownViewer content="# Hello" />
```

**When to use:** Rendering markdown content, documentation, README files.
**When NOT to use:** User input without sanitization, plain text.

---

## Tier 1.5 — Composites

Location: `apps/ds-dashboard/src/components/composites/`

### PageHeader

**Path:** `composites/page-header.tsx`

**Props:** `title`, `description?`, `actions?`

```tsx
<PageHeader
  title="Tokens"
  description="Manage design tokens"
  actions={<Button>Refresh</Button>}
/>
```

**When to use:** Page-level headers with title, description, and actions.
**When NOT to use:** Section headers (use SectionHeader), card headers (use CardHeader).

---

### SectionHeader

**Path:** `composites/section-header.tsx`

**Props:** `title`, `badge?`, `action?`

```tsx
<SectionHeader
  title="Properties"
  badge={<Badge>12</Badge>}
  action={<Button size="sm">Add</Button>}
/>
```

**When to use:** Section headers within pages, grouped content headers.
**When NOT to use:** Page titles (use PageHeader), card titles (use CardTitle).

---

### MetricCard

**Path:** `composites/metric-card.tsx`

**Props:** `label`, `value`, `change?`, `trend?`, `icon?`

```tsx
<MetricCard
  label="Total Tokens"
  value={248}
  change="+12%"
  trend="up"
  icon={<Layers3 />}
/>
```

**When to use:** Dashboard metrics, KPI displays, summary statistics.
**When NOT to use:** Detailed data (use Table), non-numeric values without context.

---

### FilterBar

**Path:** `composites/filter-bar.tsx`

**Props:** `searchValue?`, `onSearch?`, `count?`, `children`

```tsx
<FilterBar
  searchValue={query}
  onSearch={setQuery}
  count={items.length}
>
  <Select>{/* filters */}</Select>
</FilterBar>
```

**When to use:** Data table filters, search + filter combinations.
**When NOT to use:** Simple search (use Input alone), complex filter panels (use dedicated component).

---

### EmptyState

**Path:** `composites/empty-state.tsx`

**Props:** `icon?`, `title`, `description?`, `action?`

**Sub-components:** `EmptyStateAction`

```tsx
<EmptyState
  icon={Inbox}
  title="No tokens found"
  description="Try adjusting your filters"
  action={
    <EmptyStateAction onClick={resetFilters}>
      Reset Filters
    </EmptyStateAction>
  }
/>
```

**When to use:** Empty search results, no data states, onboarding prompts.
**When NOT to use:** Error states (use StatusAlert), loading states (use Loader).

---

### DataPanel

**Path:** `composites/data-panel.tsx`

**Sub-components:** `DataPanel`, `DataPanelHeader`, `DataPanelContent`, `DataPanelFooter`

```tsx
<DataPanel>
  <DataPanelHeader
    title="Token Details"
    description="Property information"
    actions={<Button>Edit</Button>}
  />
  <DataPanelContent>
    {/* Table or content */}
  </DataPanelContent>
  <DataPanelFooter>
    <Button>Save</Button>
  </DataPanelFooter>
</DataPanel>
```

**When to use:** Detail views, data tables with headers/footers, settings panels.
**When NOT to use:** Simple cards (use Card), full-page layouts.

---

## Tier 2 — Feature Components

Location: `apps/ds-dashboard/src/features/`

### Tokens Feature

| Component | Path | Description |
|-----------|------|-------------|
| `TokensPage` | `features/tokens/tokens-page.tsx` | Main tokens list view |
| `ContrastCheckerModal` | `features/tokens/accessibility/contrast-checker-modal.tsx` | WCAG contrast checker |
| `ColorPreview` | `features/tokens/accessibility/color-preview.tsx` | Color contrast preview |
| `TokenTree` | `features/tokens/token-tree/token-tree.tsx` | Token dependency tree |

### Components Feature

| Component | Path | Description |
|-----------|------|-------------|
| `ComponentsPage` | `features/components/components-page.tsx` | Components registry view |
| `ComponentDetail` | `features/components/component-detail/component-detail.tsx` | Component detail view |
| `FigmaCaptureModal` | `features/components/component-detail/figma-capture-modal.tsx` | Figma screenshot capture |

### Health Feature

| Component | Path | Description |
|-----------|------|-------------|
| `HealthPage` | `features/health/health-page.tsx` | Health dashboard |
| `HealthIssuesList` | `features/health/health-issues-list.tsx` | Issues table |

### Command Palette

| Component | Path | Description |
|-----------|------|-------------|
| `GlobalCommandPalette` | `features/command-palette/global-command-palette.tsx` | Global search/actions |

---

## Deprecation Policy

### Process

1. **Mark as deprecated:** Add `@deprecated` JSDoc with migration path.
2. **Document:** Add deprecation notice in this registry.
3. **Wait period:** 2 sprints minimum.
4. **Audit:** Find and migrate all usages.
5. **Remove:** Delete component after migration.

### Current Deprecations

None as of v1.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-20 | Initial registry |
