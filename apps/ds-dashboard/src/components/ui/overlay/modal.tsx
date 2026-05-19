import * as React from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const modalVariants = cva(
  "relative mx-auto w-full max-w-[560px] rounded-xl border border-border bg-card shadow-2xl",
  {
    variants: {
      size: {
        sm: "max-w-[400px]",
        md: "max-w-[560px]",
        lg: "max-w-[800px]",
        full: "max-w-[min(920px,96vw)]",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  zIndex?: number;
  /** Associates a heading id with the dialog for screen readers (WCAG 4.1.2). */
  "aria-labelledby"?: string;
}

export interface ModalContentProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof modalVariants> {}

function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [locked]);
}

function useEscapeKey(onEscape: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onEscape();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onEscape, enabled]);
}

export function Modal({
  open,
  onClose,
  children,
  className,
  zIndex = 1000,
  "aria-labelledby": ariaLabelledby,
}: ModalProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useScrollLock(open && isMounted);
  useEscapeKey(onClose, open && isMounted);

  if (!isMounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0"
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledby}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close modal backdrop"
      />
      <div className={cn("relative z-10 flex min-h-full items-center justify-center p-4 md:p-6", className)}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ModalContent({
  className,
  size = "md",
  children,
  ...props
}: ModalContentProps) {
  return (
    <div
      className={cn(modalVariants({ size, className }))}
      {...props}
    >
      {children}
    </div>
  );
}

export function ModalHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-start justify-between border-b border-border/70 p-5", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function ModalFooter({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex justify-end gap-2 border-t border-border/70 p-5", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export interface ModalCloseButtonProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Button>, "children" | "variant"> {
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  label?: string;
}

const ModalCloseButton = React.forwardRef<HTMLButtonElement, ModalCloseButtonProps>(
  ({ onClick, label = "Close dialog", className, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClick}
        aria-label={label}
        title="Close"
        className={cn("h-8 w-8 shrink-0 rounded-full p-0", className)}
        {...props}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>
    );
  },
);
ModalCloseButton.displayName = "ModalCloseButton";

export { ModalCloseButton };
