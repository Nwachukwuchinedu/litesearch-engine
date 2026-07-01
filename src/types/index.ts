// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — Core Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Any object shape the user wants to index. The only requirement:
 * it must have a string or number `id` field (or you map one via `idField`).
 */
export type AnyDocument = Record<string, unknown>;

/**
 * A single field configuration for indexing.
 */
export interface FieldConfig {
  /** Weight multiplier for scoring. Higher = more important. Default: 1.0 */
  weight?: number;
  /** Whether to include this field in autocomplete suggestions. Default: false */
  suggest?: boolean;
  /**
   * How to extract the value from a nested object.
   * E.g. "meta.brand" would index doc.meta.brand
   */
  path?: string;
  /**
   * Custom extractor function. When provided, the built-in field value
   * extraction (getFieldValue) is skipped entirely and this function's
   * result is used as the raw value for indexing.
   * Useful for indexing computed values not present on the raw document.
   */
  extract?: (doc: AnyDocument) => string;
}

export interface LimitsConfig {
  /** Max characters in a query string. Default: 512 */
  maxQueryLength?: number;
  /** Max tokens after tokenization. Default: 128 */
  maxTokenCount?: number;
  /** Max JSON bytes per document. Default: 1,000,000 (1MB) */
  maxDocumentSize?: number;
  /** Max characters per field value (truncated if exceeded). Default: 10,000 */
  maxFieldValueSize?: number;
}

/**
 * LiteSearch engine configuration.
 */
export interface LiteSearchConfig<T extends AnyDocument = AnyDocument> {
  /**
   * The field on your document that uniquely identifies it.
   * Default: "id"
   */
  idField?: keyof T & string;

  /**
   * Custom ID resolver function.
   * When provided, this is called instead of field lookup.
   * Useful for MongoDB ObjectId, composite keys, UUID generation, etc.
   */
  idResolver?: (doc: AnyDocument) => string;

  /**
   * Fields to index and their configurations.
   * If you pass a string array, all fields use default config.
   *
   * @example
   * fields: {
   *   name:        { weight: 3, suggest: true },
   *   description: { weight: 1 },
   *   category:    { weight: 2, suggest: true },
   *   tags:        { weight: 1.5 },
   * }
   */
  fields: (keyof T & string)[] | Record<keyof T & string, FieldConfig>;

  /**
   * Fuzzy matching settings.
   */
  fuzzy?: {
    /** Maximum edit distance (Levenshtein). Default: 2 */
    maxDistance?: number;
    /**
     * Minimum word length before fuzzy kicks in.
     * Short words like "at" don't benefit from fuzzy. Default: 4
     */
    minLength?: number;
    /** Enable/disable fuzzy globally. Default: true */
    enabled?: boolean;
  };

  /**
   * Scoring settings (BM25-inspired).
   */
  scoring?: {
    /** BM25 k1 — term frequency saturation. Default: 1.2 */
    k1?: number;
    /** BM25 b — field length normalization factor. Default: 0.75 */
    b?: number;
  };

  /**
   * Suggestion (autocomplete) settings.
   */
  suggest?: {
    /** Max suggestions returned. Default: 10 */
    maxResults?: number;
    /** Whether suggestions are case-sensitive. Default: false */
    caseSensitive?: boolean;
  };

  /**
   * Tokenizer settings.
   */
  tokenizer?: {
    /**
     * Custom tokenizer function. If not provided, uses built-in
     * (splits on whitespace + punctuation, lowercases, removes stopwords)
     */
    tokenize?: (text: string) => string[];
    /** Language stopwords to strip. Default: "en" */
    language?: "en" | "none";
    /** Custom stopword set for the chosen language. Overrides built-in stopwords. */
    stopwords?: Set<string>;
    /**
     * Stemmer plugin. Runs on each token after splitting.
     * Default: identity (no stemming).
     */
    stemmer?: (token: string, language: string) => string;
    /**
     * Normalizer plugin. Runs on raw text before tokenization.
     * Default: identity (no normalization).
     */
    normalizer?: (token: string) => string;
  };

  /**
   * Input size limits for security and performance.
   */
  limits?: LimitsConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter Types
// ─────────────────────────────────────────────────────────────────────────────

export type FilterOperator =
  | "eq"    // equals
  | "neq"   // not equals
  | "gt"    // greater than
  | "gte"   // greater than or equal
  | "lt"    // less than
  | "lte"   // less than or equal
  | "in"    // value is in array
  | "nin"   // value is NOT in array
  | "range" // between two values (inclusive)
  | "contains" // string contains
  | "startsWith" // string starts with
  | "exists";  // field exists and is not null/undefined

export interface FilterClause {
  field: string;
  operator: FilterOperator;
  /** For "range", pass [min, max]. For "in"/"nin", pass array. */
  value: unknown;
}

/**
 * Filter DSL — compose AND / OR / NOT filters.
 *
 * @example
 * filter: {
 *   AND: [
 *     { field: "category", operator: "eq", value: "Shoes" },
 *     { field: "price",    operator: "range", value: [5000, 50000] },
 *   ]
 * }
 */
export interface FilterGroup {
  AND?: (FilterClause | FilterGroup)[];
  OR?:  (FilterClause | FilterGroup)[];
  NOT?: FilterClause | FilterGroup;
}

// ─────────────────────────────────────────────────────────────────────────────
// Search Input / Output Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FacetConfig {
  type: "terms" | "range" | "date_histogram";
  size?: number;
  ranges?: Array<{ label: string; min?: number; max?: number }>;
  interval?: "day" | "week" | "month" | "year";
}

export interface FacetResult {
  type: "terms" | "range" | "date_histogram";
  buckets: Array<{
    key: string | number;
    label?: string;
    count: number;
    min?: number;
    max?: number;
  }>;
}

