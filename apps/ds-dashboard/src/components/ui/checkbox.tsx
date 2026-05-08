import * as React from 'react';

import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

export const checkboxVariants = cva(
  [
    'h-4 w-4 rounded border border-border bg-card accent-primary',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    'disabled:cursor-not-allowed disabled:opacity-50',
  ].join(' '),
);

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** When provided, renders the input + label together as a single clickable row.
   *  `className` is applied to the outer `<label>` wrapper in this mode. */
  label?: React.ReactNode;
  /** Always targets the inner `<input>` regardless of whether `label` is set. */
  inputClassName?: string;
  /**
   * Sets the native `indeterminate` DOM property — the "dash" visual state used for
   * "select all" checkboxes when only some items are selected.
   * Cannot be expressed as an HTML attribute; this prop handles it via a callback ref.
   */
  indeterminate?: boolean;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, inputClassName, label, id, indeterminate, ...props }, forwardedRef) => {
    // Callback ref that syncs `indeterminate` and forwards the ref to the consumer.
    // Using an inline (non-memoized) callback ref is intentional: React calls it with
    // null → element on every render when the function reference changes, which keeps
    // `indeterminate` in sync without a separate useEffect.
    const refCallback = React.useCallback(
      (el: HTMLInputElement | null) => {
        if (el) el.indeterminate = !!indeterminate;
        if (typeof forwardedRef === 'function') {
          forwardedRef(el);
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
        }
      },
      [indeterminate, forwardedRef],
    );

    const input = (
      <input
        {...props}
        type="checkbox"
        ref={refCallback}
        id={id}
        className={cn(
          checkboxVariants(),
          label ? inputClassName : cn(inputClassName, className),
        )}
      />
    );

    if (!label) return input;

    return (
      <label
        htmlFor={id}
        className={cn('flex cursor-pointer select-none items-center gap-2 text-sm', className)}
      >
        {input}
        <span>{label}</span>
      </label>
    );
  },
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
