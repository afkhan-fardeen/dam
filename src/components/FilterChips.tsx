"use client";

type FilterChipsProps = {
  label: string;
  options: string[];
  value: string | null;
  onChange: (value: string | null) => void;
};

export function FilterChips({
  label,
  options,
  value,
  onChange,
}: FilterChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="type-caption opacity-60 mr-1">{label}</span>
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`badge badge-lg cursor-pointer ${
          value === null ? "badge-neutral" : "badge-ghost"
        }`}
      >
        All
      </button>
      {options.map((option) => {
        const active = value === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`badge badge-lg cursor-pointer ${
              active ? "badge-neutral" : "badge-ghost"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
