import * as React from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Mobile drawer context
// ---------------------------------------------------------------------------

type SidebarContextValue = {
  mobileOpen: boolean;
  closeMobile: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue>({
  mobileOpen: false,
  closeMobile: () => {},
});

export function useSidebar(): SidebarContextValue {
  return React.useContext(SidebarContext);
}

function useEscapeKey(onEscape: () => void, enabled: boolean) {
  React.useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onEscape();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onEscape]);
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

export const sidebarProviderVariants = cva("group/sidebar-wrapper flex min-h-screen w-full");
/** Base visual styles — display/positioning are handled by the Sidebar component directly. */
export const sidebarVariants = cva(
  "h-screen flex-col overflow-hidden border-r border-border/70 bg-sidebar text-sidebar-foreground",
);
export const sidebarInsetVariants = cva("min-w-0 flex-1");
export const sidebarHeaderVariants = cva("p-5");
export const sidebarContentVariants = cva("flex-1 overflow-auto px-3 pt-2");
export const sidebarFooterVariants = cva("mt-auto p-3");
export const sidebarGroupVariants = cva("space-y-1 pb-2");
export const sidebarGroupContentVariants = cva("space-y-1");
export const sidebarGroupLabelVariants = cva(
  "px-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/80",
);
export const sidebarMenuVariants = cva("space-y-1");
export const sidebarMenuItemVariants = cva("list-none");
export const sidebarMenuButtonVariants = cva(
  "group w-full rounded border border-transparent px-3 py-3 text-left transition",
  {
    variants: {
      state: {
        active: "border-sidebar-active-border bg-sidebar-active",
        idle: "hover:border-border/70 hover:bg-accent/60",
      },
    },
    defaultVariants: {
      state: "idle",
    },
  },
);
export const sidebarTriggerVariants = cva(
  "inline-flex h-8 w-8 items-center justify-center rounded-md bg-transparent text-white transition hover:bg-transparent hover:text-white",
);

export const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    mobileOpen?: boolean;
    onMobileClose?: () => void;
  }
>(function SidebarProvider(
  { className, children, mobileOpen = false, onMobileClose, ...props },
  ref,
) {
  const closeMobile = React.useCallback(() => {
    onMobileClose?.();
  }, [onMobileClose]);
  useEscapeKey(closeMobile, mobileOpen);

  return (
    <SidebarContext.Provider value={{ mobileOpen, closeMobile }}>
      <div
        ref={ref}
        className={cn(sidebarProviderVariants(), className)}
        {...props}
      >
        {/* Mobile backdrop */}
        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 lg:hidden",
            mobileOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0",
          )}
          aria-hidden="true"
          onClick={closeMobile}
        />
        {children}
      </div>
    </SidebarContext.Provider>
  );
});
SidebarProvider.displayName = "SidebarProvider";

export const Sidebar = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement> & { collapsed?: boolean }
>(({ className, children, collapsed = false, ...props }, ref) => {
  const { mobileOpen } = React.useContext(SidebarContext);
  const sidebarNodeRef = React.useRef<HTMLElement | null>(null);
  const [isMobile, setIsMobile] = React.useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 1023.9px)").matches,
  );

  const setSidebarRef = React.useCallback(
    (node: HTMLElement | null) => {
      sidebarNodeRef.current = node;
      if (typeof ref === "function") {
        ref(node);
        return;
      }
      if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023.9px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  React.useEffect(() => {
    const node = sidebarNodeRef.current;
    if (!node) return;
    const shouldInert = isMobile && !mobileOpen;

    if (shouldInert) {
      node.setAttribute("aria-hidden", "true");
      node.setAttribute("inert", "");
    } else {
      node.removeAttribute("aria-hidden");
      node.removeAttribute("inert");
    }
  }, [isMobile, mobileOpen]);

  return (
    <aside
      ref={setSidebarRef}
      data-collapsed={collapsed}
      className={cn(
        sidebarVariants(),
        // Desktop: sticky inline sidebar
        "hidden shrink-0 transition-[width] duration-300 ease-in-out motion-reduce:transition-none lg:sticky lg:top-0 lg:flex",
        // Mobile: fixed left drawer, slides in/out via transform
        "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:flex",
        "max-lg:transition-transform max-lg:duration-300 max-lg:ease-in-out max-lg:motion-reduce:transition-none",
        mobileOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
        className,
      )}
      style={{ width: collapsed ? "var(--app-sidebar-width-collapsed)" : "var(--app-sidebar-width)" }}
      {...props}
    >
      {children}
    </aside>
  );
});
Sidebar.displayName = "Sidebar";

export const SidebarInset = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn(sidebarInsetVariants(), className)} {...props} />
));
SidebarInset.displayName = "SidebarInset";

export const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn(sidebarHeaderVariants(), className)} {...props} />
));
SidebarHeader.displayName = "SidebarHeader";

export const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn(sidebarContentVariants(), className)} {...props} />
));
SidebarContent.displayName = "SidebarContent";

export const SidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn(sidebarFooterVariants(), className)} {...props} />
));
SidebarFooter.displayName = "SidebarFooter";

export const SidebarGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn(sidebarGroupVariants(), className)} {...props} />
));
SidebarGroup.displayName = "SidebarGroup";

export const SidebarGroupContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn(sidebarGroupContentVariants(), className)} {...props} />
));
SidebarGroupContent.displayName = "SidebarGroupContent";

export const SidebarGroupLabel = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(sidebarGroupLabelVariants(), className)}
    {...props}
  />
));
SidebarGroupLabel.displayName = "SidebarGroupLabel";

export const SidebarMenu = React.forwardRef<
  HTMLUListElement,
  React.HTMLAttributes<HTMLUListElement>
>(({ className, ...props }, ref) => (
  <ul ref={ref} className={cn(sidebarMenuVariants(), className)} {...props} />
));
SidebarMenu.displayName = "SidebarMenu";

export const SidebarMenuItem = React.forwardRef<
  HTMLLIElement,
  React.HTMLAttributes<HTMLLIElement>
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn(sidebarMenuItemVariants(), className)} {...props} />
));
SidebarMenuItem.displayName = "SidebarMenuItem";

type SidebarNavItemProps = React.HTMLAttributes<HTMLDivElement> & {
  isActive?: boolean;
};

/**
 * Navigation item shell for sidebar links.
 * Use it inside an interactive wrapper (<a>, <button>).
 * It does not manage its own focus or keyboard activation.
 */
export const SidebarNavItem = React.forwardRef<
  HTMLDivElement,
  SidebarNavItemProps
>(({ className, isActive = false, ...props }, ref) => (
  <div
    ref={ref}
    data-active={isActive}
    className={cn(
      sidebarMenuButtonVariants({ state: isActive ? "active" : "idle" }),
      className,
    )}
    {...props}
  />
));
SidebarNavItem.displayName = "SidebarNavItem";

export const SidebarTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    collapsed?: boolean;
  }
>(function SidebarTrigger(
  {
  collapsed,
  className,
  "aria-label": ariaLabel,
  title,
  ...props
},
  ref,
) {
  const fallbackLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <button
      ref={ref}
      type="button"
      className={cn(sidebarTriggerVariants(), className)}
      aria-label={ariaLabel || fallbackLabel}
      title={title || fallbackLabel}
      {...props}
    >
      {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
    </button>
  );
});
SidebarTrigger.displayName = "SidebarTrigger";
