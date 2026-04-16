import { TextInput } from '@/ui/components/TextInput';

export const NAME_MIN = 3;
export const NAME_MAX = 16;

interface NameInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

export function NameInput({ value, onChange, error, disabled }: NameInputProps) {
  return (
    <TextInput
      label="Character Name"
      placeholder="Enter your name..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      disabled={disabled}
      charCount={{ current: value.length, max: NAME_MAX }}
      autoFocus
    />
  );
}
