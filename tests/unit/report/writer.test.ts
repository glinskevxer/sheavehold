import { describe, expect, it } from 'vitest';
import {
  documentToText,
  linesSection,
  pairsSection,
  renderDocument,
  tableSection,
  type ReportDocument,
} from '../../../src/report/writer.js';

interface Row {
  code: string;
  count: number;
}

const columns = [
  { header: 'code', value: (row: Row) => row.code },
  { header: 'count', align: 'right' as const, value: (row: Row) => String(row.count) },
];

const rows: Row[] = [
  { code: 'SUNB', count: 3 },
  { code: 'MEADW', count: 2 },
];

describe('the document writer', () => {
  it('prints a title on its own', () => {
    expect(renderDocument({ title: 'a report', sections: [] })).toEqual(['a report']);
  });

  it('prints a subtitle under the title', () => {
    expect(renderDocument({ title: 'a report', subtitle: 'about a thing', sections: [] })).toEqual([
      'a report',
      'about a thing',
    ]);
  });

  it('puts a blank line before every section', () => {
    const lines = renderDocument({
      title: 'a report',
      sections: [pairsSection([['one', '1']]), pairsSection([['two', '2']])],
    });
    expect(lines).toEqual(['a report', '', '  one  1', '', '  two  2']);
  });

  it('indents every section body the same way', () => {
    const document: ReportDocument = {
      title: 'a report',
      sections: [
        pairsSection([['one', '1']]),
        tableSection(rows, columns),
        linesSection(['a note']),
      ],
    };
    for (const line of renderDocument(document).slice(1)) {
      expect(line === '' || line.startsWith('  ')).toBe(true);
    }
  });

  it('prints a heading above a section that has one', () => {
    const lines = renderDocument({
      title: 'a report',
      sections: [tableSection(rows, columns, { heading: 'lifts' })],
    });
    expect(lines[2]).toBe('lifts');
    expect(lines[3]?.trim().split(/\s+/)).toEqual(['code', 'count']);
  });

  it('prints the empty note instead of a bare header', () => {
    const lines = renderDocument({
      title: 'a report',
      sections: [tableSection([], columns, { heading: 'lifts', emptyNote: 'nothing today' })],
    });
    expect(lines).toEqual(['a report', '', 'lifts', '  nothing today']);
  });

  it('still prints a header when there is no empty note', () => {
    const lines = renderDocument({ title: 'a report', sections: [tableSection([], columns)] });
    expect(lines[2]?.trim().split(/\s+/)).toEqual(['code', 'count']);
  });

  it('puts a blank line before the footer', () => {
    const lines = renderDocument({
      title: 'a report',
      sections: [pairsSection([['one', '1']])],
      footer: ['that is all'],
    });
    expect(lines[lines.length - 2]).toBe('');
    expect(lines[lines.length - 1]).toBe('that is all');
  });

  it('leaves an empty footer off entirely', () => {
    const lines = renderDocument({ title: 'a report', sections: [], footer: [] });
    expect(lines).toEqual(['a report']);
  });

  it('joins into one string', () => {
    const document: ReportDocument = { title: 'a report', sections: [pairsSection([['a', 'b']])] };
    expect(documentToText(document)).toBe(renderDocument(document).join('\n'));
  });
});
