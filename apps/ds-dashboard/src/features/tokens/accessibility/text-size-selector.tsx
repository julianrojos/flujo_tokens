import { Select } from "@/components/ui/select";
import { TEXT_SIZE_OPTIONS } from "./wcag-constants";
import type { TextSize } from "./types";

interface TextSizeSelectorProps {
  value: TextSize;
  onChange: (value: TextSize) => void;
  disabled: boolean;
}

export function TextSizeSelector({ value, onChange, disabled }: TextSizeSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold">Text Size</label>
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value === "large" ? "large" : "normal")}
        disabled={disabled}
      >
        {TEXT_SIZE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <p className="text-xs text-muted-foreground">
        {TEXT_SIZE_OPTIONS.find((item) => item.value === value)?.description}
      </p>
    </div>
  );
}
