import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Boxes,
  Command,
  Layers3,
  RefreshCcw,
  Search,
  X,
} from "lucide-react";

import {
  refreshComponentsHealth,
  refreshRegistry,
  refreshTokenGraph,
  refreshTokenHealth,
  refreshTokenUsageIndex,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalContent,
} from "@/components/ui/overlay";
import { ApiErrorMessage } from "@/components/api-error-message";
import { ROUTE_PATTERNS } from "@/lib/routes";
import { useGlobalSearch, type GlobalSearchItem } from "./use-global-search";

interface GlobalCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ActionItem = {
  id: string;
  title: string;
  subtitle?: string;
  keywords: string[];
  run: () => Promise<void> | void;
};

type DisplayItem =
  | { type: "action"; key: string; action: ActionItem }
  | { type: "search"; key: string; item: GlobalSearchItem };

function normalize(value: string) {
  return String(value || "").toLowerCase().trim();
}

function isSubsequence(needle: string, haystack: string) {
  let i = 0;
  let j = 0;
  while (i < needle.length && j < haystack.length) {
    if (needle[i] === haystack[j]) i += 1;
    j += 1;
  }
  return i === needle.length;
}

function scoreTextToken(token: string, text: string) {
  const value = normalize(text);
  if (!value) return -1;
  if (value === token) return 140;
  if (value.startsWith(token)) return 110;
  const idx = value.indexOf(token);
  if (idx >= 0) return Math.max(70 - idx, 30);
  if (isSubsequence(token, value)) return 15;
  return -1;
}

function scoreMatch(query: string, strings: string[]) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;

  let score = 0;
  for (const token of tokens) {
    let best = -1;
    for (const value of strings) {
      best = Math.max(best, scoreTextToken(token, value));
    }
    if (best < 0) return null;
    score += best;
  }
  return score;
}

function kindLabel(kind: GlobalSearchItem["kind"]) {
  if (kind === "token") return "Tokens";
  if (kind === "component") return "Components";
  return "System";
}

function kindIcon(kind: GlobalSearchItem["kind"]) {
  if (kind === "token") return <Layers3 className="h-4 w-4" />;
  if (kind === "component") return <Boxes className="h-4 w-4" />;
  return <AlertTriangle className="h-4 w-4" />;
}

function groupByKind(items: GlobalSearchItem[]) {
  return {
    token: items.filter((item) => item.kind === "token"),
    component: items.filter((item) => item.kind === "component"),
    "health-issue": items.filter((item) => item.kind === "health-issue"),
  };
}

