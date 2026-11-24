export interface ReceiptLine {
  title: string;
  reason: string;
  amount: number;
}

export interface ReceiptDetails {
  receiptNo: string;
  memberName: string;
  paidAt: Date;
  method: string;
  amount: number;
  fines: ReceiptLine[];
}

export function createReceiptPdf(receipt: ReceiptDetails): Buffer {
  const lines = [
    receipt.method === 'demo'
      ? 'LibraryHub demo payment receipt'
      : 'LibraryHub payment receipt',
    `Receipt: ${receipt.receiptNo}`,
    `Member: ${receipt.memberName}`,
    `Recorded at: ${receipt.paidAt.toISOString()}`,
    `Method: ${
      receipt.method === 'demo'
        ? 'Demo only - no money charged'
        : receipt.method
    }`,
    `Total: Rs ${(receipt.amount / 100).toFixed(2)}`,
    '',
    'Fine details:',
    ...receipt.fines.map(
      (fine) =>
        `${fine.title} (${fine.reason}) - Rs ${(fine.amount / 100).toFixed(2)}`,
    ),
  ];
  const commands = lines.map((line, index) => {
    const y = 790 - index * 16;
    const fontSize = index === 0 ? 16 : 10;
    return `BT /F1 ${fontSize} Tf 48 ${y} Td (${escapePdfText(line)}) Tj ET`;
  });
  const stream = `${commands.join('\n')}\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let document = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(document, 'ascii'));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(document, 'ascii');
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    document += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(document, 'ascii');
}

function escapePdfText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '?')
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}