export interface SearchOptions {
  /** Pagination: number of results to return. Default: 10 */
  limit?: number;
  /** Pagination: offset. Default: 0 */
  offset?: number;
  /**
   * Optional filter. Applied AFTER full-text scoring (pre-filter for speed
   * is enabled by default when filters are present on indexed fields).
   */
  filter?: FilterClause | FilterGroup;
  /**
   * Fields to search. If omitted, searches all configured fields.
   */
  fields?: string[];
  /**
   * Return highlighted snippets showing why a result matched.
   * Default: true
   */
  highlight?: boolean;
  /**
   * Minimum relevance score (0–1 normalised). Results below this are dropped.
   * Default: 0.0 (return everything ranked)
   */
  minScore?: number;
  /**
   * Whether to boost exact matches to the top. Default: true
   */
  boostExact?: boolean;
  /** Optional sort. Sorts by field value after BM25 scoring. */
  sort?: SortOption;
  /**
   * Faceted navigation configuration.
   * Computed on the filtered result set (after filter DSL, before scoring).
   */
  facets?: Record<string, FacetConfig>;
}

export interface HighlightResult {
  /** The field that matched. */
  field: string;
  /** The snippet with matched tokens wrapped in <mark>…</mark> */
  snippet: string;
  /** The matched tokens. */
  matchedTokens: string[];
}

export interface SearchHit<T extends AnyDocument = AnyDocument> {
  /** The original document. */
  document: T;
  /** Normalised relevance score (0–1). 1 = perfect match. */
  score: number;
  /** Raw BM25 score (before normalisation). */
  rawScore: number;
  /** Fuzzy match distance per field (0 = exact). */
  matchType: "exact" | "prefix" | "fuzzy";
  /** Field-level highlights. Only present when highlight: true */
  highlights?: HighlightResult[];
}

export interface SearchResult<T extends AnyDocument = AnyDocument> {
  /** Ranked list of hits. */
  hits: SearchHit<T>[];
  /** Total matching documents (before limit/offset). */
  total: number;
  /** How long the search took in milliseconds. */
  took: number;
  /** The query that was executed. */
  query: string;
  /** Pagination info. */
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  /** Faceted navigation results (if requested via options.facets). */
  facets?: Record<string, FacetResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-Index Search Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchAllOptions {
  /** Index names to search, or { name: weight } map for per-index score multipliers. */
  indexes?: string[] | Record<string, number>;
  /** Pagination: number of results to return. Default: 10 */
  limit?: number;
  /** Pagination: offset. Default: 0 */
  offset?: number;
  /** Optional filter. Applied per-index during search. */
  filter?: FilterClause | FilterGroup;
  /** Return highlighted snippets. Default: true */
  highlight?: boolean;
}

export interface SearchAllResult {
  /** Merged, ranked hits tagged with _index. */
  hits: SearchHit<AnyDocument & { _index: string }>[];
  /** Total matching documents (before limit/offset). */
  total: number;
  /** How long the cross-index search took in milliseconds. */
  took: number;
  /** Per-index stats. */
  perIndex: Record<string, { total: number; took: number }>;
  /** The query that was executed. */
  query: string;
  /** Pagination info. */
  pagination: { limit: number; offset: number; hasMore: boolean };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suggestion Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SuggestionHit {
  /** The suggested text. */
  text: string;
  /** Which document(s) this suggestion points to. */
  documentIds: string[];
  /** How many documents contain this suggestion. */
  frequency: number;
  /** Match type. */
  matchType: "prefix" | "fuzzy" | "exact";
  /** Fuzzy edit distance. 0 = exact. */
  distance: number;
}

export interface SuggestResult {
  suggestions: SuggestionHit[];
  took: number;
  query: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Index Stats
// ─────────────────────────────────────────────────────────────────────────────

export interface IndexStats {
  /** Total documents in the index. */
  documentCount: number;
  /** Total unique terms in the inverted index. */
  termCount: number;
  /** Total unique tokens in the suggestion trie. */
  trieNodeCount: number;
  /** Configured fields. */
  fields: string[];
  /** Approximate memory usage in bytes. */
  memoryEstimateBytes: number;
  /** When the index was last updated. */
  lastUpdated: Date | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Index Structures (exported for advanced usage)
// ─────────────────────────────────────────────────────────────────────────────

/** Inverted index posting: maps docId → [positions] */
export type Postings = Map<string, number[]>;

/** The full inverted index: term → postings */
export type InvertedIndex = Map<string, Postings>;

/** Per-document metadata used for BM25 scoring */
export interface DocMeta {
  id: string;
  /** Token count per field */
  fieldLengths: Record<string, number>;
  /** The original document */
  doc: AnyDocument;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sort Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SortOption {
  field: string;
  direction: "asc" | "desc";
  type?: "string" | "number" | "date";
}

// ─────────────────────────────────────────────────────────────────────────────
// Browse / Get / Has / Export / Import Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BrowseOptions {
  /** Pagination: number of results to return. Default: 10 */
  limit?: number;
  /** Pagination: offset. Default: 0 */
  offset?: number;
  /** Optional filter. Applied before pagination. */
  filter?: FilterClause | FilterGroup;
  /** Optional sort config. */
  sort?: SortOption;
}

export interface BrowseHit<T extends AnyDocument = AnyDocument> {
  /** The original document. */
  document: T;
}

export interface BrowseResult<T extends AnyDocument = AnyDocument> {
  /** List of hits. */
  hits: BrowseHit<T>[];
  /** Total matching documents (before limit/offset). */
  total: number;
  /** How long the browse took in milliseconds. */
  took: number;
  /** Pagination info. */
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
