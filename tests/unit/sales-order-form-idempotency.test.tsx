import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "@playwright/test";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), insights: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireCurrentUser: mocks.user }));
vi.mock("@/lib/order-form-insights", () => ({ loadOrderFormInsights: mocks.insights }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/actions", () => ({
  createSalesOrder: vi.fn(), decideSalesOrderApproval: vi.fn(), generateInvoice: vi.fn()
}));

import { OrdersBySourcePage } from "../../src/components/orders-by-source-page";

const insights = {
  customers: [{
    id: "customer-1", companyName: "Company A", name: "Contact A", outstandingAmount: 0,
    openInvoiceCount: 0, paymentStatus: "Clean", overdueInvoiceCount: 0,
    paymentReliability: "No Payment History", paymentReliabilityEvidence: "No invoices",
    npwp: null, ppnApplied: false
  }],
  products: [{
    id: "product-1", productName: "Product A", listPrice: 100_000,
    latestProductionCost: null, averageProductionCost: null, coveredDays: 0, periodLabel: "October 2026"
  }]
};
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let browser: Browser;
let page: Page | undefined;
let script: string;

beforeAll(async () => {
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."), loader: "tsx",
      contents: `
        import React, { useEffect } from "react";
        import { createRoot } from "react-dom/client";
        import { SalesOrderForm } from "./src/components/sales-order-form";
        import { ActionConfirmationDialog } from "./src/components/action-confirmation-dialog";
        window.submissions = [];
        function App() {
          useEffect(() => { window.fixtureReady = true; }, []);
          return <>
            <SalesOrderForm {...window.fixtureProps} action={async data => {
              window.submissions.push({
                idempotencyKey: data.get("idempotencyKey"), source: data.get("source"),
                items: JSON.parse(data.get("items")), confirmationNote: data.get("confirmationNote")
              });
            }} />
            <ActionConfirmationDialog />
          </>;
        }
        createRoot(document.getElementById("root")).render(<App />);
      `
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    alias: { "@": resolve("src") },
    define: { "process.env.NODE_ENV": '"production"' }
  });
  script = bundle.outputFiles[0].text;
  browser = await chromium.launch({ channel: "chrome", headless: true });
}, 30000);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "sales-1", role: "SALES" });
  mocks.insights.mockResolvedValue(insights);
});
afterEach(async () => { await page?.close(); page = undefined; });
afterAll(async () => { await browser?.close(); });

async function pageToken(source: "DIRECT" | "CUSTOMER_PO") {
  const html = renderToStaticMarkup(await OrdersBySourcePage({
    source, searchParams: Promise.resolve({ mode: "create" })
  }));
  const token = html.match(/name="idempotencyKey" value="([^"]+)"/)?.[1];
  expect(token).toBeDefined();
  return token!;
}

describe("SO and PO submission tokens", () => {
  it.each(["DIRECT", "CUSTOMER_PO"] as const)("gives each %s request and user a different UUID", async source => {
    const first = await pageToken(source);
    const second = await pageToken(source);
    mocks.user.mockResolvedValue({ id: "sales-2", role: "SALES" });
    const otherUser = await pageToken(source);
    for (const token of [first, second, otherUser]) expect(token).toMatch(uuidV4);
    expect(new Set([first, second, otherUser]).size).toBe(3);
  });

  it("does not reuse a Sales Order token for a new Customer PO", async () => {
    expect(await pageToken("DIRECT")).not.toBe(await pageToken("CUSTOMER_PO"));
  });

  it.each(["DIRECT", "CUSTOMER_PO"] as const)("keeps the %s token through editing, Cancel, and confirmed submission", async source => {
    const token = await pageToken(source);
    page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    await page.evaluate(props => {
      (window as unknown as { fixtureProps: typeof props }).fixtureProps = props;
    }, {
      ...insights, source, idempotencyKey: token, ppnRateBasisPoints: 1100, initialCustomerId: "customer-1",
      initialItems: [{ productId: "product-1", itemName: "Product A", quantity: 1,
        baseUnitPrice: 100_000, markupPercent: 0, discountPercent: 0 }]
    });
    await page.addScriptTag({ content: script });
    await page.waitForFunction(() => (window as unknown as { fixtureReady: boolean }).fixtureReady);
    const tokenInput = page.locator('input[name="idempotencyKey"]');
    expect(await tokenInput.inputValue()).toBe(token);
    await page.getByLabel("Qty", { exact: true }).fill("3");
    await page.locator('select[name="paymentTermType"]').selectOption("CREDIT");
    await page.locator('select[name="paymentTermType"]').selectOption("IMMEDIATE");
    if (source === "CUSTOMER_PO") {
      await page.locator('input[name="requiredDate"]').fill("2026-10-25");
      await page.locator('input[name="customerPoDocument"]').setInputFiles({
        name: "po.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nfixture")
      });
    }
    expect(await tokenInput.inputValue()).toBe(token);
    const create = page.getByRole("button", {
      name: source === "CUSTOMER_PO" ? "Create Customer PO" : "Create Sales Order", exact: true
    });
    await create.click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    expect(await tokenInput.inputValue()).toBe(token);
    expect(await page.evaluate(() => (window as unknown as { submissions: unknown[] }).submissions)).toEqual([]);
    await create.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("Create this order");
    await dialog.getByRole("button", { name: "Submit", exact: true }).click();
    await page.waitForFunction(() => (window as unknown as { submissions: unknown[] }).submissions.length === 1);
    expect(await page.evaluate(() => (window as unknown as { submissions: object[] }).submissions)).toEqual([{
      idempotencyKey: token, source, confirmationNote: "Create this order",
      items: [{ productId: "product-1", itemName: "Product A", quantity: 3,
        baseUnitPrice: 100_000, markupPercent: 0, discountPercent: 0, finalUnitPrice: 100_000 }]
    }]);
    expect(await dialog.count()).toBe(0);
  });
});
