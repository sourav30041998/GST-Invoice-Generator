const FORMULA_PREFIX = /^[=+\-@\t\r]/;

const escapeCell = (value: unknown) => {
  const text = String(value ?? "");
  const safeText = FORMULA_PREFIX.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
};

export function toCsv(headers: string[], rows: unknown[][]) {
  return [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ].join("\n");
}
