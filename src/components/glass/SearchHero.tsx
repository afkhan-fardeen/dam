"use client";

import { IconSearch, IconX } from "@tabler/icons-react";
import type { FormEvent, ReactNode } from "react";

type SearchHeroProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (e: FormEvent) => void;
  /** When set, clear button commits via this (e.g. leave /search). */
  onClear?: () => void;
  placeholder?: string;
  showCmdK?: boolean;
  glow?: boolean;
  slim?: boolean;
  suggestions?: ReactNode;
  className?: string;
  autoFocus?: boolean;
};

export function SearchHero({
  value,
  onChange,
  onSubmit,
  onClear,
  placeholder = "Search…",
  showCmdK = true,
  glow = true,
  slim = false,
  suggestions,
  className = "",
  autoFocus,
}: SearchHeroProps) {
  return (
    <div className={`w-full ${className}`}>
      <form
        onSubmit={onSubmit}
        className={`search-hero relative glass-hero ${
          slim ? "px-4 py-2.5" : "px-5 py-[18px]"
        }`}
        style={{ viewTransitionName: "search-hero" }}
      >
        {glow ? <span className="search-glow" aria-hidden /> : null}
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
            className={`glass-input grow min-w-0 ${
              slim ? "text-[14px]" : "text-[15.5px] tracking-[-0.01em]"
            }`}
          />
          {value ? (
            <button
              type="button"
              aria-label="Clear search"
              className="text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors"
              onClick={() => {
                if (onClear) onClear();
                else onChange("");
              }}
            >
              <IconX size={15} />
            </button>
          ) : showCmdK ? (
            <kbd className="tag-chip !py-1 !px-2 text-[11px] text-[var(--ink-faint)] shrink-0">
              ⌘K
            </kbd>
          ) : null}
        </label>
      </form>
      {suggestions ? (
        <div className="mt-3 flex flex-wrap gap-2 justify-center">
          {suggestions}
        </div>
      ) : null}
    </div>
  );
}
