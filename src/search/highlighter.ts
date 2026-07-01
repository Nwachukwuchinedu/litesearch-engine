// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — Highlighter
// ─────────────────────────────────────────────────────────────────────────────

import type { HighlightResult } from "../types/index";

/**
 * Generate a highlighted snippet for a given field value and matched tokens.
 *
 * - Wraps each matched token with <mark>…</mark>
 * - Truncates long values to a context window around the first match
 * - Returns the field name, snippet, and matched tokens
 */
export function highlight(
  fieldValue: string,
  matchedTokens: string[],
  field: string,
  snippetLength = 160
): HighlightResult {
  if (!fieldValue || !matchedTokens.length) {
    return {
      field,
      snippet: fieldValue?.slice(0, snippetLength) ?? "",
      matchedTokens: [],
    };
  }

  const lower = fieldValue.toLowerCase();
  const found: string[] = [];

  // Find the position of the first match for context window
  let firstMatchPos = -1;
  for (const token of matchedTokens) {
    const idx = lower.indexOf(token.toLowerCase());
    if (idx !== -1) {
      found.push(token);
      if (firstMatchPos === -1 || idx < firstMatchPos) {
        firstMatchPos = idx;
      }
    }
  }

  // Calculate context window
  const start = Math.max(
    0,
    firstMatchPos === -1 ? 0 : firstMatchPos - 30
  );
  const end = Math.min(fieldValue.length, start + snippetLength);
  let snippet = fieldValue.slice(start, end);

  // Prefix/suffix ellipsis
  if (start > 0) snippet = "…" + snippet;
  if (end < fieldValue.length) snippet = snippet + "…";

  // Highlight all matched tokens in the snippet using a single combined regex
  const combined = found.length > 0
    ? new RegExp(`(${[...found].sort((a, b) => b.length - a.length).map(escapeRegex).join("|")})`, "gi")
    : null;
  const highlighted = combined ? snippet.replace(combined, (match) => `<mark>${match}</mark>`) : snippet;

  return {
    field,
    snippet: highlighted,
    matchedTokens: found,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
