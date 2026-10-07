"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { previewSalesOrderItemChanges, saveSalesOrderItemChanges } from "@/lib/order-item-edit-actions";
import { calculateAdjustedUnitPrice } from "@/lib/calculations";
import { formatCurrency } from "@/lib/format";
import { FlashMessage } from "@/components/flash-message";

export type EditableOrderItem = {
  id: string; productId: string | null; itemName: string; quantity: number;
  baseUnitPrice: number; markupPercent: number; discountPercent: number; finalUnitPrice: number; subtotal: number;
};
type ProductOption = { id: string; productName: string; listPrice: number };
type DraftRow = { key: string; itemId: string | null; productId: string | null; quantity: number | "" };
type PreviewResult = Extract<Awaited<ReturnType<typeof previewSalesOrderItemChanges>>, { ok: true }>["preview"];

const buttonClass = "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-brand disabled:cursor-not-allowed disabled:opacity-50";
const inputClass = "rounded-md border border-line bg-white px-2 py-2 text-sm outline-none focus:border-brand disabled:bg-soft";
const fromItems = (items: EditableOrderItem[]): DraftRow[] => items.map(item => ({ key: item.id, itemId: item.id, productId: item.productId, quantity: item.quantity }));

export function OrderItemEditor({ id, version, orderNumber, orderLabel, items, products, eligibility, notes }: {
  id: string; version: number; orderNumber: string; orderLabel: string; items: EditableOrderItem[];
  products: ProductOption[]; eligibility: { allowed: boolean; code: string; message: string }; notes: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [base, setBase] = useState({ version, items });
  const [rows, setRows] = useState(() => fromItems(items));
  const [quote, setQuote] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [needsReload, setNeedsReload] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const nextKey = useRef(0);
  const generation = useRef(0);
  const awaitingRefresh = savedVersion !== null && version < savedVersion;
  const stale = editing && version !== base.version;
  const working = busy || refreshing || awaitingRefresh;

  const payload = rows.map(row => ({ itemId: row.itemId, productId: row.productId, quantity: row.quantity === "" ? 0 : row.quantity }));
  const changed = rows.length !== base.items.length || rows.some(row => {
    const original = base.items.find(item => item.id === row.itemId);
    return !original || original.productId !== row.productId || original.quantity !== row.quantity;
  });

  function begin() {
    generation.current++;
    flushSync(() => { setBase({ version, items }); setRows(fromItems(items)); setQuote(null); setSavedVersion(null); setError(""); setSuccess(""); setNeedsReload(false); setEditing(true); });
    formRef.current?.querySelector<HTMLSelectElement>("select")?.focus();
  }
  function cancel() {
    generation.current++; setEditing(false); setQuote(null); setError(""); setNeedsReload(false); setRows(fromItems(items));
  }
  function update(key: string, patch: Partial<DraftRow>) {
    setRows(current => current.map(row => row.key === key ? { ...row, ...patch } : row));
    setQuote(null); setError("");
  }
  function display(row: DraftRow, index: number) {
    if (quote) return quote.items[index];
    const original = base.items.find(item => item.id === row.itemId);
    const quantity = typeof row.quantity === "number" ? row.quantity : 0;
    if (original && original.productId === row.productId) return { ...original, quantity, subtotal: quantity * original.finalUnitPrice };
    const product = products.find(item => item.id === row.productId);
    const baseUnitPrice = product?.listPrice ?? 0;
    const markupPercent = original?.markupPercent ?? 0;
    const discountPercent = original?.discountPercent ?? 0;
    const finalUnitPrice = calculateAdjustedUnitPrice(baseUnitPrice, markupPercent, discountPercent);
    return { itemName: product?.productName ?? "", quantity, baseUnitPrice, markupPercent, discountPercent, finalUnitPrice, subtotal: quantity * finalUnitPrice };
  }
  function summary(preview: PreviewResult) {
    const changes: string[] = [];
    for (const item of preview.items) {
      const original = base.items.find(row => row.id === item.itemId);
      if (!original) changes.push(`Tambah ${item.itemName}: ${item.quantity} PCS · ${formatCurrency(item.finalUnitPrice)} / PCS`);
      else if (original.productId !== item.productId || original.quantity !== item.quantity) {
        changes.push(`${original.itemName}${original.productId !== item.productId ? ` → ${item.itemName}` : ""}: ${original.quantity} → ${item.quantity} PCS${original.finalUnitPrice !== item.finalUnitPrice ? ` · Harga ${formatCurrency(original.finalUnitPrice)} → ${formatCurrency(item.finalUnitPrice)}` : ""}`);
      }
    }
    for (const item of preview.removedItems) changes.push(`Hapus ${item.itemName}: ${item.quantity} PCS`);
    return [orderNumber, ...changes, `Total: ${formatCurrency(preview.previousTotal)} → ${formatCurrency(preview.total)}`,
      ...(preview.invoiceId ? [`Invoice diperbarui ke Revisi ${preview.invoiceRevisionNumber}.`] : []),
      ...(preview.pickingListId ? ["Daftar barang Pick sheet ikut diperbarui."] : []),
      ...(preview.approvalStatus === "Pending" ? ["Versi terbaru menunggu approval Manager."] : []),
    ].join("\n");
  }
  async function confirm() {
    if (working || !changed || !eligibility.allowed || stale || needsReload || !formRef.current?.reportValidity()) return;
    const currentGeneration = generation.current;
    setBusy(true); setError("");
    try {
      const result = await previewSalesOrderItemChanges({ id, expectedVersion: base.version, items: payload });
      if (currentGeneration !== generation.current) return;
      if (!result.ok) { setError(result.message); setNeedsReload(["STALE_VERSION", "NOT_FOUND", "PACK_STARTED", "PAYMENT_RECORDED", "DELIVERY_EXISTS"].includes(result.code)); return; }
      flushSync(() => { setQuote(result.preview); setBusy(false); });
      saveRef.current?.focus();
      formRef.current?.requestSubmit();
    } catch { setError("Preview belum berhasil dimuat. Coba lagi."); }
    finally { if (currentGeneration === generation.current) setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    // The existing global confirmation dialog prevents the first submit event.
    // Its confirmed requestSubmit is the only event that proceeds to save.
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (!editing || working || stale || needsReload || !eligibility.allowed) return;
    if (!quote) { void confirm(); return; }
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const result = await saveSalesOrderItemChanges(data);
      if (!result.ok) {
        setError(result.message); setQuote(null);
        setNeedsReload(["STALE_VERSION", "NOT_FOUND", "PACK_STARTED", "PAYMENT_RECORDED", "DELIVERY_EXISTS", "INVOICE_CHANGED"].includes(result.code));
        return;
      }
      setSuccess(`Perubahan barang tersimpan · Revisi ${result.result.revisionNumber}.`);
      setSavedVersion(result.result.version); setEditing(false);
      startRefresh(() => { router.refresh(); });
    } catch { setError("Perubahan belum berhasil disimpan. Coba lagi atau muat ulang transaksi."); setQuote(null); }
    finally { setBusy(false); }
  }

  const readItems = awaitingRefresh && quote ? quote.items.map((item, index) => ({ ...item, id: item.itemId ?? `saved-${index}` })) : items;
  return (
    <div className="min-w-0 rounded-md border border-line bg-white p-5 shadow-card" data-order-item-editor={id}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{orderLabel} Item Details</h2>
        {!editing && <span title={!eligibility.allowed ? eligibility.message : undefined}><button type="button" onClick={begin} disabled={!eligibility.allowed || working} aria-describedby={!eligibility.allowed ? `item-edit-lock-${id}` : undefined} className={buttonClass}><Pencil className="h-4 w-4" aria-hidden="true" />Edit Barang</button></span>}
      </div>
      {!eligibility.allowed && <p id={`item-edit-lock-${id}`} className="mt-2 text-xs text-ink/70">{eligibility.message}</p>}
      <div className="mt-3" role="status" aria-live="polite"><FlashMessage success={success} error={error} /></div>
      {(stale || needsReload) && editing && <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-ink/80"><p>Muat ulang data terbaru sebelum melanjutkan.</p><button type="button" className={buttonClass} onClick={() => { cancel(); startRefresh(() => router.refresh()); }}>Muat Ulang</button></div>}
      <form ref={formRef} method="post" onSubmit={submit} data-no-action-confirmation={editing && quote ? "false" : "true"}
        data-confirm-title={`Edit Barang ${orderNumber}`} data-confirm-require-note="true" data-confirm-summary={quote ? summary(quote) : ""}>
        {editing && <>
          <input type="hidden" name="id" value={id} /><input type="hidden" name="version" value={base.version} />
          <input type="hidden" name="items" value={JSON.stringify(payload)} /><input type="hidden" name="quoteHash" value={quote?.quoteHash ?? ""} />
        </>}
        <fieldset disabled={working || !eligibility.allowed || stale || needsReload}>
          <div key={editing ? "edit" : "view"} className="mt-4 overflow-x-auto">
            <table data-no-table-tools={editing ? "true" : undefined}>
              <thead className="border-b border-line text-left text-xs uppercase text-ink/70"><tr>
                {["Product Name", "Qty", "Unit", "Base Unit Price", "Markup", "Discount", "Final Unit Price", "Line Total", editing ? "Action" : "Notes"].map(label => <th key={label} className="py-3 pr-4">{label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-line text-sm">
                {editing ? rows.map((row, index) => {
                  const original = base.items.find(item => item.id === row.itemId);
                  const value = display(row, index);
                  return <tr key={row.key}>
                    <td className="py-3 pr-4"><select aria-label={`Product ${index + 1}`} required className={`${inputClass} min-w-48 w-full`} value={row.productId ?? "__legacy__"}
                      onChange={event => update(row.key, { productId: event.target.value === "__legacy__" ? null : event.target.value })}>
                      <option value="" disabled>Select product</option>
                      {original?.productId === null && <option value="__legacy__">{original.itemName} (tersimpan)</option>}
                      {original?.productId && !products.some(product => product.id === original.productId) && <option value={original.productId}>{original.itemName} (tersimpan)</option>}
                      {products.map(product => <option key={product.id} value={product.id}>{product.id === original?.productId ? original.itemName : product.productName}</option>)}
                    </select></td>
                    <td className="py-3 pr-4"><input aria-label={`Qty ${index + 1}`} type="number" required min={1} max={1000000} step={1} className={`${inputClass} w-20 text-right`} value={row.quantity} onChange={event => update(row.key, { quantity: event.target.value === "" ? "" : Number(event.target.value) })} /></td>
                    <td className="py-3 pr-4">PCS</td>
                    <td className="py-3 pr-4 text-right">{formatCurrency(value.baseUnitPrice)}</td>
                    <td className="py-3 pr-4 text-right">{value.markupPercent ? `${value.markupPercent}%` : "-"}</td>
                    <td className="py-3 pr-4 text-right">{value.discountPercent ? `${value.discountPercent}%` : "-"}</td>
                    <td className="py-3 pr-4 text-right">{formatCurrency(value.finalUnitPrice)}</td>
                    <td className="py-3 pr-4 text-right font-medium">{formatCurrency(value.subtotal)}</td>
                    <td className="py-3"><button type="button" aria-label={`Hapus barang ${index + 1}`} title="Hapus barang" disabled={rows.length <= 1} className={buttonClass} onClick={() => { setRows(current => current.filter(item => item.key !== row.key)); setQuote(null); setError(""); }}><Trash2 className="h-4 w-4" aria-hidden="true" /></button></td>
                  </tr>;
                }) : readItems.map(item => <tr key={item.id} className="transition hover:bg-soft">
                  <td className="py-3 pr-4 font-medium">{item.itemName}</td><td className="py-3 pr-4 text-right text-ink/80">{item.quantity}</td><td className="py-3 pr-4">PCS</td>
                  <td className="py-3 pr-4 text-right text-ink/80">{formatCurrency(item.baseUnitPrice)}</td><td className="py-3 pr-4 text-right text-ink/80">{item.markupPercent ? `${item.markupPercent}%` : "-"}</td><td className="py-3 pr-4 text-right text-ink/80">{item.discountPercent ? `${item.discountPercent}%` : "-"}</td><td className="py-3 pr-4 text-right text-ink/80">{formatCurrency(item.finalUnitPrice)}</td><td className="py-3 pr-4 text-right font-medium">{formatCurrency(item.subtotal)}</td><td className="py-3 text-ink/80">-</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          {editing && <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" className={buttonClass} disabled={rows.length >= 1000} onClick={() => { setRows(current => [...current, { key: `new-${nextKey.current++}`, itemId: null, productId: "", quantity: 1 }]); setQuote(null); }}><Plus className="h-4 w-4" aria-hidden="true" />Tambah Barang</button><p className="text-sm font-semibold">Total sementara: {formatCurrency(quote?.total ?? rows.reduce((sum, row, index) => sum + display(row, index).subtotal, 0))}</p></div>
            <p className="text-xs text-ink/70">Harga ditampilkan otomatis. Nilai final diperiksa ulang saat menyimpan.</p>
          </div>}
        </fieldset>
        {editing && <div className="mt-3 flex gap-3"><button ref={saveRef} type="button" disabled={!changed || working || stale || needsReload || !eligibility.allowed} className={`${buttonClass} bg-brand text-white`} onClick={() => { void confirm(); }}>{busy ? "Memproses…" : "Simpan Perubahan"}</button><button type="button" disabled={working} className={buttonClass} onClick={cancel}>Batal</button></div>}
      </form>
      {notes && <p className="mt-4 whitespace-pre-wrap rounded-md bg-soft p-3 text-sm text-ink/80">{notes}</p>}
    </div>
  );
}
