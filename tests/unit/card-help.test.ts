import { describe, expect, it } from "vitest";
import { getCardHelpMetadata } from "../../src/lib/card-help";

describe("card titles and help descriptions", () => {
  it("keeps an existing card title and explains table usage", () => {
    expect(
      getCardHelpMetadata({
        pathname: "/payments",
        existingTitle: "Recorded Payments",
        hasTable: true,
        hasForm: false
      })
    ).toEqual({
      title: "Recorded Payments",
      description: "Use this card to view, search, filter, and manage payment records."
    });
  });

  it("generates a meaningful title for an untitled records card", () => {
    expect(
      getCardHelpMetadata({
        pathname: "/surat-jalan",
        hasTable: true,
        hasForm: false
      }).title
    ).toBe("Surat Jalan Records");
  });
});
