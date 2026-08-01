import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent } from "react";
import { findIndianState, indianStates } from "../data/indianStates";

type StateComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

const normalizeSearch = (value: string) => value.trim().toLowerCase();

export function StateCombobox({ value, onChange, required = false }: StateComboboxProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filteredStates = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) {
      return indianStates;
    }

    return indianStates.filter((state) => normalizeSearch(state).includes(normalizedQuery));
  }, [query]);
  const selectedState = useMemo(() => findIndianState(value), [value]);
  const hasQuery = query.trim().length > 0;

  const selectState = (state: string) => {
    setQuery(state);
    onChange(state);
    setOpen(false);
  };

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
    onChange(nextQuery);
    setOpen(true);
  };

  const clearState = () => {
    setQuery("");
    onChange("");
    setOpen(true);
    inputRef.current?.focus();
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextFocus = event.relatedTarget;
    if (nextFocus instanceof Node && event.currentTarget.contains(nextFocus)) {
      return;
    }

    const exactState = findIndianState(query);
    if (exactState) {
      selectState(exactState);
      return;
    }

    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && filteredStates.length) {
      event.preventDefault();
      selectState(filteredStates[0]);
      return;
    }

    if (event.key === "ArrowDown") {
      setOpen(true);
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="state-combobox" onBlur={handleBlur}>
      <div className={`state-combobox-control${open ? " open" : ""}`}>
        <Search size={14} aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => handleQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search Indian state"
          required={required}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
        />
        {hasQuery ? (
          <button
            className="state-combobox-clear"
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={clearState}
            aria-label="Clear selected state"
          >
            <X size={14} />
          </button>
        ) : null}
        <button
          className="state-combobox-trigger"
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label="Show Indian states"
        >
          <ChevronDown size={15} />
        </button>
      </div>
      {open ? (
        <div className="state-options" id={listboxId} role="listbox">
          {filteredStates.length ? (
            filteredStates.map((state) => (
              <button
                className={`state-option${selectedState === state ? " selected" : ""}`}
                key={state}
                type="button"
                role="option"
                aria-selected={selectedState === state}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectState(state);
                }}
              >
                <span>{state}</span>
                {selectedState === state ? <Check size={14} aria-hidden="true" /> : null}
              </button>
            ))
          ) : (
            <div className="state-empty">No matching state</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
