import { strFromU8, unzipSync } from 'fflate';
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { demoGroup } from '../demo';
import { groupSheets } from '../export';
import { buildXlsx, columnLetter } from '../xlsx';

describe('excel export', () => {
  it('names columns like Excel', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });

  it('builds a valid workbook with every sheet', () => {
    const group = demoGroup(new Date(2026, 9, 20));
    const sheets = groupSheets(group, '2026-10');
    const bytes = buildXlsx(sheets);
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet5.xml']),
    );
    const workbook = strFromU8(files['xl/workbook.xml']);
    expect(workbook).toContain('name="Gastos"');
    expect(workbook).toContain('name="Pagos entre ustedes"');
    const gastos = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(gastos).toContain('Heladera nueva');
    expect(gastos).toContain('Le toca a Sofi');
    expect(sheets[0].rows).toHaveLength(group.expenses.length);
    // La heladera en 6 cuotas aparece cuota por cuota.
    expect(sheets[1].rows.filter((r) => r[1] === 'Heladera nueva')).toHaveLength(6);
    // Los saldos suman cero.
    expect(sheets[4].rows.reduce((a, r) => a + Number(r[1]), 0)).toBeCloseTo(0, 2);
    if (process.env.PAREJO_XLSX_OUT) writeFileSync(process.env.PAREJO_XLSX_OUT, bytes);
  });

  it('escapes text that would break the XML', () => {
    const bytes = buildXlsx([{ name: 'A/B [x]', columns: [{ header: 'Nota' }], rows: [['<tag> & "comillas"\u0001']] }]);
    const files = unzipSync(bytes);
    expect(strFromU8(files['xl/workbook.xml'])).toContain('name="A B  x"');
    expect(strFromU8(files['xl/worksheets/sheet1.xml'])).toContain('&lt;tag&gt; &amp; &quot;comillas&quot;');
  });
});
