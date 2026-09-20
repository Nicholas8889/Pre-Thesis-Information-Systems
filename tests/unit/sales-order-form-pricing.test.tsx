import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SalesOrderForm } from "../../src/components/sales-order-form";
import { formatCurrency } from "../../src/lib/format";

const initialItems = [
  {
    productId: "product-1",
    itemName: "Product A",
    quantity: 1,
    baseUnitPrice: 1_800_000,
    markupPercent: 0,
    discountPercent: 0
  }
];

describe("SalesOrderForm product pricing insight", () => {
  it("shows only the latest base price reference when the product has no eligible sales", () => {
    const html = renderForm(null, 0);

    expect(html).toContain("Latest Base Price");
    expect(html).toContain(formatCurrency(1_800_000));
    expect(html).toContain("No eligible sales in September 2026");
    expect(html).not.toContain("Average Sold Price - This Month");
    expect(html).not.toContain("Selisih Nominal");
  });

  it("shows base price and cumulative weighted average when eligible sales exist", () => {
    const html = renderForm(1_761_905, 21);

    expect(html).toContain("Latest Base Price");
    expect(html).toContain("Average Sold Price - This Month");
    expect(html).toContain(formatCurrency(1_761_905));
    expect(html).toContain("21 eligible unit(s) in September 2026, cumulative through today.");
    expect(html).toContain("Selisih Nominal");
  });
});

function renderForm(averageSoldPrice: number | null, averageEligibleQuantity: number) {
  return renderToStaticMarkup(
    <SalesOrderForm
      customers={[]}
      products={[
        {
          id: "product-1",
          productName: "Product A",
          listPrice: 1_800_000,
          averageSoldPrice,
          averageEligibleQuantity,
          averageMonthLabel: "September 2026"
        }
      ]}
      ppnRateBasisPoints={1100}
      action={() => undefined}
      initialItems={initialItems}
    />
  );
}
