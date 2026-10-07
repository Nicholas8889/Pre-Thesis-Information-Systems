"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { savePickingList } from "@/lib/picking-list-actions";
import { isPackChecklistComplete } from "@/lib/pack-checklist";

type Item = { id: string; itemName: string; orderedQuantity: number; isChecked: boolean };
const inputClass = "mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm disabled:bg-soft";

function ChecklistButtons({ canComplete }: { canComplete: boolean }) {
  const { pending } = useFormStatus();
  return <div className="flex flex-wrap gap-3">
    <button name="intent" value="save" disabled={pending} className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-brand disabled:opacity-50">Save Progress</button>
    <button name="intent" value="complete" disabled={pending || !canComplete} className="inline-flex h-10 items-center rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">Selesaikan Pick &amp; Pack</button>
  </div>;
}

export function PackChecklistForm({ id, version, pickerName, notes, items, editable, completed }: {
  id: string; version: string; pickerName: string; notes: string;
  items: Item[]; editable: boolean; completed: boolean;
}) {
  const [checks, setChecks] = useState(items.map(item => ({ id: item.id, isChecked: Boolean(item.isChecked) })));
  const [pic, setPic] = useState(pickerName);
  const allChecked = isPackChecklistComplete(checks);
  return (
    <form action={savePickingList}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <fieldset disabled={!editable} className="space-y-4">
        <label className="block max-w-md text-sm font-medium">PIC Pick &amp; Pack
          <input name="pickerName" required maxLength={120} value={pic} onChange={event => setPic(event.target.value)} className={inputClass} />
        </label>
        <div className="overflow-x-auto">
          <table>
            <thead className="border-b border-line text-left text-xs uppercase text-ink/70">
              <tr><th className="py-3 pr-4">Product</th><th className="py-3 pr-4">Ordered quantity</th><th className="py-3">Pack check</th></tr>
            </thead>
            <tbody className="divide-y divide-line text-sm">
              {items.map((item, index) => (
                <tr key={item.id}>
                  <td className="py-3 pr-4 font-medium"><input type="hidden" name="itemId" value={item.id} />{item.itemName}</td>
                  <td className="py-3 pr-4">{item.orderedQuantity}</td>
                  <td className="py-3"><label className="inline-flex items-center gap-2">
                    <input type="checkbox" name="checkedItemId" value={item.id} aria-label={`Sudah diperiksa: ${item.itemName}`}
                      checked={checks[index].isChecked}
                      onChange={event => {
                        const isChecked = event.target.checked;
                        setChecks(current => current.map(check => check.id === item.id ? { ...check, isChecked } : check));
                      }} className="h-4 w-4 accent-brand" />
                    Sudah diperiksa
                  </label></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-ink/70">{checks.filter(item => item.isChecked).length} / {items.length} items checked.{!completed && " Check every item before completing this sheet."}</p>
        <label className="block text-sm font-medium">Internal notes (optional)
          <textarea name="notes" defaultValue={notes} maxLength={2000} rows={2} className={inputClass} />
        </label>
        {editable && <ChecklistButtons canComplete={allChecked && Boolean(pic.trim())} />}
      </fieldset>
    </form>
  );
}
