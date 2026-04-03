import * as React from "react";
import { Plus, X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getAddItemAriaLabel,
  getRemoveItemAriaLabel,
  syncItemIdsByLength,
} from "@/components/ui/string-list-editor.utils";

const stringListEditorVariants = cva("", {
  variants: {
    size: {
      sm: "space-y-1.5",
      md: "space-y-2",
      lg: "space-y-3",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export interface StringListEditorProps
  extends
    Omit<React.HTMLAttributes<HTMLDivElement>, "onChange">,
    VariantProps<typeof stringListEditorVariants> {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}

const StringListEditor = React.forwardRef<HTMLDivElement, StringListEditorProps>(
  (
    {
      value,
      onChange,
      placeholder = "Enter item...",
      label,
      className,
      size,
      disabled = false,
      ...props
    },
    ref,
  ) => {
    const nextIdRef = React.useRef(0);
    const createId = React.useCallback(() => `sli-${nextIdRef.current++}`, []);
    const [itemIds, setItemIds] = React.useState<string[]>(() => value.map(() => createId()));
    const addAriaLabel = getAddItemAriaLabel(label);

    React.useEffect(() => {
      setItemIds((currentIds) => syncItemIdsByLength(currentIds, value.length, createId));
    }, [value.length, createId]);

    const handleItemChange = (index: number, newValue: string) => {
      const updated = value.map((item, i) => (i === index ? newValue : item));
      onChange(updated);
    };

    const handleRemoveItem = (index: number) => {
      setItemIds((currentIds) => currentIds.filter((_, i) => i !== index));
      onChange(value.filter((_, i) => i !== index));
    };

    const handleAddItem = () => {
      setItemIds((currentIds) => [...currentIds, createId()]);
      onChange([...value, ""]);
    };

    return (
      <div
        ref={ref}
        className={cn(stringListEditorVariants({ size, className }))}
        {...props}
      >
        {label ? (
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            {label}
          </span>
        ) : null}

        {value.length === 0 ? (
          <div className="flex items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/20 py-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAddItem}
              disabled={disabled}
              aria-label={addAriaLabel}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add item
            </Button>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {value.map((item, index) => (
                <li key={itemIds[index] ?? `sli-fallback-${index}`} className="flex items-center gap-2">
                  <Input
                    value={item}
                    onChange={(e) => handleItemChange(index, e.target.value)}
                    placeholder={placeholder}
                    disabled={disabled}
                    className="flex-1"
                    aria-label={`${label || "Item"} ${index + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveItem(index)}
                    disabled={disabled}
                    aria-label={getRemoveItemAriaLabel(label, index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAddItem}
              disabled={disabled}
              aria-label={addAriaLabel}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add item
            </Button>
          </>
        )}
      </div>
    );
  },
);
StringListEditor.displayName = "StringListEditor";

export { StringListEditor, stringListEditorVariants };
