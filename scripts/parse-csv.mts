/**
 * The one CSV reader, shared by every review script.
 *
 * Hand-rolled rather than a dependency because the requirement is small and
 * fixed: RFC-4180 quoting, doubled quotes inside quoted fields, CRLF tolerated,
 * a UTF-8 BOM stripped off the first header cell. Three scripts each had their
 * own copy of this loop.
 */
export type CsvRow = Record<string, string>;

export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift()!.map((h) => h.replace(/^﻿/, "").trim());
  return rows
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}
