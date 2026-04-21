import { useId } from 'react';
import { FormField } from '@/components/common';
import { Select } from '@/components/ui/select';
import type { SemanticColorOption } from './types';

interface ColorSelectProps {
  label: string;
  options: SemanticColorOption[];
  value: string;
  onChange: (value: string) => void;
}

export function ColorSelect({
  label,
  options,
  value,
  onChange,
}: ColorSelectProps) {
  const selectId = useId();
  const selected = options.find((option) => option.tokenPath === value) || null;

  return (
    <FormField id={selectId} label={label} className="space-y-2">
      <Select
        id={selectId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.tokenPath} value={option.tokenPath}>
            {option.label}
          </option>
        ))}
      </Select>
      {selected ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className="inline-block h-4 w-4 rounded-sm border border-border"
            style={{ backgroundColor: selected.hexValue }}
            aria-hidden="true"
          />
          <span>{selected.hexValue}</span>
        </div>
      ) : null}
    </FormField>
  );
}
