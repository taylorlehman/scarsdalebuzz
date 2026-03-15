import chalk from 'chalk';

/**
 * @param {unknown} data
 * @param {boolean} useJson
 */
export function print(data, useJson = false) {
  if (useJson) {
    const out = typeof data === 'string' ? { message: data } : data;
    console.log(JSON.stringify(out, jsonReplacer, 2));
  } else {
    if (typeof data === 'string') {
      console.log(data);
    } else if (Array.isArray(data)) {
      data.forEach((item) => console.log(item));
    } else if (data && typeof data === 'object') {
      console.log(JSON.stringify(data, jsonReplacer, 2));
    }
  }
}

function jsonReplacer(key, value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null && typeof value.toDate === 'function') {
    return value.toDate ? value.toDate().toISOString() : value;
  }
  return value;
}

/**
 * @param {string} msg
 */
export function printError(msg) {
  console.error(chalk.red('Error:'), msg);
}

/**
 * @param {string} msg
 */
export function printSuccess(msg) {
  console.log(chalk.green(msg));
}

/**
 * Build a plain-text table from rows and column defs.
 * @param {Record<string, string | number>[]} rows
 * @param {{ key: string, header: string, maxWidth?: number }[]} columns
 * @returns {string}
 */
export function formatTable(rows, columns) {
  if (rows.length === 0) return 'No results.';
  const pad = (s, w) => String(s).slice(0, w - 1).padEnd(w);
  const widths = columns.map((col) => {
    const contentMax = Math.max(...rows.map((r) => String(r[col.key] ?? '').length));
    const w = Math.max(col.header.length, contentMax) + 1;
    return col.maxWidth ? Math.min(w, col.maxWidth) : w;
  });
  const header = columns.map((c, i) => pad(c.header, widths[i])).join('');
  const line = '-'.repeat(header.length);
  const body = rows.map((row) =>
    columns.map((col, i) => pad(row[col.key] ?? '—', widths[i])).join('')
  );
  return [header, line, ...body].join('\n');
}
