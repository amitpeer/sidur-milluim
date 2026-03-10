"use client";

import { useState, useRef, useEffect } from "react";

interface CityAutocompleteProps {
  readonly value: string;
  readonly onChange: (city: string) => void;
  readonly cities: readonly string[];
  readonly name?: string;
  readonly placeholder?: string;
  readonly inputClassName?: string;
}

const MAX_SUGGESTIONS = 8;

export function CityAutocomplete({
  value,
  onChange,
  cities,
  name,
  placeholder = "עיר מגורים",
  inputClassName,
}: CityAutocompleteProps) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (!cities.includes(draft)) {
          setDraft(value);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [draft, value, cities]);

  const filtered = draft.length > 0
    ? cities.filter((c) => c.includes(draft)).slice(0, MAX_SUGGESTIONS)
    : [];

  const handleSelect = (city: string) => {
    setDraft(city);
    setOpen(false);
    onChange(city);
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (!cities.includes(draft)) {
        setDraft(value);
      } else if (draft !== value) {
        onChange(draft);
      }
    }, 150);
  };

  return (
    <div className="relative" ref={containerRef}>
      <input
        type="text"
        name={name}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (draft.length > 0) setOpen(true);
        }}
        onBlur={handleBlur}
        className={inputClassName ?? "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute right-0 top-full z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {filtered.map((city) => (
            <li key={city}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(city)}
                className="w-full px-3 py-2 text-right text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {city}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
