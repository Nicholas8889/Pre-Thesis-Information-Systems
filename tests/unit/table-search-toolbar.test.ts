import { resolve } from "node:path";
import { readFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "@playwright/test";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

let browser: Browser;
let page: Page;
let script: string;
let css: string;

beforeAll(async () => {
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."),
      loader: "tsx",
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { TableSearchToolbar } from "./src/components/table-search-toolbar";
        import { TableEnhancer } from "./src/components/table-enhancer";
        window.routerCalls = [];
        const root = createRoot(document.getElementById("root"));
        window.renderFixture = (overrides = {}) => {
          const props = { defaultValue: "", placeholder: "Search order, PO number, or customer",
            resetHref: "/sales-orders?tab=done", loadedCount: 3, totalCount: 103, page: 1,
            paymentTermType: "CREDIT", empty: false, ...overrides };
          root.render(<main className="app-main p-5">
            <section id="server-card" className="shadow-card rounded-md border border-line bg-white p-5">
              <h2 className="mb-4 text-lg font-semibold">Sales Order Records</h2>
              <TableSearchToolbar {...props}>
                <input type="hidden" name="tab" value="done" />
                <div className="table-search-filters" key={props.paymentTermType}>
                  <label>Payment terms<select name="paymentTermType" defaultValue={props.paymentTermType}
                    className="h-10 rounded-md border border-line px-3 text-sm">
                    <option value="">All payment terms</option><option value="CREDIT">Credit</option>
                  </select></label>
                  <button className="h-10 rounded-md bg-brand px-4 text-sm font-semibold text-white">Apply</button>
                </div>
              </TableSearchToolbar>
              {props.empty ? <p>No matching orders.</p> : <table data-server-paginated="true">
                <thead><tr><th>Customer</th><th>Status</th></tr></thead>
                <tbody>{["Zulu", "Alpha", "Beta"].map((name, i) =>
                  <tr key={name + props.defaultValue}><td>{name}</td><td>{i < 2 ? "Paid" : "Open"}</td></tr>
                )}</tbody>
              </table>}
            </section>
            <section id="local-card" className="shadow-card mt-5 rounded-md border border-line bg-white p-5">
              <h2 className="mb-4 text-lg font-semibold">Local table</h2>
              <table><thead><tr><th>Name</th></tr></thead><tbody>
                <tr><td>Local Alpha</td></tr><tr><td>Local Beta</td></tr>
              </tbody></table>
            </section>
            <TableEnhancer />
          </main>);
        };
        window.renderFixture();
      `
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    alias: { "@": resolve("src") },
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{
      name: "next-test-router",
      setup(builder) {
        builder.onResolve({ filter: /^next\/(navigation|link)$/ }, ({ path }) => ({ path, namespace: "next-test" }));
        builder.onLoad({ filter: /.*/, namespace: "next-test" }, ({ path }) => ({
          loader: "js",
          resolveDir: resolve("."),
          contents: path === "next/navigation"
            ? `export const usePathname = () => "/sales-orders";
               export const useRouter = () => ({ replace: (href, options) => window.routerCalls.push({href, options}) });`
            : `import React from "react";
               export default function Link({href, scroll, onClick, ...props}) {
                 return React.createElement("a", {href, ...props, onClick: (event) => {
                   onClick?.(event); event.preventDefault(); window.routerCalls.push({href, reset: true});
                 }});
               }`
        }));
      }
    }]
  });
  script = bundle.outputFiles[0].text;
  css = (await postcss([tailwindcss({ config: resolve("tailwind.config.ts") })])
    .process(await readFile("src/styles/globals.css", "utf8"), { from: resolve("src/styles/globals.css") })).css;
  browser = await chromium.launch({ channel: "chrome", headless: true });
}, 30000);

beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await page.waitForSelector('#local-card table[data-table-enhanced="true"]');
});

afterEach(async () => { await page?.close(); });
afterAll(async () => { await browser?.close(); });

describe("table search toolbar in a browser", () => {
  it("provides one server search and Reset while preserving the separate local table", async () => {
    expect(await page.locator("#server-card input[type=search]").count()).toBe(1);
    expect(await page.locator("#server-card .table-enhancer-toolbar").count()).toBe(1);
    expect(await page.locator("#server-card .table-enhancer-reset").count()).toBe(1);
    expect(await page.locator("#server-card .table-enhancer-count").textContent()).toBe("Showing 1-3 of 103");
    await page.locator("#local-card input[type=search]").fill("Beta");
    expect(await page.locator("#local-card tbody tr:visible").count()).toBe(1);
    expect(await page.locator("#server-card tbody tr:visible").count()).toBe(3);
  });

  it("searches the server after typing, preserves filters and tabs, and leaves loaded rows alone", async () => {
    await page.locator("#server-card input[name=q]").fill("Customer on another page");
    expect(await page.locator("#server-card tbody tr:visible").count()).toBe(3);
    await page.waitForFunction(() => (window as unknown as {routerCalls: unknown[]}).routerCalls.length === 1);
    const calls = await page.evaluate(() => (window as unknown as {routerCalls: {href: string}[]}).routerCalls);
    const params = new URL(calls[0].href, "http://localhost").searchParams;
    expect(params.get("q")).toBe("Customer on another page");
    expect(params.get("tab")).toBe("done");
    expect(params.get("paymentTermType")).toBe("CREDIT");
    expect(params.has("cursor")).toBe(false);
    await page.locator("#server-card input[name=q]").press("Enter");
    expect(await page.evaluate(() => (window as unknown as {routerCalls: unknown[]}).routerCalls.length)).toBe(2);
  });

  it("resets column filters and sorting, restores the server count, and preserves the tab", async () => {
    await page.getByRole("button", { name: "Filter Status", exact: true }).click();
    await page.locator(".table-filter-popup:visible").getByLabel("Paid", { exact: true }).check();
    await page.getByRole("button", { name: "Apply Filter", exact: true }).click();
    expect(await page.locator("#server-card tbody tr:visible").count()).toBe(2);
    await page.getByRole("button", { name: "Sort by Customer", exact: true }).click();
    await page.locator("#server-card input[name=q]").fill("Pending search");
    await page.locator("#server-card .table-enhancer-reset").click();
    expect(await page.locator("#server-card tbody tr:visible").count()).toBe(3);
    expect(await page.locator("#server-card tbody tr:first-child td:first-child").textContent()).toBe("Zulu");
    expect(await page.locator("#server-card .table-enhancer-count").textContent()).toBe("Showing 1-3 of 103");
    expect(await page.evaluate(() => (window as unknown as {routerCalls: {href: string}[]}).routerCalls.at(-1)?.href))
      .toBe("/sales-orders?tab=done");
    await page.waitForTimeout(450);
    expect(await page.evaluate(() => (window as unknown as {routerCalls: unknown[]}).routerCalls.length)).toBe(1);
  });

  it("preserves newer typing when an earlier server response arrives", async () => {
    const input = page.locator("#server-card input[name=q]");
    await input.fill("First query");
    await input.press("Enter");
    await input.fill("Second query");
    await input.press("Enter");
    await page.evaluate(() => (window as unknown as {renderFixture: (props: object) => void}).renderFixture({
      defaultValue: "First query"
    }));
    await page.waitForFunction(() => document.querySelector('input[name=q]')?.getAttribute("value") === "First query");
    expect(await input.inputValue()).toBe("Second query");
    expect(await page.locator("#server-card input[type=search]").count()).toBe(1);
    await page.evaluate(() => (window as unknown as {renderFixture: (props: object) => void}).renderFixture({
      defaultValue: "Second query"
    }));
    await page.waitForFunction(() => document.querySelector('input[name=q]')?.getAttribute("value") === "Second query");
    await page.evaluate(() => (window as unknown as {renderFixture: (props: object) => void}).renderFixture({
      defaultValue: "First query"
    }));
    await page.waitForFunction(() => (document.querySelector('input[name=q]') as HTMLInputElement)?.value === "First query");
  });

  it("keeps the toolbar after empty results and refreshes filter values after Reset", async () => {
    await page.evaluate(() => (window as unknown as {renderFixture: (props: object) => void}).renderFixture({
      defaultValue: "Missing", empty: true, loadedCount: 0, totalCount: 0, paymentTermType: ""
    }));
    await page.waitForSelector("#server-card table", { state: "detached" });
    expect(await page.locator("#server-card input[name=q]").inputValue()).toBe("Missing");
    expect(await page.locator("#server-card select").inputValue()).toBe("");
    expect(await page.locator("#server-card .table-enhancer-toolbar").count()).toBe(1);
    expect(await page.locator("#server-card .table-enhancer-count").textContent()).toBe("Showing 0-0 of 0");
    await page.locator("#server-card .table-enhancer-reset").click();
    expect(await page.locator("#server-card input[name=q]").inputValue()).toBe("");
  });

  it("keeps the desktop toolbar aligned and wraps within a mobile viewport", async () => {
    const input = await page.locator("#server-card input[name=q]").boundingBox();
    const count = await page.locator("#server-card .table-enhancer-count").boundingBox();
    const reset = await page.locator("#server-card .table-enhancer-reset").boundingBox();
    expect(input?.y).toBe(count?.y);
    expect(input?.y).toBe(reset?.y);
    await mkdir("tmp", { recursive: true });
    await page.screenshot({ path: "tmp/table-search-toolbar-desktop.png" });
    await page.setViewportSize({ width: 375, height: 700 });
    const mobileInput = await page.locator("#server-card input[name=q]").boundingBox();
    expect((mobileInput?.x ?? 0) + (mobileInput?.width ?? 0)).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
    await page.screenshot({ path: "tmp/table-search-toolbar-mobile.png" });
  });
});
