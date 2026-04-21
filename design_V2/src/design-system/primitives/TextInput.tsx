import {
  forwardRef,
  useId,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { accent, radius, semantic, space, text } from '../tokens';

type InputRest = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'disabled' | 'id' | 'style' | 'className' | 'children'
>;

export interface TextInputProps extends InputRest {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label?: ReactNode;
  placeholder?: string;
  /** When set, renders in error state (crimson border + error message in the helper row). */
  error?: string;
  /** Left-side helper text shown when there's no error. Hidden if an error is present. */
  helperLeft?: ReactNode;
  /** Right-side helper text (typically a character counter). Always shown if provided. */
  helperRight?: ReactNode;
  disabled?: boolean;
  /** className on the outer wrapper. */
  className?: string;
  /** Style override applied to the <input> element (your keys win over primitive defaults). */
  inputStyle?: CSSProperties;
}

// border.subtle is 0.5px; inputs use a consistent 1px stroke for affordance and
// to avoid a layout-shifting border-width change between focused/blurred states.
// Default stroke color matches border.subtle's color component.
const DEFAULT_BORDER_COLOR = 'rgba(255, 255, 255, 0.06)';

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  function TextInput(
    {
      id,
      value,
      onChange,
      label,
      placeholder,
      error,
      helperLeft,
      helperRight,
      disabled = false,
      className,
      inputStyle,
      onFocus,
      onBlur,
      ...rest
    },
    ref,
  ) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const helpId = `${inputId}-help`;
    const hasHelper =
      error != null || helperLeft != null || helperRight != null;

    const [focused, setFocused] = useState(false);

    const labelStyle: CSSProperties = {
      display: 'block',
      fontSize: 11,
      fontWeight: 500,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: text.muted,
      marginBottom: space.sm,
    };

    const borderColor = error
      ? semantic.danger.base
      : focused
        ? accent.muted
        : DEFAULT_BORDER_COLOR;

    const fieldStyle: CSSProperties = {
      width: '100%',
      padding: `${space.sm} ${space.md}`,
      background: 'rgba(0, 0, 0, 0.3)',
      border: `1px solid ${borderColor}`,
      borderRadius: radius.sm,
      color: text.primary,
      fontSize: 14,
      outline: 'none',
      transition: 'border-color 150ms ease',
      cursor: disabled ? 'not-allowed' : 'text',
      opacity: disabled ? 0.5 : 1,
      boxSizing: 'border-box',
      ...inputStyle,
    };

    const helperRowStyle: CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.sm,
      marginTop: space.sm,
      fontSize: 12,
      fontWeight: 500,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
    };

    const leftMessage = error ?? helperLeft;
    const leftColor = error ? semantic.danger.text : text.muted;

    return (
      <div className={className}>
        {label != null && (
          <label htmlFor={inputId} style={labelStyle}>
            {label}
          </label>
        )}
        <input
          {...rest}
          ref={ref}
          id={inputId}
          type={rest.type ?? 'text'}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={hasHelper ? helpId : undefined}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          onChange={(e) => onChange(e.target.value)}
          style={fieldStyle}
          // Placeholder color via Tailwind arbitrary value — ::placeholder can't
          // be targeted via inline style. Value matches text.muted.
          className="placeholder:text-[rgba(232,232,240,0.48)]"
        />
        {hasHelper && (
          <div id={helpId} style={helperRowStyle}>
            <span style={{ color: leftColor }}>{leftMessage}</span>
            {helperRight != null && (
              <span
                style={{
                  color: text.muted,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {helperRight}
              </span>
            )}
          </div>
        )}
      </div>
    );
  },
);
