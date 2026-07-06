import { stringify } from 'csv-stringify/sync';
import { db } from '../db/connection';

const datasets: Record<string, string> = {
  raw: 'SELECT * FROM raw_observations ORDER BY timestamp_utc DESC LIMIT 5000',
  daily: 'SELECT * FROM daily_summary ORDER BY summary_date DESC LIMIT 5000',
  monthly: 'SELECT * FROM monthly_summary ORDER BY summary_year DESC, summary_month DESC LIMIT 5000',
  annual: 'SELECT * FROM annual_summary ORDER BY summary_year DESC LIMIT 5000',
  anomalies: 'SELECT * FROM anomalies ORDER BY period_key DESC LIMIT 5000',
  records: 'SELECT * FROM records ORDER BY generated_at DESC LIMIT 5000',
  rankings: 'SELECT * FROM rankings ORDER BY variable, rank_position ASC LIMIT 5000'
};

export const fetchDataset = (name: string): Record<string, unknown>[] => {
  const sql = datasets[name];
  if (!sql) {
    throw new Error(`Unsupported export dataset: ${name}`);
  }

  return db.prepare(sql).all() as Record<string, unknown>[];
};

export const toCsv = (rows: Record<string, unknown>[]): string => {
  if (!rows.length) {
    return '';
  }
  return stringify(rows, { header: true });
};

const xmlEscape = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

export const toExcelXml = (rows: Record<string, unknown>[]): string => {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const headerCells = headers
    .map((header) => `<Cell><Data ss:Type="String">${xmlEscape(header)}</Data></Cell>`)
    .join('');

  const rowXml = rows
    .map((row) => {
      const cells = headers
        .map((header) => {
          const raw = row[header];
          const isNumber = typeof raw === 'number' && Number.isFinite(raw);
          const type = isNumber ? 'Number' : 'String';
          return `<Cell><Data ss:Type="${type}">${xmlEscape(raw)}</Data></Cell>`;
        })
        .join('');
      return `<Row>${cells}</Row>`;
    })
    .join('');

  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Worksheet ss:Name="Export">
    <Table>
      ${headers.length ? `<Row>${headerCells}</Row>` : ''}
      ${rowXml}
    </Table>
  </Worksheet>
</Workbook>`;
};

const pdfEscape = (value: string): string =>
  value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');

const buildPdfDocument = (title: string, lines: string[]): Buffer => {
  const textCommands = [
    `BT /F1 14 Tf 40 780 Td (${pdfEscape(title)}) Tj ET`,
    ...lines.map((line, index) => {
      const y = 758 - index * 14;
      return `BT /F1 9 Tf 40 ${Math.max(y, 40)} Td (${pdfEscape(line)}) Tj ET`;
    })
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(textCommands, 'utf8')} >>\nstream\n${textCommands}\nendstream`
  ];

  let output = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(output, 'utf8'));
    output += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(output, 'utf8');
  output += `xref\n0 ${objects.length + 1}\n`;
  output += '0000000000 65535 f \n';

  for (let index = 1; index <= objects.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }

  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(output, 'utf8');
};

export const toPdf = (rows: Record<string, unknown>[], title: string): Buffer => {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const lineLimit = 48;
  const valueLimit = 8;

  const lines: string[] = [];
  if (!rows.length) {
    lines.push('No rows available for this dataset.');
  } else {
    lines.push(headers.join(' | '));
    lines.push('-'.repeat(120));

    rows.slice(0, lineLimit).forEach((row, index) => {
      const values = headers
        .slice(0, valueLimit)
        .map((header) => String(row[header] ?? ''))
        .join(' | ');
      lines.push(`${String(index + 1).padStart(3, '0')} ${values}`.slice(0, 180));
    });

    if (rows.length > lineLimit) {
      lines.push(`... truncated ${rows.length - lineLimit} additional rows`);
    }
  }

  return buildPdfDocument(title, lines);
};
