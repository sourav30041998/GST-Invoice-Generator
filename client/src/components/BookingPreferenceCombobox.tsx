import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

const PREFERENCES = [
  "Standard",
  "Deluxe",
  "Super Deluxe",
  "Suite",
  "Family",
  "AC",
  "Non-AC",
  "Standard - AC",
  "Standard - Non-AC",
  "Deluxe - AC",
  "Deluxe - Non-AC",
];

export function BookingPreferenceCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(true);
  const [active, setActive] = useState(-1);
  const [placement, setPlacement] = useState({ above: false, height: 220 });

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const field = input.current?.getBoundingClientRect();
      const modal = input.current
        ?.closest(".customer-modal")
        ?.getBoundingClientRect();
      if (!field) return;
      const above = field.top - Math.max(12, (modal?.top || 0) + 72);
      const below =
        Math.min(
          window.innerHeight - 12,
          (modal?.bottom || window.innerHeight) - 72,
        ) - field.bottom;
      const openAbove = below < 220 && above > below;
      setPlacement({
        above: openAbove,
        height: Math.max(80, Math.min(220, (openAbove ? above : below) - 8)),
      });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);
  const query = value.trim().toLowerCase();
  const matches = PREFERENCES.filter(
    (option) => showAll || option.toLowerCase().includes(query),
  );
  const custom =
    value.trim() &&
    !PREFERENCES.some((option) => option.toLowerCase() === query);
  const options = [
    ...matches.map((text) => ({ text, label: text })),
    ...(custom ? [{ text: value.trim(), label: `Use "${value.trim()}"` }] : []),
  ];

  useEffect(() => {
    if (open && active >= 0) {
      list.current?.children[active]?.scrollIntoView({ block: "nearest" });
    }
  }, [active, open]);

  const select = (text: string) => {
    onChange(text);
    input.current?.focus();
    setOpen(false);
    setActive(-1);
  };

  return (
    <div className="booking-preference-field">
      <label htmlFor={id}>Preference</label>
      <div
        className="state-combobox booking-preference"
        onBlur={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            setOpen(false);
            setActive(-1);
          }
        }}
      >
        <div className={`state-combobox-control${open ? " open" : ""}`}>
          <input
            id={id}
            ref={input}
            value={value}
            maxLength={80}
            placeholder="Standard (default)"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={id + "-options"}
            aria-activedescendant={
              open && active >= 0 ? id + "-option-" + active : undefined
            }
            onFocus={() => {
              setShowAll(true);
              setActive(-1);
              setOpen(true);
            }}
            onChange={(event) => {
              onChange(event.target.value);
              setShowAll(false);
              setActive(-1);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && open) {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                setActive(-1);
              } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(true);
                const step = event.key === "ArrowDown" ? 1 : -1;
                setActive((current) =>
                  current < 0
                    ? step > 0
                      ? 0
                      : options.length - 1
                    : (current + step + options.length) % options.length,
                );
              } else if (event.key === "Enter" && open) {
                event.preventDefault();
                select(
                  active >= 0 && options[active]
                    ? options[active].text
                    : PREFERENCES.find(
                        (option) => option.toLowerCase() === query,
                      ) || value.trim(),
                );
              }
            }}
          />
          {value ? (
            <button
              type="button"
              className="state-combobox-clear"
              aria-label="Clear preference"
              title="Clear preference"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange("");
                setShowAll(true);
                setActive(-1);
                input.current?.focus();
                setOpen(true);
              }}
            >
              <X size={14} />
            </button>
          ) : null}
          <button
            type="button"
            className="state-combobox-trigger"
            aria-label="Show room preferences"
            title="Show room preferences"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              input.current?.focus();
              setShowAll(true);
              setActive(-1);
              setOpen(!open);
            }}
          >
            <ChevronDown size={15} />
          </button>
        </div>
        {open ? (
          <div
            ref={list}
            className={`state-options${placement.above ? " above" : ""}`}
            style={{ maxHeight: placement.height }}
            id={id + "-options"}
            role="listbox"
            aria-label="Room preferences"
          >
            {options.map((option, index) => (
              <button
                key={option.label}
                type="button"
                role="option"
                tabIndex={-1}
                id={id + "-option-" + index}
                aria-selected={value === option.text}
                className={`state-option${active === index ? " active" : ""}${value === option.text ? " selected" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(option.text)}
              >
                <span>{option.label}</span>
                {value === option.text ? <Check size={14} /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
