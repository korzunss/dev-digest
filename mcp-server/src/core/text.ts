/** Cap for every repo-, PR- or model-written string a tool returns (and API error text). */
export const TEXT_MAX = 200;

export function cut(text: string): string {
  return text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX)}…` : text;
}
