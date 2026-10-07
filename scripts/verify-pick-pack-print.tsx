import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { PickingChecklistPrint } from "../src/components/picking-checklist-print";

async function main() {
  const css = readFileSync("tmp/pick-pack-batch2.css", "utf8");
  mkdirSync("tmp", { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 688, height: 980 } });
    await page.emulateMedia({ media: "print" });
    for (const status of ["Pending", "InProgress", "Packed"]) {
      const list = {
        pickingListNumber: "PL-DEMO-2026-001", status, pickerName: "Dewi", notes: "Periksa barang sebelum diteruskan ke Surat Jalan.",
        createdAt: new Date("2026-10-05T02:00:00Z"), packedAt: status === "Packed" ? new Date("2026-10-05T03:00:00Z") : null,
        salesOrder: { orderNumber: "SO-DEMO-2026-001", customerPoNumber: "PO-DEMO-001", requiredDate: new Date("2026-10-06"),
          customer: { companyName: "Customer Contoh" }, invoice: { invoiceNumber: "INV-DEMO-001" } },
        items: Array.from({ length: 8 }, (_, index) => ({
          id: `item-${index}`, itemName: index === 1 ? "Kain motif dengan nama produk panjang untuk menguji pembungkusan teks pada lembar cetak" : `Kain contoh ${index + 1}`,
          orderedQuantity: (index + 1) * 5, isChecked: status === "Packed" || index < 3,
        })),
      };
      await page.setContent(`<html><head><style>${css}</style></head><body>${renderToStaticMarkup(<PickingChecklistPrint list={list} />)}</body></html>`);
      const measurements = await page.evaluate(() => {
        const table = document.querySelector("table")!;
        return {
          pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
          tableWidth: table.getBoundingClientRect().width,
          clippedCells: Array.from(table.querySelectorAll("th, td")).filter(cell => cell.scrollWidth > cell.clientWidth + 1).length,
        };
      });
      assert.equal(measurements.pageOverflow, false, `${status}: page overflows`);
      assert.equal(measurements.clippedCells, 0, `${status}: table text is clipped`);
      await page.screenshot({ path: `tmp/pick-pack-batch2-${status.toLowerCase()}.png`, fullPage: true });
      console.log(JSON.stringify({ status, ...measurements }));
    }
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
