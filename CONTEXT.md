# LiteSearch — Domain Glossary

## Core Concepts

**Document** — Any object the caller wants to index and search. Generic `T extends AnyDocument`. Has an `id` field (configurable via `idField`).

**Field** — A named property on a Document that gets indexed. Configured with a weight (scoring multiplier), suggest flag (feeds autocomplete), fuzzy flag, and optional nested path.

**Token** — Single normalized word produced by the Tokenizer from raw field text. Lowercased, stripped of punctuation, optionally filtered for stopwords.

**Inverted Index** — Per-field map from Token → Document ID → positions[]. The core data structure enabling fast term lookup.

**Document Store** — Registry of all indexed Document metadata. Tracks per-field token lengths per doc (for BM25 length normalisation), and provides `avgFieldLength()`.

**Posting** — An entry in the Inverted Index: (docId, position) for a given Token in a given Field.

## Search Pipeline

**Query** — Raw user-provided search string. Tokenized into query tokens.

**Match** — A query token matched against the Inverted Index. Three precision levels: `exact`, `prefix`, `fuzzy`.

**BM25 Score** — Per-term, per-field relevance score. Combines IDF (rarer terms score more), TF normalisation (diminishing returns on repetition), and field-length normalisation. Summed across tokens and fields, then normalised to [0, 1].

**Filter** — Post-hoc predicate applied after scoring. AND/OR/NOT composition of clauses (eq, neq, gt, gte, lt, lte, range, in, nin, contains, startsWith, exists).

## Suggestion Pipeline

**Trie** — Character-level prefix tree mapping token prefixes to document IDs. Enables O(prefix length) autocomplete lookups.

**Suggestion** — A recommended completion for a partial query. Sources: trie prefix match (fast) with fuzzy fallback (Levenshtein scan of all trie words). Ranked: exact > prefix > fuzzy, then by frequency.

## Scoring Components

**Levenshtein Distance** — Edit distance between two strings, with early-exit optimisation and adaptive threshold (short words require exact match).

**BM25+ Scoring** — BM25 variant with configurable `k1` (term frequency saturation) and `b` (field length normalisation).

## Output Concepts

**Highlight** — Snippet of field text with `<mark>` wrappers around matched tokens, with ±30 char context window and 160-char max.

**SearchResult** — Collection of typed SearchHit objects with pagination metadata and timing.

**IndexStats** — Snapshot of document count, term count, trie node count, memory estimate, and last-updated timestamp.
