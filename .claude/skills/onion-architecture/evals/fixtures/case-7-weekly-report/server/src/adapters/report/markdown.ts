import { markdownTable } from 'markdown-table';

export function renderMarkdownTable(header: string[], rows: (string | number)[][]): string {
  return markdownTable([header, ...rows.map((row) => row.map(String))]);
}
