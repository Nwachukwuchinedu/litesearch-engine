// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — Main Engine
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AnyDocument,
  LiteSearchConfig,
  FieldConfig,
  SearchOptions,
  SearchResult,
  SearchHit,
  SuggestResult,
  IndexStats,
  DocMeta,
  FilterClause,
  FilterGroup,
} from "./types/index";

import { buildTokenizer, type TokenizerFn } from "./core/tokenizer";
import { BM25Scorer } from "./core/bm25";
import { InvertedIndexStore } from "./indexing/inverted-index";
import { DocumentStore } from "./indexing/document-store";
import { SuggestionEngine } from "./suggest/suggestion-engine";
import { evaluateFilter } from "./filters/filter-engine";
import { highlight } from "./search/highlighter";

// ─────────────────────────────────────────────────────────────────────────────

function resolveFields<T extends AnyDocument>(
  fields: LiteSearchConfig<T>["fields"]
): Record<string, FieldConfig> {
  if (Array.isArray(fields)) {
    const out: Record<string, FieldConfig> = {};
    for (const f of fields) out[f] = {};
    return out;
  }
  return fields as Record<string, FieldConfig>;
}

function getFieldValue(doc: AnyDocument, field: string, path?: string): string {
  const key = path ?? field;
  const parts = key.split(".");
  let val: unknown = doc;
  for (const p of parts) {
    if (val === null || val === undefined) return "";
    val = (val as Record<string, unknown>)[p];
  }

  if (Array.isArray(val)) return val.join(" ");
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return "";
}

// ─────────────────────────────────────────────────────────────────────────────

export class LiteSearch<T extends AnyDocument = AnyDocument> {
  private config: Required<LiteSearchConfig<T>>;
  private fields: Record<string, FieldConfig>;
  private tokenize: TokenizerFn;
  private index: InvertedIndexStore;
  private docs: DocumentStore;
  private suggester: SuggestionEngine;
  private scorer: BM25Scorer;
  private lastUpdated: Date | null = null;

