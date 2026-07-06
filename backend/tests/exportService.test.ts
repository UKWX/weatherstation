import { describe, expect, it } from 'vitest';
import { toExcelXml, toPdf } from '../src/services/exportService';

describe('export service formatters', () => {
  it('creates Excel XML with escaped values', () => {
    const xml = toExcelXml([
      { label: 'Temp', value: 12.3, notes: 'A&B <normal>' },
      { label: 'Rain', value: 4.1, notes: '"quoted"' }
    ]);

    expect(xml).toContain('<Workbook');
    expect(xml).toContain('A&amp;B &lt;normal&gt;');
    expect(xml).toContain('&quot;quoted&quot;');
    expect(xml).toContain('ss:Type="Number">12.3');
  });

  it('creates a PDF buffer and truncates oversized data safely', () => {
    const rows = Array.from({ length: 70 }, (_, index) => ({
      id: index + 1,
      text: `row-${index + 1}`,
      extra: '(value)'
    }));

    const pdf = toPdf(rows, 'Report (Test)');

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.toString('utf8', 0, 8)).toBe('%PDF-1.4');
    expect(pdf.toString('utf8')).toContain('truncated');
  });

  it('creates a PDF for empty datasets', () => {
    const pdf = toPdf([], 'Empty Export');
    expect(pdf.toString('utf8')).toContain('No rows available for this dataset.');
  });
});
