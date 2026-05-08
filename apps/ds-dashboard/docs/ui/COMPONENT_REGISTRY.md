# DS Dashboard — Component Registry

Canonical catalog of UI components for the DS Dashboard app.

This file is the single source of truth for UI tiers and component registration.

**Governance references:** `ui-component-governance.mdc` · `ui-style-contract.mdc` · `ui-architecture-boundaries.mdc`

---

## Governance Check

Follow the UI governance rules in `.agents/rules/ui-component-governance.mdc` and `.agents/rules/ui-style-contract.mdc` when changing dashboard components.

---

## Table of Contents

1. [Tier 0 — Base Tokens](#tier-0--base-tokens)
2. [Tier 1 — Primitives](#tier-1--primitives)
3. [Tier 1.5 — Composites](#tier-15--composites)
4. [Tier 2 — Feature Components](#tier-2--feature-components)
5. [Deprecation Policy](#deprecation-policy)

---

## Tier 0 — Base Tokens

### Token System

All UI components consume CSS custom properties defined in `apps/ds-dashboard/src/index.css`.

#### Color Primitives

| Token                                     | Value             | Usage          |
| ----------------------------------------- | ----------------- | -------------- |
| `--color-gray-0` – `--color-gray-12`      | #0c0c0d → #fafafa | Base grayscale |
| `--color-indigo-1` – `--color-indigo-9`   | Indigo scale      | Accent colors  |
| `--color-red-1` – `--color-red-7`         | Red scale         | Error states   |
| `--color-emerald-1` – `--color-emerald-6` | Emerald scale     | Success states |
| `--color-amber-1` – `--color-amber-6`     | Amber scale       | Warning states |

#### Semantic Tokens

| Token                    | Maps To                 | Usage                 |
| ------------------------ | ----------------------- | --------------------- |
| `--app-bg`               | `--color-gray-0`        | Page background       |
| `--app-surface-1`        | `--color-gray-1`        | Card/panel background |
| `--app-surface-2`        | `--color-gray-2`        | Elevated surfaces     |
| `--app-surface-3`        | `--color-gray-3`        | Nested surfaces       |
| `--app-surface-glass`    | `rgba(22,22,24,0.85)`   | Glassmorphism         |
| `--app-surface-elevated` | `--color-gray-2`        | Elevated cards        |
| `--app-text`             | `--color-gray-12`       | Primary text          |
| `--app-text-muted`       | `--color-gray-9`        | Secondary text        |
| `--app-text-subtle`      | `--color-gray-7`        | Tertiary text         |
| `--app-accent`           | `--color-indigo-5`      | Primary actions       |
| `--app-accent-hover`     | `--color-indigo-6`      | Hover states          |
| `--app-accent-fg`        | `--color-gray-0`        | Text on accent        |
| `--app-border`           | `--color-gray-4`        | Default borders       |
| `--app-border-soft`      | `rgba(106,106,112,0.4)` | Subtle borders        |
| `--app-border-focus`     | `--color-indigo-5`      | Focus rings           |
| `--app-status-error-*`   | Red scale               | Error states          |
| `--app-status-success-*` | Emerald scale           | Success states        |
| `--app-status-warning-*` | Amber scale             | Warning states        |

#### Motion Tokens

| Token               | Value | Usage                |
| ------------------- | ----- | -------------------- |
| `--app-motion-fast` | 150ms | Micro-interactions   |
| `--app-motion-base` | 250ms | Standard transitions |
| `--app-motion-slow` | 400ms | Complex animations   |

#### Typography Tokens

| Token           | Value      | Usage    |
| --------------- | ---------- | -------- |
| `--font-titles` | Geist      | Headings |
| `--font-body`   | Geist      | UI text  |
| `--font-mono`   | Geist Mono | Code     |

---

## Tier 1 — Primitives

Location: `apps/ds-dashboard/src/components/ui/`

### Button

**Path:** `src/components/ui/button.tsx`

**Variants:** `default`, `outline`, `ghost`, `destructive`, `loading`
**Sizes:** `default`, `sm`

```tsx
<Button variant="default" size="default">
  Click me
</Button>
```

**When to use:** Interactive actions, form submissions, triggers. Use `destructive` for the final confirm action in irreversible or high-impact flows such as delete, revoke, or permanent removal operations.
**When NOT to use:** Text links (use plain `<Link>`), toggles (use `<Switch>` or `<Checkbox>`), generic emphasis that is not destructive.

#### Destructive Button Rule

- Use `Button variant="destructive"` for the confirm action when the user is about to lose data, access, or a relationship.
- Keep the cancel or close action neutral with a non-destructive variant such as `outline` or `ghost`.
- Keep the label explicit: `Delete system`, `Remove consumer`, `Revoke access`.
- Do not create local red button styles outside `Button`.
- Do not use `destructive` for actions that are only important or attention-grabbing.

#### Button-like Links (Navigation CTA Pattern)

Use this pattern only when a navigation link must look like a button.

```tsx
import { Link } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';

<Link
  to="/target"
  className={buttonVariants({ variant: 'outline', size: 'sm' })}
>
  Open target
</Link>;
```

Rules:

- Use `Link` semantics for navigation (no `button` wrapping links).
- Reuse `buttonVariants(...)` instead of manual utility classes.
- Keep plain text links as regular `Link` (do not force button styling globally).

---

### Badge

**Path:** `src/components/ui/badge.tsx`

**Variants:** `default`, `success`, `warning`, `neutral`, `error`

```tsx
<Badge variant="success">Active</Badge>
```

**When to use:** Status indicators, labels, tags.
**When NOT to use:** Interactive elements (use Button), long text (truncate first).

---

### ImpactLevelBadge

**Path:** `src/components/ui/impact-level-badge.tsx`

**Variants:** `CRITICAL`, `HIGH`, `MEDIUM`, `LOW` (via `level`)

```tsx
<ImpactLevelBadge level="HIGH" />
```

**When to use:** Impact severity labels in consumers/dependency analysis views.
**When NOT to use:** Generic status messaging where `Badge` or `StatusAlert` is more appropriate.

---

### Card

**Path:** `src/components/ui/card.tsx`

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

### Checkbox

**Path:** `src/components/ui/checkbox.tsx`

**Props:** All native `<input type="checkbox">` attributes plus:

| Prop | Type | Description |
|------|------|-------------|
| `label` | `ReactNode` | Renders the input inside a clickable `<label>` row. `className` targets the wrapper. |
| `inputClassName` | `string` | Always targets the inner `<input>`, regardless of `label`. |
| `indeterminate` | `boolean` | Sets the native `indeterminate` DOM property — the "dash" state for partial selections. Synced via a callback ref. |

```tsx
{/* Basic controlled checkbox */}
<Checkbox
  id="confirm"
  checked={confirmed}
  onChange={(e) => setConfirmed(e.target.checked)}
  label="I understand the impact and want to continue"
/>

{/* Select-all with indeterminate state */}
<Checkbox
  checked={allSelected}
  indeterminate={someSelected && !allSelected}
  onChange={() => allSelected ? deselectAll() : selectAll()}
  aria-label="Select all items"
/>
```

**When to use:** Boolean on/off toggles in forms, confirmation dialogs, and multi-select list headers.
**When NOT to use:** Simple toggles that are not part of a form (use Switch).

---

### FigmaConnectionStatusDot

**Path:** `src/components/ui/connection-status-dot.tsx`

**Variants (CVA):** `tone` — `success | warning | error`; `size` — `sm`

```tsx
import { useFigmaMcpStatus } from '@/lib/figma-mcp-status-context';

const { connectionState } = useFigmaMcpStatus();

<FigmaConnectionStatusDot snapshot={connectionState} size="sm" />
```

**When to use:** Inline status dot showing live Figma MCP connection health (sidebar, headers). Consume `connectionState` from `useFigmaMcpStatus()` — do not create a separate poller.
**When NOT to use:** Text labels or full status alerts (use `StatusAlert` or `Badge`), decorative purposes without a real connection snapshot.

---

### Input

**Path:** `src/components/ui/input.tsx`

**Types:** All HTML input types via `type` prop.

```tsx
<Input type="text" placeholder="Enter name" />
```

**When to use:** Text input, email, password, search, number inputs.
**When NOT to use:** Multi-line text (use Textarea), select options (use Select).

---

### Select

**Path:** `src/components/ui/select.tsx`

```tsx
<Select>
  <option value="1">Option 1</option>
</Select>
```

**When to use:** Dropdown selection from predefined options.
**When NOT to use:** Single toggle (use Checkbox), many options (>50, consider custom dropdown).

---

### Table

**Path:** `src/components/ui/table.tsx`

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

**Path:** `src/components/ui/sortable-table-head.tsx`

```tsx
<SortableTableHead label="Name" onSort={() => setSort('name')} />
```

**When to use:** Clickable column headers with sort icon.
**When NOT to use:** Non-sortable columns (use TableHead).

---

### Sidebar

**Path:** `src/components/ui/sidebar.tsx`

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

**Path:** `src/components/ui/overlay/modal.tsx`

**Sub-components:** `Modal`, `ModalContent`, `ModalHeader`, `ModalFooter`, `ModalCloseButton`

**Sizes:** `sm`, `md`, `lg`, `full`

```tsx
<Modal open={isOpen} onClose={() => setIsOpen(false)}>
  <ModalContent size="lg">
    <ModalHeader>
      <h3>Title</h3>
      <ModalCloseButton onClick={() => setIsOpen(false)} />
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

**Path:** `src/components/ui/status-alert.tsx`

**Variants:** `error`, `success`, `warning`, `info`

**Sub-components:** `StatusAlertTitle`, `StatusAlertDescription`

```tsx
<StatusAlert variant="error" title="Error" description="Something went wrong" />
```

**When to use:** Form validation errors, operation results, system notifications.
**When NOT to use:** Inline validation (use FormField), non-blocking toasts.

---

### Loader

**Path:** `src/components/ui/loader.tsx`

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

**Path:** `src/components/ui/markdown-viewer.tsx`

```tsx
<MarkdownViewer content="# Hello" />
```

**When to use:** Rendering markdown content, documentation, README files.
**When NOT to use:** User input without sanitization, plain text.

---

### FormField

**Path:** `src/components/common/form-field.tsx`

**Props:** `label?`, `hint?`, `error?`, `required?`, `hideLabel?`, `id?`

```tsx
<FormField id="name" label="Name" required>
  <Input id="name" />
</FormField>
```

**When to use:** Standard label/control stacks for inputs, textareas, and selects, especially when a hint or error message sits below the control.
**When NOT to use:** Read-only metadata, captions, or custom layouts that do not map to a single labelable control.

---

### StringListEditor

**Path:** `src/components/ui/string-list-editor.tsx`

**Sizes:** `sm`, `md`, `lg`

**Props:**

| Prop          | Type                        | Required | Description                            |
| ------------- | --------------------------- | -------- | -------------------------------------- |
| `value`       | `string[]`                  | ✅       | Controlled array of string items       |
| `onChange`    | `(value: string[]) => void` | ✅       | Callback with updated array            |
| `placeholder` | `string`                    | —        | Placeholder text for input fields      |
| `label`       | `string`                    | —        | Section label displayed above the list |
| `className`   | `string`                    | —        | Applied to outer container             |
| `disabled`    | `boolean`                   | —        | Disables all interactions              |
| `size`        | `"sm" \| "md" \| "lg"`      | —        | Spacing density (default: `md`)        |

```tsx
<StringListEditor
  value={rules}
  onChange={setRules}
  label="Labeling rules"
  placeholder="Enter rule..."
/>
```

**When to use:** Editing ordered or unordered lists of short strings — best practices, guidelines, accessibility rules, tags.
**When NOT to use:** Rich text editing (use markdown editor), single value input (use Input), key-value pairs (use dedicated key-value editor).

---

## Tier 1.5 — Composites

Location: `apps/ds-dashboard/src/components/composites/`

### PageHeader

**Path:** `src/components/composites/page-header.tsx`

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

**Path:** `src/components/composites/section-header.tsx`

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

**Path:** `src/components/composites/metric-card.tsx`

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

### StatsOverview

**Path:** `src/components/composites/stats-overview.tsx`

**Props:** `items`, `gridClassName?`, `className?`

```tsx
<StatsOverview
  gridClassName="md:grid-cols-2"
  items={[
    { id: 'total', label: 'Total componentes', value: 124 },
    { id: 'with-spec', label: 'Con spec', value: 98 },
  ]}
/>
```

**When to use:** Top-of-page KPI blocks with simple label/value cards (tokens/components listing pages).
**When NOT to use:** Trend/variation metrics (use `MetricCard`), detailed tabular summaries.

---

### FilterBar

**Path:** `src/components/composites/filter-bar.tsx`

**Props:** `searchValue?`, `onSearch?`, `count?`, `rightSlot?`, `children`

```tsx
<FilterBar searchValue={query} onSearch={setQuery} count={items.length}>
  <Select>{/* filters */}</Select>
</FilterBar>
```

**When to use:** Data table filters, search + filter combinations.
**When NOT to use:** Simple search (use Input alone), complex filter panels (use dedicated component).

---

### PrevNextNav

**Path:** `src/components/composites/prev-next-nav.tsx`

**Props:** `hasPrevious`, `hasNext`, `onPrevious`, `onNext`, `currentIndex`, `totalItems`, `previousLabel?`, `nextLabel?`

```tsx
<PrevNextNav
  hasPrevious={Boolean(previous)}
  hasNext={Boolean(next)}
  onPrevious={handlePrev}
  onNext={handleNext}
  currentIndex={currentIndex}
  totalItems={totalItems}
/>
```

**When to use:** Ordered detail navigation with sibling items and index counter.
**When NOT to use:** Generic list pagination, infinite scrolling, or page-number navigation.

---

### TokenRelationTrail

**Path:** `src/components/composites/token-relation-trail.tsx`

**Props:** `title`, `rootLabel`, `items`, `leadingConnector?`, `itemConnector?`, `terminal?`, `terminalConnector?`, `emptyText?`, `className?`

```tsx
<TokenRelationTrail
  title="Alias chain"
  rootLabel="Brand/800"
  leadingConnector="left"
  itemConnector="left"
  terminal={{ label: '#2C2C2C' }}
  items={[
    { label: 'Brand/700', href: '/tokens/Brand.700' },
    { label: 'Brand/600', href: '/tokens/Brand.600' },
  ]}
/>
```

**When to use:** Inline alias chains, token consumer trails, and other compact token lineage rows that need a stable root badge plus wrapped linked badges.
**When NOT to use:** Large hierarchy trees, tables, or standalone navigation lists.

---

### SystemTabsNav

**Path:** `src/components/composites/system-tabs-nav.tsx`

**Props:** none (derives `systemId` and active tab from URL params/pathname)

```tsx
<SystemTabsNav />
```

**When to use:** System area tab navigation (`Overview`, `Admin`, `Consumers`, `Operations`) directly under `PageHeader` in system-scoped pages.
**When NOT to use:** Generic page tabs outside the system domain, multi-tenant navigation, or non-route-driven tab UIs.
**Required in system tab routes:** Any page mounted under `/:systemId/overview`, `/:systemId/admin`, `/:systemId/consumers`, or `/:systemId/operations` must render `<SystemTabsNav />` right after `<PageHeader />`.

---

### EmptyState

**Path:** `src/components/composites/empty-state.tsx`

**Props:** `icon?`, `title`, `description?`, `action?`

**Sub-components:** `EmptyStateAction`

```tsx
<EmptyState
  icon={Inbox}
  title="No tokens found"
  description="Try adjusting your filters"
  action={
    <EmptyStateAction onClick={resetFilters}>Reset Filters</EmptyStateAction>
  }
/>
```

**When to use:** Empty search results, no data states, onboarding prompts.
**When NOT to use:** Error states (use StatusAlert), loading states (use Loader).

---

### DataPanel

**Path:** `src/components/composites/data-panel.tsx`

**Sub-components:** `DataPanel`, `DataPanelHeader`, `DataPanelContent`, `DataPanelFooter`

```tsx
<DataPanel>
  <DataPanelHeader
    title="Token Details"
    description="Property information"
    actions={<Button>Edit</Button>}
  />
  <DataPanelContent>{/* Table or content */}</DataPanelContent>
  <DataPanelFooter>
    <Button>Save</Button>
  </DataPanelFooter>
</DataPanel>
```

**When to use:** Detail views, data tables with headers/footers, settings panels.
**When NOT to use:** Simple cards (use Card), full-page layouts.

---

### AiJobCreateForm

**Path:** `src/components/composites/ai-job-create-form.tsx`

Form for creating AI documentation jobs with provider/model/component selection and validation toggles.

**Key props:** `componentOptions`, `lockedComponentId?`, `initialProvider?`, `initialModel?`, `onJobCreated?`, `existingDocStatus?`, `hideSubmitButton?`, `onSubmitStateChange?`
**When to use:** AI job creation flows in feature pages or modals.
**When NOT to use:** Generic forms unrelated to AI doc generation.

---

### AiJobStatusCard

**Path:** `src/components/composites/ai-job-status-card.tsx`

Status card for AI jobs with progress, timeline/events, validation panel, preview modal, and actions (retry/apply/cancel).

**Key props:** `jobId`, `onStatusChange?`, `onApply?`, `onJobComplete?`, `onRetry?`, `isStreaming?`, `externalEvents?`, `enablePolling?`, `hideHeader?`, `hidePreviewButton?`
**When to use:** Tracking long-running AI jobs and rendering generated suggestion previews.
**When NOT to use:** Simple one-shot status messages (use `StatusAlert`).

---

### LogTerminal

**Path:** `src/components/composites/log-terminal.tsx`
**Import:** `import { LogTerminal } from "@/components/composites/log-terminal"`

**Exported types:**

```ts
type RunStatus = 'idle' | 'running' | 'success' | 'error';

interface LogLine {
  text: string;
  kind: 'stdout' | 'stderr' | 'system';
}
```

**`status` values:**

| Value       | Visual effect                                                                          |
| ----------- | -------------------------------------------------------------------------------------- |
| `"idle"`    | No running indicator; summary bar shown if `summary` present                           |
| `"running"` | Amber pulse dot + "Ejecutando…" label in header; spinner bar at bottom if no `summary` |
| `"success"` | Green summary bar (`bg-status-success-bg/10 text-status-success`)                      |
| `"error"`   | Red summary bar (`bg-destructive/10 text-destructive`)                                 |

**`kind` values (per `LogLine`):**

| Value      | Color                 |
| ---------- | --------------------- |
| `"stdout"` | `text-foreground`     |
| `"stderr"` | `text-status-error`   |
| `"system"` | `text-primary italic` |

**Props:**

| Prop        | Type         | Required | Description                          |
| ----------- | ------------ | -------- | ------------------------------------ |
| `logLines`  | `LogLine[]`  | ✅       | Array of output lines                |
| `status`    | `RunStatus`  | ✅       | Controls visual state                |
| `summary`   | `string`     | —        | One-line result shown in summary bar |
| `elapsedMs` | `number`     | —        | Elapsed time shown in summary bar    |
| `onClear`   | `() => void` | —        | Shows "Limpiar" button when provided |
| `className` | `string`     | —        | Applied to outer container           |

```tsx
<LogTerminal
  logLines={state.logLines}
  summary={state.summary}
  status={state.status}
  elapsedMs={state.elapsedMs}
  onClear={actions.clearLogs}
/>
```

**When to use:** Streaming command output, long-running operation feedback, execution summaries.
**When NOT to use:** Short inline status messages (use `StatusAlert`), static read-only text blocks.

---

## Tier 2 — Feature Components

Location: `apps/ds-dashboard/src/features/`

### Tokens Feature

| Component              | Path                                                           | Description                 |
| ---------------------- | -------------------------------------------------------------- | --------------------------- |
| `TokensPage`           | `src/features/tokens/tokens-page.tsx`                          | Main tokens list view       |
| `TokenTreeModal`       | `src/features/tokens/token-tree/token-tree-modal.tsx`          | Token dependency tree modal |
| `TokenDetailPage`      | `src/features/tokens/token-detail/token-detail-page.tsx`       | Token detail orchestrator   |

#### Token Detail Sections

| Component               | Path                                                                      | Description                   |
| ----------------------- | ------------------------------------------------------------------------- | ----------------------------- |
| `TokenIdentitySection`  | `src/features/tokens/token-detail/components/token-identity-section.tsx`  | Identity/value overview       |
| `TokenUsageInTokensSection` | `src/features/tokens/token-detail/components/token-usage-in-tokens-section.tsx` | Downstream token usage table |
| `TokenAliasSection`     | `src/features/tokens/token-detail/components/token-alias-section.tsx`     | Alias chains and descendants  |
| `TokenUsageSection`     | `src/features/tokens/token-detail/components/token-usage-section.tsx`     | Usage table across components |

### Components Feature

| Component               | Path                                                                       | Description              |
| ----------------------- | -------------------------------------------------------------------------- | ------------------------ |
| `ComponentsPage`        | `src/features/components/components-page.tsx`                              | Components registry view |
| `ComponentDetailPage`   | `src/features/components/component-detail/component-detail-page.tsx`       | Component detail view    |
| `FigmaCaptureModal`     | `src/features/components/component-detail/figma-capture-modal.tsx`         | Figma screenshot capture |
| `EditComponentDocsPage` | `src/features/components/edit-component-docs/edit-component-docs-page.tsx` | Editorial docs page      |

#### Component Detail Sections

| Component                     | Path                                                                                     | Description                           |
| ----------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------- |
| `ComponentNavBar`             | `src/features/components/component-detail/components/component-nav-bar.tsx`              | Prev/next detail navigation           |
| `ComponentVisualProofSection` | `src/features/components/component-detail/components/component-visual-proof-section.tsx` | Screenshot + variant proofs           |
| `ComponentSpecSection`        | `src/features/components/component-detail/components/component-spec-section.tsx`         | Spec/documentation actions            |
| `LayerTokenMappingSection`    | `src/features/components/component-detail/components/layer-token-mapping-section.tsx`    | Layer-to-token mapping table          |
| `ComponentGraphSection`       | `src/features/components/component-detail/components/component-graph-section.tsx`        | Uses/used-by relationships            |
| `ComponentAdoptionSection`    | `src/features/components/component-detail/components/component-adoption-section.tsx`     | Adoption metrics by consumers         |
| `FigmaDescriptionSection`     | `src/features/components/component-detail/components/figma-description-section.tsx`      | Figma descriptions and sync freshness |

#### Edit Component Docs Sections

| Component            | Path                                                                              | Description                 |
| -------------------- | --------------------------------------------------------------------------------- | --------------------------- |
| `AiSuggestionsModal` | `src/features/components/edit-component-docs/components/ai-suggestions-modal.tsx` | AI suggestions modal        |
| `AiSuggestionsPanel` | `src/features/components/edit-component-docs/components/ai-suggestions-panel.tsx` | Inline AI suggestions panel |
| `EditDocsForm`       | `src/features/components/edit-component-docs/components/edit-docs-form.tsx`       | Structured editorial form   |

### Health Feature

| Component               | Path                                                         | Description                |
| ----------------------- | ------------------------------------------------------------ | -------------------------- |
| `HealthDashboardPage`   | `src/features/health/health-dashboard-page.tsx`              | Health dashboard           |
| `HealthActiveIssues`    | `src/features/health/components/health-active-issues.tsx`    | Active issues list         |
| `HealthBrokenAliases`   | `src/features/health/components/health-broken-aliases.tsx`   | Broken alias table         |
| `HealthSpecProgress`    | `src/features/health/components/health-spec-progress.tsx`    | Spec completeness progress |
| `HealthTokenPriorities` | `src/features/health/components/health-token-priorities.tsx` | Token priority ranking     |
| `HealthTrendsChart`     | `src/features/health/health-trends-chart.tsx`                | Trends visualization       |

### System Feature

| Component                | Path                                                    | Description                         |
| ------------------------ | ------------------------------------------------------- | ----------------------------------- |
| `WizardStepBasics`       | `src/features/system/components/wizard-step-basics.tsx` | New-system wizard basics step       |
| `WizardStepImport`       | `src/features/system/components/wizard-step-import.tsx` | New-system wizard import step       |
| `NewSystemPage`          | `src/features/system/new-system-page.tsx`               | New design-system orchestrator page |
| `DesignSystemsAdminPage` | `src/features/system/design-systems-admin-page.tsx`     | Design systems admin page           |

### Ops Feature

| Component        | Path                                   | Description                   |
| ---------------- | -------------------------------------- | ----------------------------- |
| `OperationsPage` | `src/features/ops/operations-page.tsx` | Operational tooling dashboard |

### Consumers Feature

| Component            | Path                                                 | Description                                                  |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| `ConsumersPage`      | `src/features/consumers/consumers-page.tsx`          | Consumers overview page                                      |
| `ConsumerDetailPage` | `src/features/consumers/consumer-detail-page.tsx`    | Consumer detail page                                         |
| `AdoptionBar`        | `src/features/consumers/components/adoption-bar.tsx` | DS vs Non-DS segmented progress bar with semantic percentage |

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

| Version | Date       | Changes                                                                                                                                                       |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.5     | 2026-05-08 | `Checkbox`: added `indeterminate` prop (callback-ref pattern), CVA base variants, exported `checkboxVariants` |
| 1.4     | 2026-04-30 | Added `Checkbox` and `FigmaConnectionStatusDot` to Tier 1 Primitives; exported `connectionStatusDotVariants` |
| 1.3     | 2026-04-14 | Completed Tier 2 coverage for route pages and edit-docs sub-feature (`system`, `consumers`, `files`, `ops`, `edit-component-docs`)             |
| 1.2     | 2026-04-14 | Added missing `ui/composites` entries (`ImpactLevelBadge`, `AiJobCreateForm`, `AiJobStatusCard`) and expanded Tier 2 coverage for decomposed feature sections |
| 1.1     | 2026-04-14 | Consolidated content from `docs/ui/COMPONENT_REGISTRY.md`, normalized paths to `src/...`, and refreshed Tier 2 routes                                         |
| 1.0     | 2026-03-20 | Initial registry                                                                                                                                              |