  constructor(config: LiteSearchConfig<T>) {
    // Build full config with defaults
    this.config = {
      idField: (config.idField ?? "id") as keyof T & string,
      fields: config.fields,
      fuzzy: {
        maxDistance: 2,
        minLength: 4,
        enabled: true,
        ...config.fuzzy,
      },
      scoring: {
        k1: 1.2,
        b: 0.75,
        ...config.scoring,
      },
      suggest: {
        maxResults: 10,
        caseSensitive: false,
        ...config.suggest,
      },
      tokenizer: {
        language: "en",
        ...config.tokenizer,
      },
    };

    this.fields = resolveFields(config.fields);
    this.tokenize = buildTokenizer(
      this.config.tokenizer.tokenize,
      this.config.tokenizer.language
    );
    this.index = new InvertedIndexStore();
    this.docs = new DocumentStore();
    this.suggester = new SuggestionEngine(this.config.suggest.maxResults);
    this.scorer = new BM25Scorer(this.config.scoring);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // INDEXING
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Add a single document to the index.
   * If a document with the same ID already exists, it is replaced.
   */
  add(doc: T): void {
    const id = String(doc[this.config.idField]);
    if (!id) throw new Error(`Document missing idField: "${this.config.idField}"`);

    // Remove existing doc first (upsert behaviour)
    if (this.docs.has(id)) {
      this.remove(id);
    }

    const fieldLengths: Record<string, number> = {};

    for (const [field, fieldCfg] of Object.entries(this.fields)) {
      const rawValue = getFieldValue(doc, field, fieldCfg.path);
      if (!rawValue) continue;

      const tokens = this.tokenize(rawValue);
      fieldLengths[field] = tokens.length;

      // Index each token with its position
      tokens.forEach((token, position) => {
        this.index.addPosting(field, token, id, position);
      });

      // Feed the suggestion trie (only for suggest-enabled fields)
      if (fieldCfg.suggest !== false) {
        // Deduplicate tokens per field before inserting into trie
        const unique = [...new Set(tokens)];
        for (const token of unique) {
          if (token.length >= 2) {
            this.suggester.insert(token, id);
          }
        }
      }
    }

    const meta: DocMeta = { id, fieldLengths, doc };
    this.docs.add(meta);
    this.lastUpdated = new Date();
  }

  /**
   * Add multiple documents at once (batch indexing).
   * More efficient than calling add() in a loop for large datasets.
   */
  addMany(documents: T[]): void {
    for (const doc of documents) {
      this.add(doc);
    }
  }

  /**
   * Remove a document by its ID.
   */
  remove(id: string): boolean {
    const removed = this.docs.remove(id);
    if (removed) {
      this.index.removeDoc(id);
      this.suggester.removeDoc(id);
      this.lastUpdated = new Date();
    }
    return removed;
  }

  /**
   * Update a document. Equivalent to remove + add.
   */
  update(doc: T): void {
    this.add(doc); // add() already handles upsert
  }

  /**
   * Clear the entire index.
   */
  clear(): void {
    this.index.clear();
    this.docs.clear();
    this.suggester.clear();
    this.lastUpdated = null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SEARCH
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Full-text search with BM25 scoring, fuzzy matching, prefix matching,
   * filtering, and optional highlighting.
   *
   * @param query   The search query string
   * @param options Search options (limit, offset, filter, highlight, etc.)
   */
  search(query: string, options: SearchOptions = {}): SearchResult<T> {
    const start = Date.now();

    const {
      limit = 10,
      offset = 0,
      filter,
      fields: searchFields,
      highlight: doHighlight = true,
      minScore = 0,
      boostExact = true,
    } = options;

    const q = query.trim();
    if (!q) return this._emptyResult(q, limit, offset, start);

    const queryTokens = this.tokenize(q);
    if (queryTokens.length === 0) return this._emptyResult(q, limit, offset, start);

    const targetFields = this._resolveSearchFields(searchFields);
    const N = this.docs.size;
    const maxFuzzyDist = this.config.fuzzy.enabled
      ? (this.config.fuzzy.maxDistance ?? 2)
      : 0;

    // ── Pipeline ───────────────────────────────────────────────────────────
    const { rawScores, docMatchTypes, docMatchedTokens } = this._lookupAndScore(
      queryTokens, targetFields, maxFuzzyDist, N
    );
    this._applyExactBoost(rawScores, queryTokens, targetFields, q, boostExact);
    const normScores = this._normaliseScores(rawScores);
    const { paginated, total } = this._filterAndSortCandidates(
      normScores, rawScores, filter, minScore, limit, offset
    );
    const hits = this._buildHits(
      paginated, targetFields, doHighlight, docMatchedTokens, docMatchTypes
    );

    return {
      hits,
      total,
      took: Date.now() - start,
      query,
      pagination: { limit, offset, hasMore: offset + limit < total },
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SUGGEST (AUTOCOMPLETE)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get autocomplete suggestions for a partial query.
   * Combines trie prefix lookup with fuzzy fallback.
   *
   * @param query  Partial query string (e.g. "Nikee")
   */
  suggest(query: string): SuggestResult {
    const maxDist = this.config.fuzzy.enabled
      ? (this.config.fuzzy.maxDistance ?? 2)
      : 0;
    return this.suggester.suggest(query, maxDist);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STATS
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Get index statistics.
   */
  stats(): IndexStats {
    return {
      documentCount: this.docs.size,
      termCount: this.index.termCount(),
      trieNodeCount: this.suggester.nodeCount,
      fields: Object.keys(this.fields),
      memoryEstimateBytes: this.docs.estimateMemory(),
      lastUpdated: this.lastUpdated,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ───────────────────────────────────────────────────────────────────────────

  private _resolveSearchFields(fields?: string[]): string[] {
    return fields
      ? fields.filter((f) => f in this.fields)
      : Object.keys(this.fields);
  }

  private _lookupAndScore(
    queryTokens: string[],
    targetFields: string[],
    maxFuzzyDist: number,
    N: number
  ): {
    rawScores: Map<string, number>;
    docMatchTypes: Map<string, "exact" | "prefix" | "fuzzy">;
    docMatchedTokens: Map<string, Set<string>>;
  } {
    const rawScores = new Map<string, number>();
    const docMatchTypes = new Map<string, "exact" | "prefix" | "fuzzy">();
    const docMatchedTokens = new Map<string, Set<string>>();

    for (const field of targetFields) {
      const fieldCfg = this.fields[field];
      const weight = fieldCfg.weight ?? 1.0;
      const avgLen = this.docs.avgFieldLength(field);

      for (const token of queryTokens) {
        const matches = this.index.lookup(field, token, maxFuzzyDist, true);

        for (const { postings, matchType } of matches) {
          const termScores = this.scorer.scoreField(
            postings,
            new Map([...this.docs.getAll()].map((m) => [m.id, m])),
            field,
            avgLen,
            N,
            weight
          );

          for (const [docId, score] of termScores) {
            rawScores.set(docId, (rawScores.get(docId) ?? 0) + score);

            const current = docMatchTypes.get(docId);
            if (
              !current ||
              (matchType === "exact" && current !== "exact") ||
              (matchType === "prefix" && current === "fuzzy")
            ) {
              docMatchTypes.set(docId, matchType);
            }

            if (!docMatchedTokens.has(docId)) {
              docMatchedTokens.set(docId, new Set());
            }
            docMatchedTokens.get(docId)!.add(token);
          }
        }
      }
    }

    return { rawScores, docMatchTypes, docMatchedTokens };
  }

  private _applyExactBoost(
    rawScores: Map<string, number>,
    queryTokens: string[],
    targetFields: string[],
    q: string,
    boostExact: boolean
  ): void {
    if (!boostExact || queryTokens.length <= 1) return;

    const exactIds = new Set<string>();
    for (const [docId, meta] of this.docs.getAll().map((m) => [m.id, m] as const)) {
      for (const field of targetFields) {
        const val = getFieldValue(meta.doc, field, this.fields[field]?.path).toLowerCase();
        if (val.includes(q.toLowerCase())) {
          exactIds.add(docId);
        }
      }
    }
    BM25Scorer.applyExactBoost(rawScores, exactIds, 1.5);
  }

  private _normaliseScores(rawScores: Map<string, number>): Map<string, number> {
    return BM25Scorer.normalise(rawScores);
  }

  private _filterAndSortCandidates(
    normScores: Map<string, number>,
    rawScores: Map<string, number>,
    filter: FilterClause | FilterGroup | undefined,
    minScore: number,
    limit: number,
    offset: number
  ): { paginated: Array<{ id: string; score: number; raw: number }>; total: number } {
    let candidates: Array<{ id: string; score: number; raw: number }> = [];

    for (const [id, score] of normScores) {
      if (score < minScore) continue;
      candidates.push({ id, score, raw: rawScores.get(id)! });
    }

    if (filter) {
      candidates = candidates.filter((c) => {
        const meta = this.docs.get(c.id);
        return meta ? evaluateFilter(meta.doc, filter) : false;
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    const total = candidates.length;
    const paginated = candidates.slice(offset, offset + limit);

    return { paginated, total };
  }

  private _buildHits(
    paginated: Array<{ id: string; score: number; raw: number }>,
    targetFields: string[],
    doHighlight: boolean,
    docMatchedTokens: Map<string, Set<string>>,
    docMatchTypes: Map<string, "exact" | "prefix" | "fuzzy">
  ): SearchHit<T>[] {
    const hits: SearchHit<T>[] = [];

    for (const { id, score, raw } of paginated) {
      const meta = this.docs.get(id);
      if (!meta) continue;

      const matchedTokens = [...(docMatchedTokens.get(id) ?? [])];
      const matchType = docMatchTypes.get(id) ?? "fuzzy";

      let highlights;
      if (doHighlight) {
        highlights = targetFields
          .map((field) => {
            const val = getFieldValue(meta.doc, field, this.fields[field]?.path);
            if (!val) return null;
            return highlight(val, matchedTokens, field);
          })
          .filter((h): h is NonNullable<typeof h> => h !== null && h.matchedTokens.length > 0);
      }

      hits.push({
        document: meta.doc as T,
        score,
        rawScore: raw,
        matchType,
        highlights,
      });
    }

    return hits;
  }

  private _emptyResult(
    query: string,
    limit: number,
    offset: number,
    start: number
  ): SearchResult<T> {
    return {
      hits: [],
      total: 0,
      took: Date.now() - start,
      query,
      pagination: { limit, offset, hasMore: false },
    };
  }
}
