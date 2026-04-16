import { useState } from "react";
import { Check } from "lucide-react";

export interface ThemedSelectOption {
  label: string;
  value: string;
}

interface ThemedSelectProps {
  onChange: (value: string) => void;
  options: Array<string | ThemedSelectOption>;
  value: string;
}

export function ThemedSelect({ options, value, onChange }: ThemedSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const normalizedOptions = options.map((option) => (typeof option === "string" ? { label: option, value: option } : option));
  const selectedOption = normalizedOptions.find((option) => option.value === value);
  const displayValue = selectedOption?.label ?? value;

  return (
    <div
      className={`module-select${isOpen ? " is-open" : ""}`}
      onBlur={(event) => {
        const nextFocus = event.relatedTarget;
        if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="module-select__button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="module-select__value">{displayValue}</span>
        <span className="module-select__chevron" aria-hidden="true" />
      </button>

      {isOpen ? (
        <div className="module-select__menu" role="listbox">
          {normalizedOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`module-select__option${option.value === value ? " is-selected" : ""}`}
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.value === value ? <Check size={14} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
