import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDesignSystem } from "@/lib/design-system-context";
import { Check, ChevronDown } from "lucide-react";
import { APP_TITLE } from "@/lib/app-title";
import {
  ROUTE_PATTERNS,
  toSystemAdmin,
  toSystemConsumers,
  toSystemOverview,
} from "@/lib/routes";
import { resolveSystemTab } from "@/lib/resolve-system-tab";
import { cn } from "@/lib/utils";

export function SystemSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { systems, activeSystem } = useDesignSystem();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const hasSystems = systems.length > 0;
  const activeSystemName =
    systems.find((s) => s.id === activeSystem)?.name ?? "Select system";
  const totalItems = systems.length + 1; // system options + "Add new system"

  function openDropdown() {
    const activeIdx = systems.findIndex((s) => s.id === activeSystem);
    setFocusedIndex(activeIdx >= 0 ? activeIdx : 0);
    setOpen(true);
  }

  function closeDropdown() {
    setOpen(false);
    setFocusedIndex(-1);
  }

  // Sync DOM focus to the focused item when navigating with keyboard
  useEffect(() => {
    if (open && focusedIndex >= 0) {
      itemRefs.current[focusedIndex]?.focus();
    }
  }, [open, focusedIndex]);

  useEffect(() => {
    if (!open) return;

    function onMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) closeDropdown();
    }

    function onKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "Escape":
          closeDropdown();
          triggerRef.current?.focus();
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((i) => Math.min(i + 1, totalItems - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((i) => Math.max(i - 1, 0));
          break;
      }
    }

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, totalItems]);

  function handleSelect(id: string) {
    const currentTab = resolveSystemTab(location.pathname);
    if (currentTab === "admin") {
      navigate(toSystemAdmin(id));
    } else if (currentTab === "consumers") {
      navigate(toSystemConsumers(id));
    } else {
      navigate(toSystemOverview(id));
    }
    closeDropdown();
    triggerRef.current?.focus();
  }

  function handleAddNew() {
    closeDropdown();
    navigate(ROUTE_PATTERNS.newSystem);
  }

  return (
    <div className={cn("mt-2 flex flex-col gap-4", collapsed && "sr-only")}>
      <h1 className="flex w-full flex-nowrap items-center justify-center gap-2 whitespace-nowrap text-center text-2xl font-titles font-semibold tracking-tight">
        <img
          src="/branding/logo_DS_Graph.svg"
          alt=""
          aria-hidden="true"
          className="block h-7 w-7 shrink-0"
        />
        <span>{APP_TITLE}</span>
      </h1>

      <div className="relative mt-2" ref={containerRef}>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => (open ? closeDropdown() : openDropdown())}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md",
            "bg-transparent px-3",
            "text-sm font-medium transition-colors",
            "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            hasSystems ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <span className="truncate text-sidebar-foreground">
            {hasSystems ? activeSystemName : "No systems configured"}
          </span>
          <ChevronDown
            className={cn(
              "ml-2 h-4 w-4 shrink-0 text-sidebar-foreground transition-transform duration-fast",
              open && "rotate-180",
            )}
          />
        </button>

        {open && (
          <div
            role="listbox"
            aria-label="Design system selector"
            className={cn(
              "absolute left-0 top-full z-50 mt-1 w-full overflow-hidden",
              "rounded-md border border-border bg-popover shadow-md",
              "animate-fade-slide-in",
            )}
          >
            {hasSystems && (
              <>
                {systems.map((sys, idx) => (
                  <button
                    key={sys.id}
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    role="option"
                    type="button"
                    aria-selected={sys.id === activeSystem}
                    tabIndex={-1}
                    onClick={() => handleSelect(sys.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground",
                      "transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none",
                    )}
                  >
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 text-accent",
                        sys.id !== activeSystem && "invisible",
                      )}
                    />
                    <span className="truncate">{sys.name}</span>
                  </button>
                ))}
                <div className="my-1 border-t border-border" />
              </>
            )}

            <button
              type="button"
              ref={(el) => {
                itemRefs.current[systems.length] = el;
              }}
              tabIndex={-1}
              onClick={handleAddNew}
              className={cn(
                "flex w-full items-center px-3 py-2 text-sm",
                "text-muted-foreground transition-colors",
                "hover:bg-muted/50 hover:text-foreground",
                "focus:bg-muted/50 focus:text-foreground focus:outline-none",
              )}
            >
              + Add new system...
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
