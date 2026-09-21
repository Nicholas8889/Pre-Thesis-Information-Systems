import { describe, expect, it } from "vitest";
import { getCardTitle } from "../../src/lib/card-help";

describe("card titles", () => {
  it("keeps an existing card title", () => {
    expect(
      getCardTitle({
        pathname: "/payments",
        existingTitle: "Recorded Payments",
        hasTable: true,
        hasForm: false
      })
    ).toBe("Recorded Payments");
  });

  it("generates a meaningful title for an untitled records card", () => {
    expect(
      getCardTitle({
        pathname: "/surat-jalan",
        hasTable: true,
        hasForm: false
      })
    ).toBe("Surat Jalan Records");
  });
});
