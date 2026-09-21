"use client";

import { useState } from "react";
import { Ban, CircleCheckBig, X } from "lucide-react";
import { useFormStatus } from "react-dom";
import { updateDeliveryNoteStatus } from "@/lib/actions";

type DeliveryActionStatus = "Draft" | "Issued";

export function DeliveryNoteStatusActions({
  deliveryNoteId,
  status,
  defaultReceivedAt,
  defaultReceiverName = "",
  initialReceiveOpen = false
}: {
  deliveryNoteId: string;
  status: DeliveryActionStatus;
  defaultReceivedAt: string;
  defaultReceiverName?: string;
  initialReceiveOpen?: boolean;
}) {
  const [dialog, setDialog] = useState<"receive" | "cancel" | null>(
    status === "Issued" && initialReceiveOpen ? "receive" : null
  );

  return (
    <>
      {status === "Issued" && (
        <button
          type="button"
          onClick={() => setDialog("receive")}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-success px-4 text-sm font-semibold text-white"
        >
          <CircleCheckBig aria-hidden="true" className="h-4 w-4" />
          Tandai Sudah Diterima
        </button>
      )}
      <button
        type="button"
        onClick={() => setDialog("cancel")}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-danger/40 bg-white px-4 text-sm font-semibold text-danger"
      >
        <Ban aria-hidden="true" className="h-4 w-4" />
        Batalkan Surat Jalan
      </button>

      {dialog === "receive" && (
        <ActionDialog
          title="Konfirmasi Barang Diterima"
          description="Catat siapa yang menerima barang dan waktu penerimaannya. Setelah dikonfirmasi, status ini tidak dapat diubah kembali."
          onClose={() => setDialog(null)}
        >
          <form action={updateDeliveryNoteStatus} className="space-y-4">
            <input type="hidden" name="id" value={deliveryNoteId} />
            <input type="hidden" name="status" value="Delivered" />
            <label className="block text-sm font-medium text-ink">
              Nama Penerima
              <input
                name="receiverName"
                required
                maxLength={200}
                defaultValue={defaultReceiverName}
                placeholder="Nama orang yang menerima barang"
                className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              Tanggal dan Jam Diterima
              <input
                name="receivedAt"
                type="datetime-local"
                step={1}
                required
                defaultValue={defaultReceivedAt}
                className="mt-1 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="block text-sm font-medium text-ink">
              Catatan Penerimaan (Opsional)
              <textarea
                name="receiptNotes"
                maxLength={2000}
                placeholder="Contoh: diterima lengkap dan dalam kondisi baik"
                className="mt-1 min-h-24 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
            <div className="flex justify-end gap-3 border-t border-line pt-4">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-ink/80"
              >
                Kembali
              </button>
              <SubmitButton label="Konfirmasi Diterima" pendingLabel="Menyimpan..." />
            </div>
          </form>
        </ActionDialog>
      )}

      {dialog === "cancel" && (
        <ActionDialog
          title="Batalkan Surat Jalan?"
          description="Surat Jalan yang dibatalkan akan dipindahkan ke arsip dan tidak dapat diaktifkan kembali."
          onClose={() => setDialog(null)}
        >
          <form action={updateDeliveryNoteStatus} className="space-y-4">
            <input type="hidden" name="id" value={deliveryNoteId} />
            <input type="hidden" name="status" value="Cancelled" />
            <label className="block text-sm font-medium text-ink">
              Alasan Pembatalan (Opsional)
              <textarea
                name="confirmationNote"
                maxLength={2000}
                placeholder="Jelaskan alasan pembatalan"
                className="mt-1 min-h-24 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
            <div className="flex justify-end gap-3 border-t border-line pt-4">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-line px-4 text-sm font-semibold text-ink/80"
              >
                Kembali
              </button>
              <SubmitButton
                label="Batalkan Surat Jalan"
                pendingLabel="Membatalkan..."
                tone="danger"
              />
            </div>
          </form>
        </ActionDialog>
      )}
    </>
  );
}

function ActionDialog({
  title,
  description,
  onClose,
  children
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-strong/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delivery-action-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="w-full max-w-lg rounded-lg border border-line bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 id="delivery-action-title" className="text-lg font-semibold text-ink">
              {title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-ink/80">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Tutup"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-ink/70"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}

function SubmitButton({
  label,
  pendingLabel,
  tone = "success"
}: {
  label: string;
  pendingLabel: string;
  tone?: "success" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className={`inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${tone === "danger" ? "bg-danger" : "bg-success"}`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
