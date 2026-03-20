import * as React from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const modalVariants = cva(
  "relative mx-auto w-full max-w-[560px] rounded-xl border border-border bg-card shadow-2xl",
  {
    variants: {
      size: {
        sm: "max-w-[400px]",
        md: "max-w-[560px]",
        lg: "max-w-[720px]",
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