export function GlobalCommandPalette({
  open,
  onOpenChange,
}: GlobalCommandPaletteProps) {
  const navigate = useNavigate();
  const { items, loading, error, reloadIndex } = useGlobalSearch();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    setStatusMessage(null);
  }, [open]);

  const actions = useMemo<ActionItem[]>(
    () => [
      {
        id: "go:system",
        title: "Open System Dashboard",
        subtitle: `Go to ${ROUTE_PATTERNS.system}`,
        keywords: ["open", "system", "dashboard"],
        run: () => navigate(ROUTE_PATTERNS.system),
      },
      {
        id: "go:tokens",
        title: "Open Tokens",
        subtitle: `Go to ${ROUTE_PATTERNS.tokens}`,
        keywords: ["open", "tokens", "properties"],
        run: () => navigate(ROUTE_PATTERNS.tokens),
      },
      {
        id: "go:components",
        title: "Open Components",
        subtitle: `Go to ${ROUTE_PATTERNS.components}`,
        keywords: ["open", "components"],
        run: () => navigate(ROUTE_PATTERNS.components),
      },
      {
        id: "refresh:registry",
        title: "Refresh Registry",
        subtitle: "Run ds:registry:refresh",
        keywords: ["refresh", "registry", "pipeline"],
        run: async () => {
          await refreshRegistry();
          await reloadIndex();
        },
      },
      {
        id: "refresh:usage",
        title: "Refresh Token Usage Index",
        subtitle: "Run ds:token-usage-index",
        keywords: ["refresh", "usage", "tokens"],
        run: async () => {
          await refreshTokenUsageIndex();
          await reloadIndex();
        },
      },
      {
        id: "refresh:graph",
        title: "Refresh Token Graph",
        subtitle: "Run ds:token-graph",
        keywords: ["refresh", "graph", "tokens"],
        run: async () => {
          await refreshTokenGraph();
          await reloadIndex();
        },
      },
      {
        id: "refresh:token-health",
        title: "Refresh Token System",
        subtitle: "Run ds:token-health",
        keywords: ["refresh", "token", "system", "health"],
        run: async () => {
          await refreshTokenHealth();
          await reloadIndex();
        },
      },
      {
        id: "refresh:components-health",
        title: "Refresh Components System",
        subtitle: "Run ds:registry:report",
        keywords: ["refresh", "components", "system", "health"],
        run: async () => {
          await refreshComponentsHealth();
          await reloadIndex();
        },
      },
    ],
    [navigate, reloadIndex],
  );

  const filteredActions = useMemo(() => {
    if (!query.trim()) return actions.slice(0, 6);
    const scored = actions
      .map((action) => ({
        action,
        score: scoreMatch(query, [
          action.title,
          action.subtitle || "",
          ...action.keywords,
        ]),
      }))
      .filter((item) => item.score !== null)
      .sort((a, b) => (b.score || 0) - (a.score || 0));
    return scored.map((item) => item.action).slice(0, 8);
  }, [actions, query]);

  const filteredSearchItems = useMemo(() => {
    if (!query.trim()) return [];
    const scored = items
      .map((item) => ({
        item,
        score: scoreMatch(query, [
          item.title,
          item.subtitle || "",
          ...item.keywords,
        ]),
      }))
      .filter((entry) => entry.score !== null)
      .sort((a, b) => (b.score || 0) - (a.score || 0));
    return scored.map((entry) => entry.item).slice(0, 24);
  }, [items, query]);

  const grouped = useMemo(
    () => groupByKind(filteredSearchItems),
    [filteredSearchItems],
  );

  const displayItems = useMemo<DisplayItem[]>(() => {
    const list: DisplayItem[] = [];
    for (const action of filteredActions) {
      list.push({ type: "action", key: `action:${action.id}`, action });
    }
    for (const item of filteredSearchItems) {
      list.push({ type: "search", key: item.id, item });
    }
    return list;
  }, [filteredActions, filteredSearchItems]);

  useEffect(() => {
    if (!open) return;
    if (selectedIndex > Math.max(displayItems.length - 1, 0)) {
      setSelectedIndex(0);
    }
  }, [displayItems.length, open, selectedIndex]);

  useEffect(() => {
    if (!open || !displayItems.length) return;
    const row = document.querySelector<HTMLElement>(
      `[data-command-index="${selectedIndex}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, displayItems, open]);

  const close = () => onOpenChange(false);

  const runAction = async (action: ActionItem) => {
    setStatusMessage(null);
    setRunningActionId(action.id);
    try {
      await action.run();
      setStatusMessage("Action executed.");
      close();
    } catch (cause) {
      setStatusMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunningActionId(null);
    }
  };

  const openItem = (item: GlobalSearchItem) => {
    navigate(item.href);
    close();
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((prev) =>
          Math.min(prev + 1, Math.max(displayItems.length - 1, 0)),
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const selected = displayItems[selectedIndex];
        if (!selected) return;
        if (selected.type === "action") {
          void runAction(selected.action);
          return;
        }
        openItem(selected.item);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [displayItems, open, selectedIndex]);

  let itemIndex = -1;

  return (
    <Modal open={open} onClose={() => onOpenChange(false)} zIndex={1100}>
      <ModalContent className="w-[min(860px,96vw)] overflow-hidden pt-0">
        <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              loading
                ? "Loading search index..."
                : "Search tokens, components, system issues, actions..."
            }
            className="border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
            autoFocus
          />
          <Button variant="ghost" size="sm" onClick={close} aria-label="Close command palette">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="max-h-[58vh] overflow-y-auto p-2">
          {loading ? (
            <div className="rounded-md border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
              Building search index...
            </div>
          ) : null}

          {!loading && error ? (
            <ApiErrorMessage error={error} />
          ) : null}

          {!loading ? (
            <>
              <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Actions ({filteredActions.length})
              </div>
              <div className="space-y-1">
                {filteredActions.map((action) => {
                  itemIndex += 1;
                  const index = itemIndex;
                  const selected = selectedIndex === index;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      data-command-index={index}
                      className={[
                        "flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition",
                        selected
                          ? "border-primary/50 bg-primary/10"
                          : "border-transparent hover:border-border/70 hover:bg-accent/50",
                      ].join(" ")}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => {
                        void runAction(action);
                      }}
                      disabled={runningActionId === action.id}
                    >
                      <span className="mt-0.5 rounded-md border border-border/70 bg-background p-1.5">
                        <Command className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {action.title}
                        </span>
                        {action.subtitle ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {action.subtitle}
                          </span>
                        ) : null}
                      </span>
                      {runningActionId === action.id ? (
                        <RefreshCcw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {query.trim() ? (
                <>
                  {(["token", "component", "health-issue"] as const).map((kind) => {
                    const list = grouped[kind];
                    if (!list.length) return null;
                    return (
                      <div key={kind} className="mt-4">
                        <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {kindLabel(kind)} ({list.length})
                        </div>
                        <div className="space-y-1">
                          {list.map((item) => {
                            itemIndex += 1;
                            const index = itemIndex;
                            const selected = selectedIndex === index;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                data-command-index={index}
                                className={[
                                  "flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition",
                                  selected
                                    ? "border-primary/50 bg-primary/10"
                                    : "border-transparent hover:border-border/70 hover:bg-accent/50",
                                ].join(" ")}
                                onMouseEnter={() => setSelectedIndex(index)}
                                onClick={() => openItem(item)}
                              >
                                <span className="mt-0.5 rounded-md border border-border/70 bg-background p-1.5 text-muted-foreground">
                                  {kindIcon(item.kind)}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium">
                                    {item.title}
                                  </span>
                                  {item.subtitle ? (
                                    <span className="block truncate text-xs text-muted-foreground">
                                      {item.subtitle}
                                    </span>
                                  ) : null}
                                </span>
                                <Badge variant="neutral">{kindLabel(item.kind)}</Badge>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : null}

              {!query.trim() && !filteredActions.length ? (
                <div className="rounded-md border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
                  No actions available.
                </div>
              ) : null}

              {query.trim() &&
              !filteredSearchItems.length &&
              !filteredActions.length ? (
                <div className="rounded-md border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
                  No results found for "{query}".
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5">↑</kbd>{" "}
              <kbd className="rounded border bg-muted px-1.5 py-0.5">↓</kbd>{" "}
              navigate
            </span>
            <span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5">Enter</kbd>{" "}
              open
            </span>
          </div>
          <div>
            <kbd className="rounded border bg-muted px-1.5 py-0.5">Esc</kbd>{" "}
            close
          </div>
        </div>
        {statusMessage ? (
          <div className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">
            {statusMessage}
          </div>
        ) : null}
      </ModalContent>
    </Modal>
  );
}
