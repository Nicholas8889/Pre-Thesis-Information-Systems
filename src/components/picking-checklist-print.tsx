import { formatDate } from "@/lib/format";

type PrintableSheet = {
  pickingListNumber: string; status: string; pickerName: string | null;
  createdAt: Date; packedAt: Date | null; notes: string | null;
  items: { id: string; itemName: string; orderedQuantity: number; isChecked: boolean }[];
  salesOrder: {
    orderNumber: string; customerPoNumber: string | null; requiredDate: Date | null;
    invoice: { invoiceNumber: string } | null; customer: { companyName: string };
  };
};

export function PickingChecklistPrint({ list }: { list: PrintableSheet }) {
  const isPick = list.status === "Pending";
  const completed = list.status === "Packed";
  const checkedCount = list.items.filter(item => item.isChecked).length;
  return (
    <article className="rounded-md border border-line bg-white p-8 text-ink shadow-card print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap justify-between gap-4 border-b-2 border-strong pb-5">
        <div><p className="text-lg font-bold">CV TAJUK</p><p className="mt-1 text-sm">{isPick ? "Internal item preparation" : "Internal item preparation and Pack checks"}</p></div>
        <div><h1 className="text-2xl font-bold">PICK &amp; PACK SHEET</h1><p className="mt-2 font-semibold">{list.pickingListNumber}</p><p className="mt-1 text-sm">{completed ? "Completed" : isPick ? "Pick" : "Pack"}</p></div>
      </header>
      <section className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <p><strong>Order:</strong> {list.salesOrder.orderNumber}</p>
        {list.salesOrder.customerPoNumber && <p><strong>Customer PO:</strong> {list.salesOrder.customerPoNumber}</p>}
        <p><strong>Invoice:</strong> {list.salesOrder.invoice?.invoiceNumber ?? "—"}</p>
        <p><strong>Customer:</strong> {list.salesOrder.customer.companyName}</p>
        <p><strong>Required date:</strong> {list.salesOrder.requiredDate ? formatDate(list.salesOrder.requiredDate) : "—"}</p>
        <p><strong>Created:</strong> {formatDate(list.createdAt)}</p>
        <p><strong>PIC Pick &amp; Pack:</strong> {list.pickerName ?? "—"}</p>
      </section>
      <table className="mt-6 w-full table-fixed border-collapse text-sm">
        <colgroup><col className="w-[8%]" /><col className={isPick ? "w-[72%]" : "w-[47%]"} /><col className="w-[20%]" />{!isPick && <col className="w-[25%]" />}</colgroup>
        <thead><tr>{["No.", "Product", "Ordered quantity", ...(!isPick ? ["Pack check"] : [])].map(label => <th key={label} className="border border-ink/50 px-2 py-3">{label}</th>)}</tr></thead>
        <tbody>{list.items.map((item, index) => (
          <tr key={item.id} className="break-inside-avoid">
            <td className="border border-ink/50 px-2 py-3 text-center">{index + 1}</td>
            <td className="break-words border border-ink/50 px-2 py-3">{item.itemName}</td>
            <td className="border border-ink/50 px-2 py-3 text-center">{item.orderedQuantity}</td>
            {!isPick && <td className="border border-ink/50 px-2 py-3 text-center"><span aria-hidden="true" className="mr-2 inline-block h-4 w-4 border border-ink align-middle leading-3">{item.isChecked ? "✓" : ""}</span>{item.isChecked ? "Sudah diperiksa" : "Belum diperiksa"}</td>}
          </tr>
        ))}</tbody>
        <tfoot><tr className="font-semibold"><td colSpan={2} className="border border-ink/50 px-2 py-3 text-right">Total</td><td className="border border-ink/50 px-2 py-3 text-center">{list.items.reduce((sum, item) => sum + item.orderedQuantity, 0)}</td>{!isPick && <td className="border border-ink/50 px-2 py-3 text-center">{checkedCount} / {list.items.length} checked</td>}</tr></tfoot>
      </table>
      <section className="mt-6 text-sm"><p><strong>Internal notes:</strong> {list.notes || "—"}</p></section>
      <footer className="mt-8 max-w-sm break-inside-avoid text-center text-sm">
        <p className="font-semibold">PIC Pick &amp; Pack</p>
        <p className="mt-16 border-t border-dotted border-ink/50 pt-2">{list.pickerName ?? "Name / Signature"}</p>
        <p className="mt-3">Completion date: {list.packedAt ? formatDate(list.packedAt) : "........................"}</p>
      </footer>
    </article>
  );
}
