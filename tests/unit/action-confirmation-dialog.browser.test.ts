import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

let browser: Browser;
let page: Page;
let script: string;

beforeAll(async () => {
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."), loader: "tsx",
      contents: `
        import React, { useEffect } from "react";
        import { createRoot } from "react-dom/client";
        import { PickingListPanel } from "./src/components/picking-list-panel";
        import { ActionConfirmationDialog } from "./src/components/action-confirmation-dialog";
        window.submissions = [];
        window.searchSubmissions = [];
        const record = async data => window.submissions.push(Object.fromEntries(data));
        const list = {
          id: "sheet", pickingListNumber: "PL-SO-2026-033", status: "Packed",
          usesChecklist: true, updatedAt: new Date("2026-10-15T00:00:00Z"),
          packedAt: new Date("2026-10-15T00:00:00Z"), pickerName: "Anton", packerName: "Anton",
          deliveryNote: null, notes: "Internal note",
          items: [{ id: "item", itemName: "Product A", orderedQuantity: 14,
            availableQuantity: 14, packedQuantity: 14, availabilityStatus: "Available", isChecked: true }],
          salesOrder: { id: "order", orderNumber: "SO-2026-033", status: "Invoiced",
            approvalStatus: "Approved", requiredDate: null, customer: { companyName: "Company A1" },
            invoice: { status: "Paid", paymentTermType: "IMMEDIATE" } }
        };
        function App({ legacy }) {
          useEffect(() => { window.fixtureReady = true; }, []);
          return <>
            <PickingListPanel list={{ ...list, usesChecklist: !legacy }} canManage />
            <form id="optional-action" action={record}>
              <button name="intent" value="save">Save example</button>
              <button name="intent" value="complete">Complete example</button>
            </form>
            <form action={record} data-no-action-confirmation="true">
              <button name="intent" value="opt-out">Opt out</button>
            </form>
            <form action="/post" method="post" onSubmit={event => {
              if (!event.defaultPrevented) {
                window.submissions.push(Object.fromEntries(new FormData(event.currentTarget)));
                event.preventDefault();
              }
            }}>
              <button>Existing POST action</button>
            </form>
            <form action="/search" method="get" onSubmit={event => {
              window.searchSubmissions.push({ wasPrevented: event.defaultPrevented });
              event.preventDefault();
            }}>
              <input name="q" defaultValue="SO-2026-033" />
              <button>Search example</button>
            </form>
            <ActionConfirmationDialog />
          </>;
        }
        const root = createRoot(document.getElementById("root"));
        window.renderFixture = (legacy = false) => {
          window.fixtureReady = false;
          root.render(<App key={String(legacy)} legacy={legacy} />);
        };
        window.renderFixture();
      `
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    alias: { "@": resolve("src") },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{
      name: "confirmation-test-adapters",
      setup(builder) {
        builder.onResolve({ filter: /^next\/link$|^@\/lib\/picking-list-actions$/ }, ({ path }) => ({ path, namespace: "confirmation-test" }));
        builder.onLoad({ filter: /.*/, namespace: "confirmation-test" }, ({ path }) => ({
          loader: "js", resolveDir: resolve("."),
          contents: path === "next/link"
            ? `import React from "react"; export default function Link({href, children, ...props}) {
                return React.createElement("a", {href, ...props}, children);
              }`
            : `export async function reopenPickingList(data) { window.submissions.push(Object.fromEntries(data)); }
               export async function savePickingList(data) { window.submissions.push(Object.fromEntries(data)); }`
        }));
      }
    }]
  });
  script = bundle.outputFiles[0].text;
  browser = await chromium.launch({ channel: "chrome", headless: true });
}, 30000);

beforeEach(async () => {
  page = await browser.newPage();
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: script });
  await page.waitForFunction(() => (window as unknown as { fixtureReady: boolean }).fixtureReady);
});

afterEach(async () => { await page?.close(); });
afterAll(async () => { await browser?.close(); });

async function submissions() {
  return page.evaluate(() => (window as unknown as { submissions: Record<string, string>[] }).submissions);
}

describe("action confirmation dialog in a browser", () => {
  it.each([false, true])("requires a reason before reopening a client-rendered sheet (legacy=%s)", async legacy => {
    if (legacy) {
      await page.evaluate(() => (window as unknown as { renderFixture: (legacy: boolean) => void }).renderFixture(true));
      await page.waitForFunction(() => (window as unknown as { fixtureReady: boolean }).fixtureReady);
    }
    const form = page.locator('form[data-confirm-title="Reopen Picking List"]');
    expect(await form.evaluate(form => (form as HTMLFormElement).method)).toBe("get");
    expect(await form.getAttribute("method")).toBeNull();
    await page.getByRole("button", { name: "Reopen", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    expect(await dialog.getByRole("heading").textContent()).toContain("Reopen Picking List");
    const submit = dialog.getByRole("button", { name: "Submit", exact: true });
    expect(await submit.isDisabled()).toBe(true);
    expect(await submissions()).toEqual([]);
    await dialog.getByRole("textbox").fill("   ");
    expect(await submit.isDisabled()).toBe(true);
    await dialog.getByRole("textbox").fill("  Periksa ulang packing  ");
    await submit.click();
    await page.waitForFunction(() => (window as unknown as { submissions: unknown[] }).submissions.length === 1);
    expect(await submissions()).toEqual([{
      id: "sheet", version: "2026-10-15T00:00:00.000Z", confirmationNote: "Periksa ulang packing"
    }]);
    expect(await dialog.count()).toBe(0);
  });

  it("cancels reopening without submitting the action", async () => {
    await page.getByRole("button", { name: "Reopen", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(await submissions()).toEqual([]);
    expect(await dialog.count()).toBe(0);
  });

  it("keeps notes optional and preserves the selected submitter for other function actions", async () => {
    await page.getByRole("button", { name: "Save example", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const submit = dialog.getByRole("button", { name: "Submit", exact: true });
    await submit.waitFor();
    expect(await submit.isDisabled()).toBe(false);
    expect(await submissions()).toEqual([]);
    await submit.click();
    await page.waitForFunction(() => (window as unknown as { submissions: unknown[] }).submissions.length === 1);
    expect(await submissions()).toEqual([{ intent: "save", confirmationNote: "" }]);
    expect(await dialog.count()).toBe(0);
  });

  it("continues to skip explicit GET search forms", async () => {
    await page.getByRole("button", { name: "Search example", exact: true }).click();
    expect(await page.evaluate(() => (window as unknown as { searchSubmissions: object[] }).searchSubmissions))
      .toEqual([{ wasPrevented: false }]);
    expect(await page.getByRole("dialog").count()).toBe(0);
    expect(await submissions()).toEqual([]);
  });

  it("continues to confirm explicit POST forms before submitting their note", async () => {
    await page.getByRole("button", { name: "Existing POST action", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("Checked the existing POST action");
    expect(await submissions()).toEqual([]);
    await dialog.getByRole("button", { name: "Submit", exact: true }).click();
    await page.waitForFunction(() => (window as unknown as { submissions: unknown[] }).submissions.length === 1);
    expect(await submissions()).toEqual([{ confirmationNote: "Checked the existing POST action" }]);
    expect(await dialog.count()).toBe(0);
  });

  it("continues to skip forms that explicitly opt out", async () => {
    await page.getByRole("button", { name: "Opt out", exact: true }).click();
    await page.waitForFunction(() => (window as unknown as { submissions: unknown[] }).submissions.length === 1);
    expect(await submissions()).toEqual([{ intent: "opt-out" }]);
    expect(await page.getByRole("dialog").count()).toBe(0);
  });
});
