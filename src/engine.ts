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
  BrowseOptions,
  BrowseHit,
  BrowseResult,
  SortOption,
  FacetConfig,
  FacetResult,
} from "./types/index";

import { buildTokenizer, type TokenizerFn } from "./core/tokenizer";
import { BM25Scorer } from "./core/bm25";
import { InvertedIndexStore } from "./indexing/inverted-index";
import { DocumentStore } from "./indexing/document-store";
import { SuggestionEngine } from "./suggest/suggestion-engine";
import { evaluateFilter } from "./filters/filter-engine";
import { highlight } from "./search/highlighter";
import { sortDocuments, topKDocuments } from "./search/sorter";
import { computeFacets } from "./search/facets";

// ─────────────────────────────────────────────────────────────────────────────

/** Minimal console declaration (no dom/node types available) */
declare var console: { warn: (msg: string) => void };

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

function flattenValue(val: unknown, visited?: Set<object>): string {
  if (val === null || val === undefined) return "";
  if (val instanceof Date) return val.toISOString();
  if (Array.isArray(val)) {
    return val.map((v) => flattenValue(v, visited)).filter(Boolean).join(" ");
  }
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (typeof val === "object") {
    if (!visited) visited = new Set();
    if (visited.has(val as object)) return "";
    visited.add(val as object);
    return Object.values(val as Record<string, unknown>)
      .map((v) => flattenValue(v, visited))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function getFieldValue(doc: AnyDocument, field: string, path?: string): string {
  const key = path ?? field;
  const parts = key.split(".");
  let val: unknown = doc;
  for (const p of parts) {
    if (val === null || val === undefined) return "";
    val = (val as Record<string, unknown>)[p];
  }
  return flattenValue(val);
}

// ─────────────────────────────────────────────────────────────────────────────

export class LiteSearch<T extends AnyDocument = AnyDocument> {
  private config: Omit<Required<LiteSearchConfig<T>>, 'idResolver'>;
  private fields: Record<string, FieldConfig>;
  private tokenize: TokenizerFn;
  private index: InvertedIndexStore;
  private docs: DocumentStore;
  private suggester: SuggestionEngine;
  private scorer: BM25Scorer;
  private lastUpdated: Date | null = null;
  private idResolver?: (doc: AnyDocument) => string;

  constructor(config: LiteSearchConfig<T>) {
    this.idResolver = config.idResolver;

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
    this.tokenize = buildTokenizer(this.config.tokenizer);
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
   * @internal The `_emptyCounts` param is used by addMany() for batch empty-field tracking.
   */
  add(doc: T, _emptyCounts?: Map<string, number>): void {
    let id: string;
    if (this.idResolver) {
      id = this.idResolver(doc);
    } else {
      id = getFieldValue(doc, '', this.config.idField as string);
    }

    if (!id || id.trim() === '') {
      const keys = Object.keys(doc);
      throw new Error(
        `Document missing valid idField: "${this.config.idField}". Available keys: [${keys.join(', ')}]`
      );
    }

    // Remove existing doc first (upsert behaviour)
    if (this.docs.has(id)) {
      this.remove(id);
    }

    const fieldLengths: Record<string, number> = {};

    for (const [field, fieldCfg] of Object.entries(this.fields)) {
      const rawValue = fieldCfg.extract
        ? fieldCfg.extract(doc)
        : getFieldValue(doc, field, fieldCfg.path);

      if (!rawValue) {
        if (_emptyCounts) {
          _emptyCounts.set(field, (_emptyCounts.get(field) ?? 0) + 1);
        }
        continue;
      }

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
    this.scorer.invalidateIdfCache();
    this.lastUpdated = new Date();
  }

  /**
   * Add multiple documents at once (batch indexing).
   * More efficient than calling add() in a loop for large datasets.
   */
  addMany(documents: T[]): void {
    const emptyCounts = new Map<string, number>();
    for (const doc of documents) {
      this.add(doc, emptyCounts);
    }
    for (const [field, count] of emptyCounts) {
      if (count === documents.length) {
        console.warn(
          `[LiteSearch] Field "${field}" produced an empty string for all ${count} documents. Check that the field name or path is correct.`
        );
      }
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
      this.scorer.invalidateIdfCache();
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
    this.scorer.invalidateIdfCache();
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
    const filterDocIds = this._preFilterDocIds(filter);

    // Compute facets over the filtered doc set (if requested)
    let facetsResult: Record<string, FacetResult> | undefined;
    if (options.facets) {
      let filteredDocs: T[];
      if (filterDocIds) {
        filteredDocs = [];
        for (const meta of this.docs.getAll()) {
          if (filterDocIds.has(meta.id)) {
            filteredDocs.push(meta.doc as T);
          }
        }
      } else {
        filteredDocs = this.docs.getAllDocs<T>();
      }
      facetsResult = computeFacets(filteredDocs, options.facets);
    }

    const { rawScores, docMatchTypes, docMatchedTokens } = this._lookupAndScore(
      queryTokens, targetFields, maxFuzzyDist, N, filterDocIds
    );
    this._applyExactBoost(rawScores, queryTokens, targetFields, boostExact);
    const normScores = this._normaliseScores(rawScores);
    const { paginated, total } = this._filterAndSortCandidates(
      normScores, rawScores, minScore, limit, offset, options.sort
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
      facets: facetsResult,
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
  // BROWSE / GET / HAS / EXPORT / IMPORT
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Return all documents with optional filtering, sorting, and pagination.
   * No full-text scoring is performed.
   */
  browse(options: BrowseOptions = {}): BrowseResult<T> {
    const start = Date.now();
    const { limit = 10, offset = 0, filter, sort } = options;

    let docs = this.docs.getAll();

    // Filter
    if (filter) {
      docs = docs.filter((meta) => evaluateFilter(meta.doc, filter));
    }

    // Sort using sortDocuments
    if (sort) {
      const docMap = new Map<AnyDocument, DocMeta>();
      for (const meta of docs) {
        docMap.set(meta.doc, meta);
      }
      const sortedDocs = sortDocuments(
        docs.map((meta) => meta.doc as T),
        sort
      );
      docs = sortedDocs
        .map((doc) => docMap.get(doc))
        .filter((m): m is DocMeta => m !== undefined);
    }

    const total = docs.length;
    const paginated = docs.slice(offset, offset + limit);

    const hits: BrowseHit<T>[] = paginated.map((meta) => ({
      document: meta.doc as T,
    }));

    return {
      hits,
      total,
      took: Date.now() - start,
      pagination: {
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    };
  }

  /**
   * Retrieve a single document by its ID.
   */
  getById(id: string): T | undefined {
    const meta = this.docs.get(id);
    return meta ? (meta.doc as T) : undefined;
  }

  /**
   * Check whether a document with the given ID exists in the index.
   */
  has(id: string): boolean {
    return this.docs.has(id);
  }

  /**
   * Serialize the index state (documents + config) for later restoration.
   * Function-typed config fields (tokenize, stemmer, normalizer) are omitted.
   */
  export(): { documents: AnyDocument[]; config: Record<string, unknown> } {
    return {
      documents: this.docs.getAllDocs<T>(),
      config: {
        idField: this.config.idField,
        fields: this.config.fields,
        fuzzy: { ...this.config.fuzzy },
        scoring: { ...this.config.scoring },
        suggest: { ...this.config.suggest },
        tokenizer: { language: this.config.tokenizer.language },
      },
    };
  }

  /**
   * Restore index state from exported data.
   * Creates a fresh engine with the given config, then bulk-loads the documents.
   */
  static import<T extends AnyDocument = AnyDocument>(
    data: { documents: AnyDocument[]; config: Record<string, unknown> },
    config: LiteSearchConfig<T>
  ): LiteSearch<T> {
    // Validate that the provided config matches the serialized config
    const serialized = data.config ?? {};
    const mismatches: string[] = [];

    if (serialized.idField !== undefined && serialized.idField !== config.idField) {
      mismatches.push(`idField: "${serialized.idField}" vs "${config.idField}"`);
    }

    const serFields = serialized.fields;
    if (serFields) {
      const serFieldNames = Array.isArray(serFields)
        ? (serFields as string[]).sort().join(",")
        : Object.keys(serFields as Record<string, unknown>).sort().join(",");
      const cfgFieldNames = Array.isArray(config.fields)
        ? (config.fields as string[]).sort().join(",")
        : Object.keys(config.fields as Record<string, unknown>).sort().join(",");
      if (serFieldNames !== cfgFieldNames) {
        mismatches.push(`fields: [${serFieldNames}] vs [${cfgFieldNames}]`);
      }
    }

    if (serialized.fuzzy && config.fuzzy) {
      const serFuzzy = serialized.fuzzy as Record<string, unknown>;
      if (serFuzzy.enabled !== undefined && serFuzzy.enabled !== config.fuzzy.enabled) {
        mismatches.push(`fuzzy.enabled: ${serFuzzy.enabled} vs ${config.fuzzy.enabled}`);
      }
    }

    if (mismatches.length > 0) {
      console.warn(
        `[LiteSearch] Import config mismatch: ${mismatches.join("; ")}. ` +
        "The serialized index was created with different settings. " +
        "If you use a custom idResolver, ensure the same function is passed."
      );
    }

    const engine = new LiteSearch<T>(config);
    engine.addMany(data.documents as T[]);
    return engine;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ───────────────────────────────────────────────────────────────────────────

  private _resolveSearchFields(fields?: string[]): string[] {
    return fields
      ? fields.filter((f) => f in this.fields)
      : Object.keys(this.fields);
  }

  private _preFilterDocIds(
    filter: FilterClause | FilterGroup | undefined
  ): Set<string> | undefined {
    if (!filter) return undefined;
    const ids = new Set<string>();
    for (const meta of this.docs.getAll()) {
      if (evaluateFilter(meta.doc, filter)) {
        ids.add(meta.id);
      }
    }
    return ids;
  }

  private _lookupAndScore(
    queryTokens: string[],
    targetFields: string[],
    maxFuzzyDist: number,
    N: number,
    filterDocIds?: Set<string>
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
            token,
            postings,
            this.docs.getMetaMap(),
            field,
            avgLen,
            N,
            weight
          );

          for (const [docId, score] of termScores) {
            if (filterDocIds && !filterDocIds.has(docId)) continue;
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
    boostExact: boolean
  ): void {
    if (!boostExact || queryTokens.length <= 1) return;

    const exactIds = new Set<string>();
    for (const docId of rawScores.keys()) {
      for (const field of targetFields) {
        if (this.index.hasExactPhrase(field, queryTokens, docId)) {
          exactIds.add(docId);
          break;
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
    minScore: number,
    limit: number,
    offset: number,
    sort?: SortOption
  ): { paginated: Array<{ id: string; score: number; raw: number }>; total: number } {
    const candidates: Array<{ id: string; score: number; raw: number }> = [];

    for (const [id, score] of normScores) {
      if (score < minScore) continue;
      candidates.push({ id, score, raw: rawScores.get(id)! });
    }

    const total = candidates.length;

    if (sort) {
      // When sort is provided, relevance ordering is traded for field ordering
      const docMap = new Map<AnyDocument, { id: string; score: number; raw: number }>();
      const docs: T[] = [];
      for (const c of candidates) {
        const meta = this.docs.get(c.id);
        if (meta) {
          docMap.set(meta.doc, c);
          docs.push(meta.doc as T);
        }
      }
      const sortedDocs = sortDocuments(docs, sort);
      candidates.length = 0;
      for (const doc of sortedDocs) {
        const entry = docMap.get(doc);
        if (entry) candidates.push(entry);
      }
    } else {
      const k = limit + offset;
      if (k > 0 && k < candidates.length) {
        // Bounded min-heap: keep top-k by score
        const heap: Array<{ id: string; score: number; raw: number }> = [];
        function heapCmp(a: typeof candidates[0], b: typeof candidates[0]): number {
          return a.score - b.score || a.id.localeCompare(b.id);
        }
        function heapPush(item: typeof candidates[0]): void {
          heap.push(item);
          let idx = heap.length - 1;
          while (idx > 0) {
            const parent = (idx - 1) >> 1;
            if (heapCmp(heap[idx], heap[parent]) >= 0) break;
            [heap[idx], heap[parent]] = [heap[parent], heap[idx]];
            idx = parent;
          }
        }
        function heapPop(): typeof candidates[0] {
          const top = heap[0];
          const last = heap.pop()!;
          if (heap.length > 0) {
            heap[0] = last;
            let idx = 0;
            const size = heap.length;
            while (true) {
              let smallest = idx;
              const left = (idx << 1) + 1;
              const right = (idx << 1) + 2;
              if (left < size && heapCmp(heap[left], heap[smallest]) < 0) smallest = left;
              if (right < size && heapCmp(heap[right], heap[smallest]) < 0) smallest = right;
              if (smallest === idx) break;
              [heap[idx], heap[smallest]] = [heap[smallest], heap[idx]];
              idx = smallest;
            }
          }
          return top;
        }
        for (const c of candidates) {
          heapPush(c);
          if (heap.length > k) heapPop();
        }
        candidates.length = 0;
        while (heap.length > 0) {
          candidates.push(heapPop());
        }
        candidates.reverse();
      } else {
        candidates.sort((a, b) => b.score - a.score);
      }
    }

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
