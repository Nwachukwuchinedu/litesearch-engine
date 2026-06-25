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
 * Tokenizer that also generates n-gram prefix tokens.
 * Used internally for partial-match indexing.
 * e.g. "shoe" → ["sho", "shoe"] (min prefix = 3)
 */
export function tokenizeWithPrefixes(
  text: string,
  minPrefixLen = 3
): string[] {
  const base = defaultTokenizer(text, false);
  const result = new Set<string>(base);

  for (const token of base) {
    for (let i = minPrefixLen; i < token.length; i++) {
      result.add(token.slice(0, i));
    }
  }

  return [...result];
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
