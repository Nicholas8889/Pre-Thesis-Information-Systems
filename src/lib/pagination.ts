export const DEFAULT_PAGE_SIZE = 20;

export type SearchParams = Record<string, string | string[] | undefined>;

const FIRST_PAGE = "~";
const MAX_HISTORY = 100;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export type CursorPaginationState = {
  cursor?: string;
  cursorParam: string;
  history: string[];
  historyParam: string;
  page: number;
};

export function getCursorPagination(
  searchParams: SearchParams,
  namespace = "",
): CursorPaginationState {
  const cursorParam = `${namespace}cursor`;
  const historyParam = `${namespace}cursorHistory`;
  const cursor = firstValue(searchParams[cursorParam]) || undefined;
  const history = (firstValue(searchParams[historyParam]) ?? "")
    .split(",")
    .filter(Boolean)
    .slice(-MAX_HISTORY);

  return {
    cursor,
    cursorParam,
    history,
    historyParam,
    page: history.length + 1,
  };
}

export function getCursorArgs(
  state: CursorPaginationState,
  pageSize = DEFAULT_PAGE_SIZE,
) {
  return {
    take: pageSize + 1,
    ...(state.cursor ? { cursor: { id: state.cursor }, skip: 1 } : {}),
  };
}

export function getCursorPage<T extends { id: string }>(
  records: T[],
  state: CursorPaginationState,
  pageSize = DEFAULT_PAGE_SIZE,
) {
  const items = records.slice(0, pageSize);

  return {
    hasNext: records.length > pageSize,
    hasPrevious: state.history.length > 0,
    items,
    nextCursor: items.at(-1)?.id,
    page: state.page,
  };
}

export function getPreviousCursor(state: CursorPaginationState) {
  const previous = state.history.at(-1);
  return previous && previous !== FIRST_PAGE ? previous : undefined;
}

export function getNextHistory(state: CursorPaginationState) {
  return [...state.history, state.cursor ?? FIRST_PAGE].slice(-MAX_HISTORY);
}

export function getPreviousHistory(state: CursorPaginationState) {
  return state.history.slice(0, -1);
}
