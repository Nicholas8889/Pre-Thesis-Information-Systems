"""Generate the eight synthetic PO attachments from the dataset manifest."""
import json
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def money(value):
    return "Rp " + f"{int(value):,}".replace(",", ".")


def main():
    manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    output = Path(sys.argv[2])
    output.mkdir(parents=True, exist_ok=True)
    styles = getSampleStyleSheet()
    for item in manifest["documents"]:
        path = output / item["fileName"]
        doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                                topMargin=18 * mm, bottomMargin=18 * mm, title=item["number"],
                                author="CV Tajuk Demo", invariant=1)
        story = [Paragraph("CUSTOMER PURCHASE ORDER", styles["Title"]),
                 Paragraph("SIMULASI AKADEMIK - BUKAN PESANAN ATAU TRANSAKSI NYATA", styles["Normal"]), Spacer(1, 10 * mm)]
        for text in [f"Nomor PO: {item['number']}", f"Pelanggan: {item['customer']}", "Pemasok: CV Tajuk",
                     f"Tanggal pesanan: {item['date']}", f"Tanggal produk diperlukan: {item['requiredDate']}"]:
            story.append(Paragraph(text, styles["Normal"]))
        story.append(Spacer(1, 8 * mm))
        rows = [["Produk", "Qty (PCS)", "Harga unit", "Subtotal"]]
        for line in item["items"]:
            rows.append([Paragraph(line["item_name"], styles["Normal"]), str(line["quantity"]),
                         money(line["final_unit_price"]), money(line["subtotal"])])
        table = Table(rows, colWidths=[78 * mm, 22 * mm, 35 * mm, 39 * mm], repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#123C42")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5D8")),
            ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9)]))
        story.extend([table, Spacer(1, 7 * mm), Paragraph(f"Total pesanan: <b>{money(item['total'])}</b>", styles["Normal"]),
                      Paragraph(f"PPN dalam total sesuai konfigurasi demo: {money(item['tax'])}", styles["Normal"]), Spacer(1, 8 * mm),
                      Paragraph("Alamat, kontak, produk, dan nilai pada dokumen ini adalah data contoh untuk demonstrasi sistem revenue cycle. "
                                "Dokumen tidak memuat tanda tangan atau komitmen pembelian.", styles["Normal"])])
        doc.build(story)
    print(json.dumps({"pdfCount": len(manifest["documents"]), "directory": str(output)}))


if __name__ == "__main__":
    main()
