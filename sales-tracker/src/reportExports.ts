import Papa from "papaparse";

type ReportRow = Record<string, string | number>;

export const downloadCsvReport = (filename: string, rows: ReportRow[]) => {
  if (rows.length === 0) throw new Error("There is no data to export.");

  const csv = Papa.unparse(rows, { newline: "\r\n" });
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadPdfReport = async (
  filename: string,
  title: string,
  subtitle: string,
  columns: string[],
  rows: string[][]
): Promise<void> => {
  if (rows.length === 0) throw new Error("There is no data to export.");

  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const columnWidth = contentWidth / columns.length;
  let y = 15;

  const drawHeader = () => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text(title, margin, y);
    y += 7;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(subtitle, margin, y);
    y += 8;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    columns.forEach((column, index) => {
      pdf.text(pdf.splitTextToSize(column, columnWidth - 2), margin + index * columnWidth, y);
    });
    y += 6;
    pdf.setDrawColor(180);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 4;
    pdf.setFont("helvetica", "normal");
  };

  drawHeader();
  pdf.setFontSize(7);
  rows.forEach((row) => {
    const cellLines = row.map((value) => pdf.splitTextToSize(value || "—", columnWidth - 2));
    const rowHeight = Math.max(...cellLines.map((lines) => lines.length)) * 3.5 + 2;

    if (y + rowHeight > pageHeight - margin) {
      pdf.addPage();
      y = 15;
      drawHeader();
      pdf.setFontSize(7);
    }

    cellLines.forEach((lines, index) => {
      pdf.text(lines, margin + index * columnWidth, y);
    });
    y += rowHeight;
  });

  pdf.save(filename);
};
