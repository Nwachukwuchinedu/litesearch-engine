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

  // Highlight all matched tokens in the snippet
  let highlighted = snippet;
  const sorted = [...found].sort((a, b) => b.length - a.length); // longest first to avoid partial replacements

  for (const token of sorted) {
    const re = new RegExp(escapeRegex(token), "gi");
    highlighted = highlighted.replace(re, (match) => `<mark>${match}</mark>`);
  }

  return {
    field,
    snippet: highlighted,
    matchedTokens: found,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
