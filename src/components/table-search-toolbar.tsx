"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

type TableSearchToolbarProps = {
  defaultValue?: string;
  placeholder: string;
  resetHref: string;
  loadedCount: number;
  totalCount?: number;
  page?: number;
  children?: ReactNode;
};

export function TableSearchToolbar({
  defaultValue = "",
  placeholder,
  resetHref,
  loadedCount,
  totalCount,
  page = 1,
  children
}: TableSearchToolbarProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedQueryRef = useRef(defaultValue);
  const awaitingQueryRef = useRef<string | null>(null);
  const pathname = resetHref.split("?")[0];
  const start = loadedCount ? (page - 1) * DEFAULT_PAGE_SIZE + 1 : 0;
  const countText = totalCount === undefined
    ? `${loadedCount} loaded on this page`
    : `Showing ${start}-${loadedCount ? start + loadedCount - 1 : 0} of ${totalCount}`;

  useEffect(() => {
    if (awaitingQueryRef.current !== null && awaitingQueryRef.current !== defaultValue) return;
    awaitingQueryRef.current = null;
    const input = inputRef.current;
    if (input && input.value === submittedQueryRef.current) {
      input.value = defaultValue;
      submittedQueryRef.current = defaultValue;
    }
  }, [defaultValue]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  function cancelSearch() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function submitSearch() {
    cancelSearch();
    if (!formRef.current) return;
    const params = new URLSearchParams();
    new FormData(formRef.current).forEach((value, key) => {
      if (typeof value === "string" && value.trim()) params.set(key, value.trim());
    });
    submittedQueryRef.current = inputRef.current?.value ?? "";
    const submittedQuery = params.get("q") ?? "";
    awaitingQueryRef.current = submittedQuery === defaultValue ? null : submittedQuery;
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitSearch();
  }

  return (
    <form
      ref={formRef}
      action={pathname}
      method="get"
      onSubmit={onSubmit}
      data-table-search-toolbar="true"
      className="no-print"
    >
      <div className="table-enhancer-toolbar" data-table-toolbar="true">
        <label className="table-enhancer-search">
          Search
          <input
            ref={inputRef}
            type="search"
            name="q"
            defaultValue={defaultValue}
            placeholder={placeholder}
            onChange={() => {
              cancelSearch();
              timerRef.current = setTimeout(submitSearch, 400);
            }}
          />
        </label>
        <span className="table-enhancer-count" data-table-server-count={countText} aria-live="polite">
          {countText}
        </span>
        <Link
          href={resetHref}
          scroll={false}
          className="table-enhancer-reset"
          onClick={() => {
            cancelSearch();
            if (inputRef.current) inputRef.current.value = "";
            submittedQueryRef.current = "";
            awaitingQueryRef.current = null;
            formRef.current?.dispatchEvent(new Event("table-tools-reset"));
          }}
        >
          Reset
        </Link>
        <button type="submit" className="sr-only">Search</button>
      </div>
      {children}
    </form>
  );
}
