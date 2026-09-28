import { describe, expect, it } from "vitest";
import { buildPortfolioScope } from "../../src/lib/portfolio-scope";

describe("portfolio scope", () => {
  it("scopes every business aggregate for Sales", () => {
    const scope = buildPortfolioScope({ id: "sales-a", role: "SALES" });

    expect(scope.customerWhere).toEqual({ portfolioOwnerUserId: "sales-a" });
    expect(scope.salesOrderWhere).toEqual({ createdByUserId: "sales-a" });
    expect(scope.invoiceWhere).toEqual({
      salesOrder: { createdByUserId: "sales-a" }
    });
    expect(scope.paymentWhere).toEqual({
      invoice: { salesOrder: { createdByUserId: "sales-a" } }
    });
    expect(scope.inquiryWhere).toEqual({
      customer: { portfolioOwnerUserId: "sales-a" }
    });
    expect(scope.collectionTaskWhere).toEqual({
      customer: { portfolioOwnerUserId: "sales-a" }
    });
  });

  it.each(["ADMIN", "MANAGER"] as const)(
    "keeps company-wide scope for %s",
    role => {
      const scope = buildPortfolioScope({ id: role.toLowerCase(), role });
      expect(scope.customerWhere).toEqual({});
      expect(scope.salesOrderWhere).toEqual({});
      expect(scope.invoiceWhere).toEqual({});
      expect(scope.paymentWhere).toEqual({});
    }
  );
});
