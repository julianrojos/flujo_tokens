import type { ElementType } from "./types";

interface ElementTypeSelectorProps {
  value: ElementType;
  onChange: (value: ElementType) => void;
}

export function ElementTypeSelector({ value, onChange }: ElementTypeSelectorProps) {
  const toggleText = () => {
    onChange(value === "text" ? null : "text");
  };
  const toggleIcon = () => {
    onChange(value === "icon" ? null : "icon");
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Foreground Element Type</p>
      <div className="flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border"
            checked={value === "text"}
            onChange={toggleText}
          />
          Text
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border"
            checked={value === "icon"}
            onChange={toggleIcon}
          />
          Icon / UI
        </label>
      </div>
      {value === null ? (
        <p className="text-xs text-muted-foreground">
          Select whether the foreground element is text or icon/UI.
        </p>
      ) : null}
    </div>
  );
}
