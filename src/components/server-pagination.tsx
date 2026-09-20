import Link from "next/link";

import {
  CursorPaginationState,
  SearchParams,
  getNextHistory,
  getPreviousCursor,
  getPreviousHistory,
} from "@/lib/pagination";

type ServerPaginationProps = {
  hasNext: boolean;
  label?: string;
  nextCursor?: string;
  pathname: string;
  searchParams: SearchParams;
  state: CursorPaginationState;
};

function createUrl(
  pathname: string,
  searchParams: SearchParams,
  state: CursorPaginationState,
  direction: "next" | "previous",
  nextCursor?: string,
) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
    } else if (value) {
      query.set(key, value);
    }
  }

  query.delete("view");
  query.delete("edit");
  query.delete("page");

  if (direction === "next") {
    if (!nextCursor) return pathname;
    query.set(state.cursorParam, nextCursor);
    query.set(state.historyParam, getNextHistory(state).join(","));
  } else {
    const previousCursor = getPreviousCursor(state);
    if (previousCursor) query.set(state.cursorParam, previousCursor);
    else query.delete(state.cursorParam);

    const history = getPreviousHistory(state);
    if (history.length) query.set(state.historyParam, history.join(","));
    else query.delete(state.historyParam);
  }

  const queryString = query.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

export function ServerPagination({
  hasNext,
  label = "records",
  nextCursor,
  pathname,
  searchParams,
  state,
}: ServerPaginationProps) {
  if (!state.history.length && !hasNext) return null;

  return (
    <nav
      className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm"
      aria-label={`${label} pagination`}
    >
      {state.history.length ? (
        <Link
          className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 font-semibold text-brand"
          href={createUrl(pathname, searchParams, state, "previous")}
        >
          Previous
        </Link>
      ) : (
        <span
          className="inline-flex h-10 cursor-not-allowed items-center justify-center rounded-md border border-line px-4 font-semibold text-ink/40"
          aria-disabled="true"
        >
          Previous
        </span>
      )}
      <span className="font-semibold text-ink/80">
        Page {state.page}
      </span>
      {hasNext && nextCursor ? (
        <Link
          className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 font-semibold text-brand"
          href={createUrl(pathname, searchParams, state, "next", nextCursor)}
        >
          Next
        </Link>
      ) : (
        <span
          className="inline-flex h-10 cursor-not-allowed items-center justify-center rounded-md border border-line px-4 font-semibold text-ink/40"
          aria-disabled="true"
        >
          Next
        </span>
      )}
    </nav>
  );
}
