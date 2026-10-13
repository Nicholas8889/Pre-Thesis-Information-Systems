import { resolve } from "node:path";
import { mkdir, readFile } from "node:fs/promises";
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
      resolveDir: resolve("."), loader: "tsx",
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { CollectionTaskForm } from "./src/components/collection-task-form";
        import { ActionConfirmationDialog } from "./src/components/action-confirmation-dialog";
        const root = createRoot(document.getElementById("root"));
        window.submissions = [];
        window.renderFixture = ({ mode = "edit", status = "Planned" } = {}) => {
          root.render(<main className="app-main p-5">
            <section className="shadow-card rounded-md border border-line bg-white p-5">
              <h2 className="mb-4 text-lg font-semibold">{mode === "create" ? "Add Collection Task" : status === "Planned" ? "Edit Collection Task" : "Collection Task Details"}</h2>
              <CollectionTaskForm key={mode + status}
                customers={[{id:"customer", companyName:"CV Tajuk Customer", name:"Contact"}]}
                invoices={[]} customerId="customer" scheduledDate="2026-10-16" notes="Call customer Friday"
                task={mode === "create" ? undefined : {id:"task", version:4, status, customerName:"CV Tajuk Customer - Contact"}}
              />
            </section>
            <ActionConfirmationDialog />
          </main>);
        };
        window.renderFixture();
      `
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    alias: { "@": resolve("src") },
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{
      name: "collection-test-adapters",
      setup(builder) {
        builder.onResolve({ filter: /^next\/link$|^@\/lib\/actions$/ }, ({ path }) => ({ path, namespace: "collection-test" }));
        builder.onLoad({ filter: /.*/, namespace: "collection-test" }, ({ path }) => ({
          loader: "js", resolveDir: resolve("."),
          contents: path === "next/link"
            ? `import React from "react"; export default function Link({href, children, ...props}) {
                return React.createElement("a", {href, ...props, onClick:event=>{
                  event.preventDefault(); window.renderFixture({mode:"create"});
                }}, children);
              }`
            : `export async function updateCollectionTask(data) { window.submissions.push(Object.fromEntries(data)); }
               export async function createCollectionTask(data) { window.submissions.push(Object.fromEntries(data)); }`
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
  page = await browser.newPage({ viewport: { width: 1400, height: 680 } });
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: script });
  await page.waitForSelector('select[name="status"]');
});
afterEach(async () => { await page?.close(); });
afterAll(async () => { await browser?.close(); });

describe("Collection task form interactions", () => {
  it("saves edited notes, date and terminal status together with an inline required reason", async () => {
    await page.locator('input[name="notes"]').fill("Customer contacted; follow-up finished");
    await page.locator('input[name="scheduledDate"]').fill("2026-10-17");
    await page.locator('select[name="status"]').selectOption("Done");
    expect(await page.locator('input[name="confirmationNote"]').evaluate(input => (input as HTMLInputElement).required)).toBe(true);
    await page.getByRole("button", { name: "Save Changes" }).click();
    expect(await page.evaluate(() => (window as unknown as {submissions: unknown[]}).submissions.length)).toBe(0);
    await page.locator('input[name="confirmationNote"]').fill("Customer follow-up completed");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await page.waitForFunction(() => (window as unknown as {submissions: unknown[]}).submissions.length === 1);
    expect(await page.evaluate(() => (window as unknown as {submissions: object[]}).submissions[0])).toMatchObject({
      taskId: "task", expectedVersion: "4", status: "Done", scheduledDate: "2026-10-17",
      notes: "Customer contacted; follow-up finished", confirmationNote: "Customer follow-up completed"
    });
    expect(await page.getByRole("dialog").count()).toBe(0);
  });

  it("makes the reason optional again for Planned and returns to the creation form", async () => {
    await page.locator('select[name="status"]').selectOption("Cancelled");
    await page.locator('select[name="status"]').selectOption("Planned");
    expect(await page.locator('input[name="confirmationNote"]').evaluate(input => (input as HTMLInputElement).required)).toBe(false);
    await page.getByRole("link", { name: "Back to Add Task" }).click();
    await page.getByRole("heading", { name: "Add Collection Task" }).waitFor();
    expect(await page.locator('select[name="status"] option').count()).toBe(1);
    expect(await page.locator('input[name="expectedVersion"]').count()).toBe(0);
  });

  it("keeps completed and cancelled details disabled", async () => {
    for (const status of ["Done", "Cancelled"]) {
      await page.evaluate(status => (window as unknown as {renderFixture: (props: object) => void}).renderFixture({ status }), status);
      await page.getByRole("heading", { name: "Collection Task Details" }).waitFor();
      expect(await page.locator('select[name="status"]').isDisabled()).toBe(true);
      expect(await page.locator('input[name="notes"]').isDisabled()).toBe(true);
      expect(await page.getByRole("button", { name: "Save Changes" }).count()).toBe(0);
    }
  });

  it("places Status at the upper right and fits the mobile viewport", async () => {
    const status = await page.locator('select[name="status"]').boundingBox();
    const customer = await page.locator("label").first().locator("input").boundingBox();
    expect(status?.y).toBe(customer?.y);
    expect(status?.x).toBeGreaterThan(customer?.x ?? 0);
    await mkdir("tmp", { recursive: true });
    await page.screenshot({ path: "tmp/collection-task-form-desktop.png" });
    await page.setViewportSize({ width: 375, height: 850 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
    await page.screenshot({ path: "tmp/collection-task-form-mobile.png" });
  });
});
