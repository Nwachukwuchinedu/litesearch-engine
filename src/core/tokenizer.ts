// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — Tokenizer
// ─────────────────────────────────────────────────────────────────────────────

const STOPWORDS = new Map<string, Set<string>>([
  ["en", new Set([
    "a","an","the","and","or","but","in","on","at","to","for","of","with",
    "by","from","is","are","was","were","be","been","being","have","has",
    "had","do","does","did","will","would","could","should","may","might",
    "shall","can","need","dare","ought","used","it","its","this","that",
    "these","those","i","you","he","she","we","they","me","him","her","us",
    "them","my","your","his","our","their","what","which","who","whom",
    "not","no","nor","so","yet","both","either","neither",
  ])],
]);

// Unicode-aware split: letters (\p{L}) and digits (\p{N}) from any language
const SPLIT_RE = /[^\p{L}\p{N}']+/gu;

export type TokenizerFn = (text: string) => string[];

export interface TokenizerConfig {
  tokenize?: TokenizerFn;
  language?: "en" | "none";
  stopwords?: Set<string>;
  stemmer?: (token: string, language: string) => string;
  normalizer?: (token: string) => string;
}

export function defaultTokenizer(
  text: string,
  language?: "en" | "none" | boolean,
  customStopwords?: Set<string>,
  stemmer?: (token: string, language: string) => string,
  normalizer?: (token: string) => string
): string[] {
  if (!text || typeof text !== "string") return [];

  const lang: "en" | "none" =
    language === true || language === undefined ? "en" :
    language === false ? "none" :
    language;

  let processed = text;
  if (normalizer) processed = normalizer(processed);

  processed = processed.toLowerCase();

  const tokens = processed
    .split(SPLIT_RE)
    .filter((t) => t.length >= 1);

  const stemmed = stemmer ? tokens.map((t) => stemmer(t, lang)) : tokens;

  if (lang === "none") return stemmed.filter((t) => t.length >= 1);

  const stopwordSet = customStopwords ?? STOPWORDS.get(lang) ?? STOPWORDS.get("en")!;
  return stemmed.filter((t) => !stopwordSet.has(t) && t.length >= 2);
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
 *
 * Accepts either the legacy positional signature:
 *   buildTokenizer(customFn?, language?)
 * Or a single config object:
 *   buildTokenizer({ tokenize, language, stopwords, stemmer, normalizer })
 */
export function buildTokenizer(
  custom?: TokenizerFn | TokenizerConfig,
  language?: "en" | "none"
): TokenizerFn {
  if (custom && typeof custom === "function") return custom;
  if (custom && typeof custom === "object") {
    const opts = custom as TokenizerConfig;
    if (opts.tokenize) return opts.tokenize;
    const lang = opts.language ?? "en";
    return (text: string) => defaultTokenizer(
      text, lang, opts.stopwords, opts.stemmer, opts.normalizer
    );
  }
  const lang = language ?? "en";
  return (text: string) => defaultTokenizer(text, lang);
}
