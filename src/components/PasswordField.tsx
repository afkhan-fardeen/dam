"use client";

import { useState } from "react";
import { IconEye, IconEyeOff } from "@tabler/icons-react";

type PasswordFieldProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
  label?: string;
  disabled?: boolean;
};

export function PasswordField({
  value,
  onChange,
  id,
  name,
  required,
  minLength,
  placeholder,
  autoComplete = "current-password",
  autoFocus,
  className = "",
  inputClassName = "",
  label,
  disabled,
}: PasswordFieldProps) {
  const [show, setShow] = useState(false);

  return (
    <label className={`flex flex-col gap-1.5 w-full ${className}`}>
      {label ? <span className="type-caption">{label}</span> : null}
      <div className="relative w-full">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          disabled={disabled}
          className={`flat-input type-body pr-10 w-full ${inputClassName}`}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={show ? "Hide password" : "Show password"}
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShow((v) => !v);
          }}
          className="absolute right-1 top-1/2 -translate-y-1/2 z-10 p-2 rounded-[6px] text-[var(--ink-faint)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"
        >
          {show ? <IconEyeOff size={16} /> : <IconEye size={16} />}
        </button>
      </div>
    </label>
  );
}
