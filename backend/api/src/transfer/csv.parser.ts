export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Minimal RFC-4180 subset parser (quoted fields with embedded commas,
 * quotes, and CRLF). No external dependency by design. Anything beyond
 * this subset is rejected rather than misparsed.
 */
export function parseCsv(content: string): ParsedCsv {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const pushField = () => {
    current.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    if (current.some((cell) => cell.trim() !== '')) rows.push(current);
    current = [];
  };
  while (i < content.length) {
    const char = content[i];
    if (quoted) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          quoted = false;
          i += 1;
        }
      } else {
        field += char;
        i += 1;
      }
    } else if (char === '"') {
      if (field !== '') {
        throw new Error('Malformed CSV: unexpected quote');
      }
      quoted = true;
      i += 1;
    } else if (char === ',') {
      pushField();
      i += 1;
    } else if (char === '\r') {
      if (content[i + 1] === '\n') i += 1;
      pushRow();
      i += 1;
    } else if (char === '\n') {
      pushRow();
      i += 1;
    } else {
      field += char;
      i += 1;
    }
  }
  if (quoted) throw new Error('Malformed CSV: unterminated quote');
  if (field !== '' || current.length > 0) pushRow();
  if (rows.length === 0) throw new Error('Malformed CSV: no header row');
  const headers = rows[0].map((h) => h.trim());
  if (new Set(headers).size !== headers.length) {
    throw new Error('Malformed CSV: duplicate headers');
  }
  return {
    headers,
    rows: rows.slice(1).map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = (row[index] ?? '').trim();
      });
      return record;
    }),
  };
}

export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const escape = (value: string): string =>
    /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return (
    [
      headers.map(escape).join(','),
      ...rows.map((row) => row.map(escape).join(',')),
    ].join('\r\n') + '\r\n'
  );
}
