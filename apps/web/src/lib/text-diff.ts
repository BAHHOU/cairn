export interface DiffPart {
  kind: "same" | "added" | "removed";
  text: string;
}

/**
 * Words, spaces, and amounts written with thousands separators as one token ("50 000", "2,000,000"),
 * so a changed amount reads as one replacement. Joining the tokens gives the text back exactly.
 */
const tokens = (text: string) => text.match(/\d{1,3}(?:[   ,.]\d{3})+|\s+|[^\s]+/g) ?? [];

/**
 * Word-level difference between two short texts (a ticket as approved and as it reads today), by
 * longest common subsequence. Quadratic: meant for specifications, not for files.
 */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = lcs[i] as number[];
      const below = lcs[i + 1] as number[];
      row[j] =
        a[i] === b[j]
          ? (below[j + 1] as number) + 1
          : Math.max(below[j] as number, row[j + 1] as number);
    }
  }
  const at = (i: number, j: number) => (lcs[i] as number[])[j] as number;

  const raw: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      raw.push({ kind: "same", text: a[i++] as string });
      j++;
    } else if (j >= b.length || (i < a.length && at(i + 1, j) >= at(i, j + 1))) {
      raw.push({ kind: "removed", text: a[i++] as string });
    } else {
      raw.push({ kind: "added", text: b[j++] as string });
    }
  }
  return groupEdits(raw);
}

/**
 * Consecutive edits, including the spaces between them, become one removed run and one added run:
 * "pour les comptes" → "pour tous les comptes" stays readable instead of alternating word by word.
 */
function groupEdits(parts: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = [];
  let k = 0;
  while (k < parts.length) {
    const part = parts[k] as DiffPart;
    if (part.kind === "same") {
      const last = out.at(-1);
      if (last?.kind === "same") last.text += part.text;
      else out.push({ ...part });
      k++;
      continue;
    }
    let removed = "";
    let added = "";
    while (k < parts.length) {
      const p = parts[k] as DiffPart;
      const next = parts[k + 1];
      if (p.kind === "removed") removed += p.text;
      else if (p.kind === "added") added += p.text;
      else if (/^\s+$/.test(p.text) && next && next.kind !== "same") {
        if (removed) removed += p.text;
        if (added) added += p.text;
      } else break;
      k++;
    }
    if (removed) out.push({ kind: "removed", text: removed });
    if (added) out.push({ kind: "added", text: added });
  }
  return out;
}
