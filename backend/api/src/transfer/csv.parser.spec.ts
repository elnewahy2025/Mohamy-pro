import { parseCsv, toCsv } from './csv.parser';

describe('CSV parser', () => {
  it('parses quoted fields, commas, and CRLF', () => {
    const parsed = parseCsv(
      'name,note\r\n"Doe, John","He said ""hi"""\r\nPlain,Simple\r\n',
    );
    expect(parsed.headers).toEqual(['name', 'note']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toEqual({ name: 'Doe, John', note: 'He said "hi"' });
    expect(parsed.rows[1]).toEqual({ name: 'Plain', note: 'Simple' });
  });

  it('rejects unterminated quotes, stray quotes, and duplicate headers', () => {
    expect(() => parseCsv('"abc,def')).toThrow('unterminated quote');
    expect(() => parseCsv('a,b\nx"y,z')).toThrow('unexpected quote');
    expect(() => parseCsv('a,a\n1,2')).toThrow('duplicate headers');
    expect(() => parseCsv('   \n')).toThrow('no header');
  });

  it('round-trips through toCsv with escaping', () => {
    const csv = toCsv(['a', 'b'], [['x,y', 'q"q']]);
    const parsed = parseCsv(csv);
    expect(parsed.rows[0]).toEqual({ a: 'x,y', b: 'q"q' });
  });
});
