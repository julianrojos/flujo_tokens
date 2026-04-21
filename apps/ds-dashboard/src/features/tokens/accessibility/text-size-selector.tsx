import { useId } from 'react';
import { FormField } from '@/components/common';
import { Select } from '@/components/ui/select';
import { TEXT_SIZE_OPTIONS } from './wcag-constants';
import type { TextSize } from './types';

interface TextSizeSelectorProps {
  value: TextSize;
  onChange: (value: TextSize) => void;
  disabled: boolean;
}

export function TextSizeSelector({
  value,
  onChange,
  disabled,
}: TextSizeSelectorProps) {
  const selectId = useId();
  const selectedOption = TEXT_SIZE_OPTIONS.find((item) => item.value === value);

  return (
    <FormField
      id={selectId}
      label="Text Size"
      hint={selectedOption?.description}
      className="space-y-2"
    >
      <Select
        id={selectId}
        value={value}
        onChange={(event) =>
          onChange(event.target.value === 'large' ? 'large' : 'normal')
        }
        disabled={disabled}
      >
        {TEXT_SIZE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </FormField>
  );
}
