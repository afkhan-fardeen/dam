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
    <fieldset className={`fieldset w-full ${className}`}>
      {label ? (
        <legend className="fieldset-legend text-xs opacity-60 py-0">
          {label}
        </legend>
      ) : null}
      {/* Avoid DaisyUI label.input wrapping — clicks on the eye were swallowed. */}
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
          className={`input input-bordered w-full pr-10 type-body ${inputClassName}`}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={show ? "Hide password" : "Show password"}
          onMouseDown={(e) => {
            // Keep focus in the field; prevent label/button focus steal.
            e.preventDefault();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShow((v) => !v);
          }}
          className="btn btn-ghost btn-xs btn-circle absolute right-1.5 top-1/2 -translate-y-1/2 z-10"
        >
          {show ? <IconEyeOff size={16} /> : <IconEye size={16} />}
        </button>
      </div>
    </fieldset>
  );
}
