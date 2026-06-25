// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — Tokenizer
// ─────────────────────────────────────────────────────────────────────────────

const EN_STOPWORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "by","from","is","are","was","were","be","been","being","have","has",
  "had","do","does","did","will","would","could","should","may","might",
  "shall","can","need","dare","ought","used","it","its","this","that",
  "these","those","i","you","he","she","we","they","me","him","her","us",
  "them","my","your","his","our","their","what","which","who","whom",
  "not","no","nor","so","yet","both","either","neither",
]);

// Regex: split on anything that is NOT a letter, digit, or apostrophe
const SPLIT_RE = /[^a-z0-9']+/g;

export type TokenizerFn = (text: string) => string[];

export function defaultTokenizer(
  text: string,
  stripStopwords = true
): string[] {
  if (!text || typeof text !== "string") return [];

  const tokens = text
    .toLowerCase()
    .split(SPLIT_RE)
    .filter((t) => t.length >= 1);

  if (stripStopwords) {
    return tokens.filter((t) => !EN_STOPWORDS.has(t) && t.length >= 2);
  }

  return tokens.filter((t) => t.length >= 1);
}

/**
 * Normalize a single term for lookup (lowercase, trim).
 */
export function normalizeTerm(term: string): string {
  return term.toLowerCase().trim();
}

/**
 * Build a factory function that returns the right tokenizer
 * based on config.
 */
export function buildTokenizer(
  custom?: TokenizerFn,
  language: "en" | "none" = "en"
): TokenizerFn {
  if (custom) return custom;
  const stripStopwords = language === "en";
  return (text: string) => defaultTokenizer(text, stripStopwords);
}
