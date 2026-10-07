import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SalesOrderForm } from "../../src/components/sales-order-form";
import { formatCurrency } from "../../src/lib/format";

describe("SO and Customer PO production cost insight", () => {
  it("shows an explicit unavailable state without cost history", () => {
    const html = renderForm(null, 0);

    expect(html).toContain("Latest Production Cost / Unit");
    expect(html).toContain("Average Production Cost - Last 30 Days");
    expect(html).toContain("Average production cost unavailable");
    expect(html).toContain("No production cost history available");
    expect(html).not.toContain("Selisih Harga terhadap Average Cost");
    expect(html).not.toContain("Average Sold Price");
  });

  it.each(["DIRECT", "CUSTOMER_PO"] as const)(
    "shows time-weighted cost guidance for %s without changing the order total",
    (source) => {
      const html = renderForm(10_667, 30, source);
      expect(html).toContain(formatCurrency(10_667));
      expect(html).toContain("30 day(s) of cost history");
      expect(html).toContain("Weighted by time in effect");
      expect(html).toContain("Selisih Harga terhadap Average Cost");
      expect(html).toContain('&quot;baseUnitPrice&quot;:15000');
      expect(html).toContain('&quot;finalUnitPrice&quot;:15000');
    }
  );

  it("excludes PPN when comparing selling price with cost", () => {
    const html = renderForm(13_514, 10, "DIRECT", true);
    expect(html).toContain("Proposed Unit Price (Excluding PPN)");
    expect(html).toContain(formatCurrency(13_514));
    expect(html).toContain("Selisih terhadap Cost (%)");
    expect(html).toContain("0%");
    expect(html).not.toContain("+11%");
    expect(html).toContain('&quot;finalUnitPrice&quot;:15000');
  });

  it("waits for customer tax identity before calculating the comparison", () => {
    const html = renderForm(10_000, 30, "DIRECT", false, false);
    expect(html).toContain("Select a customer");
    expect(html).toContain("Not available");
    expect(html).not.toContain("+50%");
  });
});

function renderForm(
  averageProductionCost: number | null,
  coveredDays: number,
  source: "DIRECT" | "CUSTOMER_PO" = "DIRECT",
  ppnApplied = false,
  selectCustomer = true
) {
  return renderToStaticMarkup(
    <SalesOrderForm
      customers={[{
        id: "customer-1", companyName: "Company A", name: "Contact A",
        outstandingAmount: 0, openInvoiceCount: 0, paymentStatus: "Clean",
        overdueInvoiceCount: 0, paymentReliability: "No Payment History",
        paymentReliabilityEvidence: "No invoices", npwp: ppnApplied ? "123" : null,
        ppnApplied
      }]}
      initialCustomerId={selectCustomer ? "customer-1" : ""}
      products={[
        {
          id: "product-1",
          productName: "Product A",
          listPrice: 12_000,
          latestProductionCost: 12_000,
          averageProductionCost,
          coveredDays,
          periodLabel: "4 Sep 2026 – 4 Oct 2026 (WIB)"
        }
      ]}
      ppnRateBasisPoints={1100}
      action={() => undefined}
      initialItems={[{
        productId: "product-1", itemName: "Product A", quantity: 1,
        baseUnitPrice: 15_000, markupPercent: 0, discountPercent: 0
      }]}
      source={source}
    />
  );
}
