"use client";

import { Filter } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

type ColumnFilter =
  | { type: "date"; startDate: string; endDate: string }
  | { type: "options"; name: string; value: string; allLabel: string; options: { value: string; label: string }[] };

type ServerTableColumnHeaderProps = {
  label: string;
  href: string;
  sort?: { name: string; active: boolean; direction: "asc" | "desc" };
  filter?: ColumnFilter;
};

export function ServerTableColumnHeader({ label, href, sort, filter }: ServerTableColumnHeaderProps) {
  const router = useRouter();
  const popupId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLFormElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const active = filter?.type === "date"
    ? Boolean(filter.startDate || filter.endDate)
    : Boolean(filter?.value);

  useEffect(() => {
    if (!position) return;
    popupRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    const closeOutside = (event: MouseEvent) => {
      if (!popupRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) {
        setPosition(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPosition(null);
        buttonRef.current?.focus();
      }
    };
    const close = () => setPosition(null);
    const closeOnScroll = (event: Event) => {
      if (!popupRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("click", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("click", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [position]);

  function navigate(updates: Record<string, string>) {
    const [pathname, query] = href.split("?");
    const params = new URLSearchParams(query);
    for (const [name, value] of Object.entries(updates)) {
      if (value) params.set(name, value);
      else params.delete(name);
    }
    params.delete("cursor");
    params.delete("cursorHistory");
    params.delete("page");
    setPosition(null);
    router.replace(`${pathname}?${params}`, { scroll: false });
  }

  function applyFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const updates: Record<string, string> = {};
    values.forEach((value, name) => { updates[name] = String(value); });
    navigate(updates);
  }

  return (
    <>
      {label}
      <span className="table-header-controls no-print">
        {sort && (
          <button
            type="button"
            className="table-sort-button"
            aria-label={`Sort by ${label}`}
            title={`Sort by ${label}`}
            onClick={() => navigate({ sort: sort.name, direction: sort.active && sort.direction === "asc" ? "desc" : "asc" })}
          >
            {sort.active ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}
          </button>
        )}
        {filter && (
          <button
            ref={buttonRef}
            type="button"
            className="table-filter-button"
            data-active={active}
            aria-label={`Filter ${label}`}
            title={`Filter ${label}`}
            aria-expanded={Boolean(position)}
            aria-controls={position ? popupId : undefined}
            onClick={() => {
              if (position) { setPosition(null); return; }
              const rect = buttonRef.current!.getBoundingClientRect();
              setPosition({
                left: Math.max(8, Math.min(rect.right - 288, window.innerWidth - 296)),
                top: rect.bottom + 6,
              });
            }}
          >
            <Filter aria-hidden="true" />
          </button>
        )}
      </span>
      {position && filter && createPortal(
        <form
          ref={popupRef}
          id={popupId}
          role="dialog"
          aria-label={`Filter ${label}`}
          className="table-filter-popup no-print text-left normal-case"
          style={position}
          onSubmit={applyFilter}
        >
          <strong>Filter {label}</strong>
          {filter.type === "date" ? (
            <>
              <label className="table-filter-date-field">Start Date
                <input name="startDate" type="date" defaultValue={filter.startDate} />
              </label>
              <label className="table-filter-date-field">End Date
                <input name="endDate" type="date" defaultValue={filter.endDate} />
              </label>
            </>
          ) : (
            <div className="table-filter-options">
              {[{ value: "", label: filter.allLabel }, ...filter.options].map(option => (
                <label key={option.value}>
                  <input type="radio" name={filter.name} value={option.value} defaultChecked={filter.value === option.value} />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          )}
          <div className="table-filter-actions">
            <button type="button" className="table-filter-secondary" onClick={() => navigate(
              filter.type === "date" ? { startDate: "", endDate: "" } : { [filter.name]: "" }
            )}>Clear</button>
            <button type="submit" className="table-filter-primary">Apply Filter</button>
          </div>
        </form>, document.body
      )}
    </>
  );
}
