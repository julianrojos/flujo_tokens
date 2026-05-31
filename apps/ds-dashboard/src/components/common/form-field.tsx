import * as React from 'react';

import { cn } from '@/lib/utils';

export interface FormFieldProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  id?: string;
  hideLabel?: boolean;
}

export function FormField({
  label,
  error,
  hint,
  required = false,
  children,
  className,
  id,
  hideLabel = false,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <label
          htmlFor={id}
          className={cn('text-sm text-foreground', hideLabel && 'sr-only')}
        >
          {label}
          {required ? (
            <span className="ml-1 text-status-error" aria-label="required">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p
          id={id ? `${id}-error` : undefined}
          className="text-xs text-status-error"
          role="alert"
        >
          {error}
        </p>
      ) : hint ? (
        <p
          id={id ? `${id}-hint` : undefined}
          className="text-xs text-muted-foreground"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
