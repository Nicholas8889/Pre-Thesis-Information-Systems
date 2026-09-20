import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  getCursorArgs,
  getCursorPage,
  getCursorPagination,
  getNextHistory,
  getPreviousCursor,
  getPreviousHistory
} from "../../src/lib/pagination";

describe("server cursor pagination", () => {
  it("starts on the first page without a database cursor", () => {
    const state = getCursorPagination({});

    expect(state).toMatchObject({ cursor: undefined, history: [], page: 1 });
    expect(getCursorArgs(state)).toEqual({ take: DEFAULT_PAGE_SIZE + 1 });
  });

  it("uses namespaced cursor parameters for independent tables", () => {
    const state = getCursorPagination(
      {
        paymentcursor: "payment-21",
        paymentcursorHistory: "~,payment-1"
      },
      "payment"
    );

    expect(state).toMatchObject({
      cursor: "payment-21",
      cursorParam: "paymentcursor",
      historyParam: "paymentcursorHistory",
      history: ["~", "payment-1"],
      page: 3
    });
    expect(getCursorArgs(state)).toEqual({
      take: DEFAULT_PAGE_SIZE + 1,
      cursor: { id: "payment-21" },
      skip: 1
    });
  });

  it("returns one page and uses the last displayed record as the next cursor", () => {
    const records = Array.from({ length: DEFAULT_PAGE_SIZE + 1 }, (_, index) => ({
      id: `record-${index + 1}`
    }));
    const state = getCursorPagination({});
    const page = getCursorPage(records, state);

    expect(page.items).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(page.hasNext).toBe(true);
    expect(page.nextCursor).toBe(`record-${DEFAULT_PAGE_SIZE}`);
  });

  it("tracks enough history to navigate back to the first page", () => {
    const firstPage = getCursorPagination({});
    expect(getNextHistory(firstPage)).toEqual(["~"]);

    const secondPage = getCursorPagination({
      cursor: "record-20",
      cursorHistory: "~"
    });
    expect(getPreviousCursor(secondPage)).toBeUndefined();
    expect(getPreviousHistory(secondPage)).toEqual([]);
  });

  it("caps cursor history so pagination URLs stay bounded", () => {
    const history = Array.from({ length: 100 }, (_, index) => `record-${index}`);
    const state = getCursorPagination({
      cursor: "record-100",
      cursorHistory: history.join(",")
    });

    expect(getNextHistory(state)).toHaveLength(100);
    expect(getNextHistory(state).at(-1)).toBe("record-100");
  });
});
