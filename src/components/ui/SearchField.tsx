"use client";

import { IconSearch, IconX } from "@tabler/icons-react";
import type { FormEvent, ReactNode } from "react";

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (e: FormEvent) => void;
  onClear?: () => void;
  placeholder?: string;
  showCmdK?: boolean;
  /** Ignored — Flat has no glow */
  glow?: boolean;
  slim?: boolean;
  suggestions?: ReactNode;
  className?: string;
  autoFocus?: boolean;
  /** Typeahead panel below field */
  dropdown?: ReactNode;
};

export function SearchField({
  value,
  onChange,
  onSubmit,
  onClear,
  placeholder = "Search…",
  showCmdK = true,
  slim = false,
  suggestions,
  dropdown,
  className = "",
  autoFocus,
}: SearchFieldProps) {
  return (
    <div className={`w-full relative ${className}`}>
      <form
        onSubmit={onSubmit}
        className={`search-hero relative ${
          slim ? "px-3 py-2 h-9" : "px-4 py-3 min-h-12"
        } flex items-center`}
      >
        <label className="flex items-center gap-3 w-full">
          <IconSearch
            size={slim ? 16 : 17}
            stroke={1.75}
            className="shrink-0 text-[var(--ink-faint)]"
          />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoFocus={autoFocus}
            className={`glass-input borderless grow min-w-0 ${
              slim ? "text-[14px]" : "text-[15px]"
            }`}
            autoComplete="off"
          />
          {value ? (
            <button
              type="button"
              aria-label="Clear search"
              className="text-[var(--ink-faint)] hover:text-[var(--ink)]"
              onClick={() => {
                if (onClear) onClear();
                else onChange("");
              }}
            >
              <IconX size={15} />
            </button>
          ) : showCmdK ? (
            <kbd className="tag-chip !py-0.5 !px-1.5 text-[11px] text-[var(--ink-faint)] shrink-0">
              ⌘K
            </kbd>
          ) : null}
        </label>
      </form>
      {dropdown}
      {suggestions ? (
        <div className="mt-3 flex flex-wrap gap-2 justify-center">
          {suggestions}
        </div>
      ) : null}
    </div>
  );
}

/** @deprecated Use SearchField */
export const SearchHero = SearchField;
