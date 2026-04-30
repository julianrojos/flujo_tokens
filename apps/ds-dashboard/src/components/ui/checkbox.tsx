import * as React from 'react';

import { cn } from '@/lib/utils';

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** When provided renders the input + label together as a single clickable row.
   *  `className` is applied to the outer `<label>` wrapper in this mode. */
  label?: React.ReactNode;
  /** Always targets the inner `<input>` regardless of whether `label` is set. */
  inputClassName?: string;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, inputClassName, label, id, ...props }, ref) => {
    const input = (
      <input
        {...props}
        type="checkbox"
        ref={ref}
        id={id}
        className={cn(
          'h-4 w-4 rounded border border-border bg-card accent-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-50',
          label ? inputClassName : cn(inputClassName, className),
        )}
      />
    );

    if (!label) return input;

    return (
      <label
        htmlFor={id}
        className={cn('flex cursor-pointer items-center gap-2 text-sm select-none', className)}
      >
        {input}
        <span>{label}</span>
      </label>
    );
  },
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
