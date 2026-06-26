# LiteSearch — Universal Dynamic Search Engine Upgrade Prompt

## Context: What Was Already Built

You are working inside an existing TypeScript npm package called `litesearch`. It is a zero-dependency, in-memory full-text search engine. The following files already exist and compile cleanly:

```
src/
  types/index.ts          — All TypeScript interfaces
  core/
    tokenizer.ts          — English tokenizer with stopword removal
    levenshtein.ts        — Two-row DP fuzzy distance, early-exit
    trie.ts               — Prefix tree for autocomplete
    bm25.ts               — BM25+ relevance scorer
  indexing/
    inverted-index.ts     — term → docId → positions[]
    document-store.ts     — Stores docs + BM25 field-length metadata
  suggest/
    suggestion-engine.ts  — Trie prefix search + fuzzy fallback
  filters/
    filter-engine.ts      — AND/OR/NOT filter DSL evaluator
  search/
    highlighter.ts        — <mark> snippet builder
  engine.ts               — Main LiteSearch<T> class
  index.ts                — Public barrel exports
```

The core algorithms (BM25, Levenshtein, Trie) are correct and fast. The architecture is sound. **Do not rewrite these core algorithms.**

---

## The Problem: Hidden Assumptions That Must Be Fixed

After a thorough audit of every file, the following assumptions are baked in. Each one must be eliminated to make this a truly universal, domain-agnostic search engine.

---

### PROBLEM 1 — Tokenizer is English-Only (`src/core/tokenizer.ts`)

**What is wrong:**

The `SPLIT_RE = /[^a-z0-9']+/g` regex strips all non-ASCII characters, making the tokenizer silently destroy non-English text. A user searching in French, Arabic, Yoruba, Igbo, or any non-Latin script will get zero tokens back and zero results, with no error or warning.

The English stopword list is hardcoded and always-on by default. For a universal package, stopwords are domain-specific. In a medical database, "the" matters less than in a legal contract where "not" and "nor" carry legal weight. Blindly stripping them is wrong.

The `tokenizeWithPrefixes` function is exported but never used internally — it is dead code that confuses consumers.

**What to build:**

1. Replace `SPLIT_RE` with a Unicode-aware split: `/[^\p{L}\p{N}']+/gu` (using the Unicode property escapes `\p{L}` for any letter in any language, `\p{N}` for any digit). This makes the tokenizer work for any human language out of the box.

2. Make stopwords a pluggable, lazy-loaded map keyed by ISO 639-1 language code. Ship English (`en`) built in. Allow users to pass a custom stopword `Set<string>` in config. If `language: "none"` is set, skip all stopword removal.

3. Add a `stemmer` plugin slot: `tokenizer.stemmer?: (token: string, language: string) => string`. Default is identity (no stemming). This allows users to plug in Porter stemmer, Snowball, or any custom logic. Do not bundle a stemmer — zero dependencies must be maintained.

4. Add a `normalizer` plugin slot: `tokenizer.normalizer?: (token: string) => string`. This runs before tokenization. Use case: normalize Arabic diacritics, Vietnamese tone marks, or accented characters before indexing. Default is identity.

5. Remove `tokenizeWithPrefixes` from exports — it is dead code and misleads users.

---

### PROBLEM 2 — `idField` Defaults Silently to `"id"` with No Fallback Strategy (`src/engine.ts`)

**What is wrong:**

```typescript
const id = String(doc[this.config.idField]);
if (!id) throw new Error(`Document missing idField: "${this.config.idField}"`);
```

`String(undefined)` returns the literal string `"undefined"`. Every document missing the ID field gets indexed under the key `"undefined"`, silently overwriting each other. The error only fires when `id` is falsy after `String()`, which means `0` (a valid integer ID), `false`, and `""` also get through to `String()` and cause silent bugs.

**What to build:**

1. Change the ID extraction to: if `doc[idField]` is `null`, `undefined`, or `""` after trimming, throw a descriptive error immediately with the document's keys listed so the user knows what field names are actually available.

2. Support a `idField` as a dot-path string for nested IDs: `"meta._id"` reads `doc.meta._id`. The same `getFieldValue` helper used for field extraction should be reused here.

3. Add an `idResolver` config option: `idResolver?: (doc: AnyDocument) => string`. When provided, this function is called instead of field lookup. This is the escape hatch for MongoDB `_id` ObjectId documents, composite keys, UUID generation, or any custom logic. Example: `idResolver: (doc) => doc._id.toString()`.

---

### PROBLEM 3 — `getFieldValue` Silently Returns `""` for Non-String Types (`src/engine.ts`)

**What is wrong:**

```typescript
if (Array.isArray(val)) return val.join(" ");
if (typeof val === "string") return val;
if (typeof val === "number" || typeof val === "boolean") return String(val);
return "";
```

This silently drops objects, nested arrays, `Date` instances, and `null`. For example, if a user indexes a `User` document where `address` is `{ city: "Lagos", state: "Lagos" }`, the entire address field is silently not indexed. No warning, no error.

**What to build:**

1. Make `getFieldValue` recursive for nested objects. When an array contains objects (e.g., `tags: [{ name: "running" }, { name: "outdoor" }]`), walk each object and concatenate string-valued leaves.

2. For `Date` objects, stringify to ISO format so dates are searchable.

3. Add a `fieldValueExtractor` plugin slot in `FieldConfig`: `extract?: (doc: AnyDocument) => string`. When provided, this completely overrides the built-in extraction logic for that field. Use case: index a computed field that does not exist on the raw document.

4. Log a `console.warn` (not throw) when a configured field produces an empty string for every document in a batch. This surfaces misconfigured field names silently swallowing data.

---

### PROBLEM 4 — BM25 Scorer Rebuilds `docMetas` Map on Every Query (`src/engine.ts` lines ~230–240)

**What is wrong:**

```typescript
new Map(
  [...this.docs.getAll()].map((m) => [m.id, m])
)
```

This line appears inside the search hot path — inside the loop over `targetFields`, inside the loop over `queryTokens`. For a dataset of 10,000 documents and a 3-token query across 4 fields, this allocates and garbage-collects `3 × 4 = 12` new `Map` objects containing 10,000 entries each, on every single search call. At 10,000 documents this costs ~40ms of GC pressure and completely defeats the sub-15ms target.

**What to build:**

1. Move `docMetas` to be a property on `DocumentStore` itself — it is already there. `DocumentStore` has its own `Map<string, DocMeta>` store internally. Expose a `getMetaMap(): ReadonlyMap<string, DocMeta>` method that returns a direct reference to the internal map (no copy).

2. In `BM25Scorer.scoreField`, accept `ReadonlyMap<string, DocMeta>` and use it directly.

3. The `scoreField` call in `engine.ts` becomes: `this.scorer.scoreField(postings, this.docs.getMetaMap(), field, avgLen, N, weight)` — zero allocations per query.

---

### PROBLEM 5 — The Engine Has No `getAll()` / `browse()` / List API

**What is wrong:**

The engine is search-only. There is no way to retrieve all indexed documents, iterate the index, export the current state, or implement a "show all" / "browse by category" view without a query string. Users constantly need this — a product listing page, an admin dashboard, a category browser — and right now they must maintain a second copy of their data alongside the engine just to support these views.

**What to build:**

Add the following methods to the `LiteSearch` class:

1. `getAll(options?: { filter?: FilterClause | FilterGroup; limit?: number; offset?: number; sort?: { field: string; direction: "asc" | "desc" } }): BrowseResult<T>` — returns all documents, optionally filtered and sorted, without any text search scoring.

2. `getById(id: string): T | undefined` — retrieve a single document by ID.

3. `has(id: string): boolean` — check if a document exists.

4. `export(): { documents: AnyDocument[]; config: Partial<LiteSearchConfig> }` — serialize the current index state. Used for persistence (save to disk, Redis, or a DB between server restarts).

5. `static import<T>(data: ReturnType<LiteSearch['export']>, config: LiteSearchConfig<T>): LiteSearch<T>` — restore from exported state. The pair of export/import replaces the need to re-fetch and re-index all data from the database on every server restart.

The `BrowseResult<T>` type should mirror `SearchResult<T>` but without `query`, `highlights`, `matchType`, or `score` fields — those are search-only concepts.

---

### PROBLEM 6 — No Multi-Index / Namespace Support

**What is wrong:**

A real application has multiple data types: Products, Users, Orders, Blog Posts, Help Articles. Right now the consumer must create a separate `new LiteSearch(...)` instance for each. They must manage those instances themselves, route queries to the right instance, and handle cross-collection search entirely on their own.

**What to build:**

Create a new `LiteSearchManager` class (in `src/manager.ts`) that manages multiple named indexes:

```typescript
const manager = new LiteSearchManager();

manager.createIndex("products", { fields: { name: { weight: 3 }, category: { weight: 2 } } });
manager.createIndex("users",    { fields: { name: { weight: 3 }, email: { weight: 1 } } });
manager.createIndex("articles", { fields: { title: { weight: 3 }, body: { weight: 1 } } });

manager.add("products", product);
manager.add("users", user);

// Search a single index
manager.search("products", "running shoes");

// Cross-index search — returns merged, ranked results tagged with their index name
manager.searchAll("john", { indexes: ["users", "articles"] });
```

The `searchAll` method must:
- Run each named index's `search()` call independently
- Tag each hit with `_index: string` (the index name)
- Merge all hits into a single ranked list, re-normalising scores across indexes
- Support per-index weight multipliers: `{ indexes: { products: 1.5, articles: 1.0 } }`
- Return total counts per index alongside the merged result

`LiteSearchManager` must be exported from `src/index.ts`.

---

### PROBLEM 7 — Filter Engine Has No `sort` Support (`src/filters/filter-engine.ts`)

**What is wrong:**

The filter engine can include/exclude documents but cannot order them by a field value. Without sorting, a "browse all products" or "list users by signup date" query always returns results in insertion order (arbitrary). This makes `getAll()` (Problem 5) nearly useless without also adding sort.

**What to build:**

1. Add a `sort` option to `SearchOptions` and to the new `BrowseOptions`:

```typescript
sort?: {
  field: string;     // dot-path supported
  direction: "asc" | "desc";
  type?: "string" | "number" | "date";  // default: auto-detect
}
```

2. Implement sorting in `src/filters/sorter.ts` as a standalone function:

```typescript
export function sortDocuments<T extends AnyDocument>(
  docs: T[],
  sort: SortOption
): T[]
```

3. When `sort` is provided alongside a search query, sort is applied **after** BM25 scoring. This means relevance is computed first (so the most relevant docs are found), then sorted by field value within the result set. Document that this trades off relevance ordering for field ordering, and that users who want pure relevance should omit `sort`.

4. When `sort` is provided with `getAll()` (no query), sort is applied to the entire filtered set before pagination.

---

### PROBLEM 8 — No Facets / Aggregations API

**What is wrong:**

Every real search UI needs faceted navigation: "Filter by category", "Filter by brand", "Filter by price range". Right now the consumer must implement this themselves by iterating all documents and counting field values — which defeats the purpose of having a search engine. This is one of the most-used Elasticsearch features from the YouTube video that was analysed.

**What to build:**

Add `facets` support to `SearchOptions`:

```typescript
facets?: {
  [fieldName: string]: FacetConfig;
}

interface FacetConfig {
  type: "terms" | "range" | "date_histogram";
  // For "terms": count top N unique values
  size?: number;           // default: 10
  // For "range": define buckets
  ranges?: Array<{ label: string; min?: number; max?: number }>;
  // For "date_histogram": bucket by time unit
  interval?: "day" | "week" | "month" | "year";
}
```

Add `facets` to `SearchResult`:

```typescript
facets?: {
  [fieldName: string]: FacetResult;
}

interface FacetResult {
  type: "terms" | "range" | "date_histogram";
  buckets: Array<{
    key: string | number;
    label?: string;
    count: number;        // number of docs in this bucket
    // For range buckets:
    min?: number;
    max?: number;
  }>;
}
```

Implement facet computation in `src/search/facets.ts`. Facets must be computed over the **filtered** result set (i.e., after the filter DSL runs), not over all documents. This gives the user counts that are consistent with what the search found.

---

### PROBLEM 9 — No Persistence / Serialization

**What is wrong:**

Every server restart requires re-fetching and re-indexing all data from the database. For 100,000 documents this can take 5–30 seconds, during which the search engine returns zero results. For a production npm package, this is unacceptable.

**What to build:**

Create `src/persistence/serializer.ts` with:

```typescript
interface SerializedIndex {
  version: number;          // schema version for forward-compat
  createdAt: string;        // ISO timestamp
  config: SerializableConfig;
  documents: AnyDocument[]; // all raw documents
  // Do NOT serialize the inverted index — rebuild it from documents on import.
  // The index is deterministic given the documents + config, so serializing
  // the index separately is wasted space and introduces drift bugs.
}

export function serialize(engine: LiteSearch<AnyDocument>): string   // returns JSON
export function deserialize<T>(json: string, config: LiteSearchConfig<T>): LiteSearch<T>
```

The `deserialize` function rebuilds the full index from the serialized documents using `addMany`. This is safe because the inverted index is fully deterministic given the same documents and config.

Also add optional file-based persistence helpers for Node.js environments:

```typescript
// src/persistence/file-store.ts
export async function saveToFile(engine: LiteSearch, filePath: string): Promise<void>
export async function loadFromFile<T>(filePath: string, config: LiteSearchConfig<T>): Promise<LiteSearch<T>>
```

These use Node.js `fs/promises` and must be conditionally imported so the package still works in browser environments (Vite, Webpack) without errors.

---

### PROBLEM 10 — Import Paths Have Stale `.js` Extensions in Some Files

**What is wrong:**

`inverted-index.ts` and `suggestion-engine.ts` still have `.js` extensions on their import paths (e.g. `from "../types/index.js"`). The project uses CommonJS `moduleResolution: "node"` in `tsconfig.json`, where `.js` extensions on TypeScript source imports are wrong — they should be bare paths. This inconsistency compiles today but will cause resolution errors if the project is ever migrated to ESM or `moduleResolution: "node16"`.

**What to build:**

Scan all `src/**/*.ts` files. Replace every `from "…/something.js"` with `from "…/something"`. This is a pure cleanup — no logic changes.

---

## What NOT to Change

- Do not change the BM25 algorithm in `src/core/bm25.ts`
- Do not change the Levenshtein algorithm in `src/core/levenshtein.ts`
- Do not change the Trie data structure in `src/core/trie.ts`
- Do not change the Filter DSL evaluator logic in `src/filters/filter-engine.ts` (only add sort)
- Do not change the Highlighter in `src/search/highlighter.ts`
- Do not add any npm dependencies — this must remain zero-dependency
- Do not break the existing public API surface — all changes must be additive or internally backwards-compatible

---

## Required Output

For each of the 10 problems above, produce:

1. The full updated/new TypeScript file(s) with complete implementation — no placeholders, no `// TODO`, no `...rest of implementation`
2. Updated type definitions in `src/types/index.ts` for any new types introduced
3. Updated `src/index.ts` barrel exports for any new public symbols
4. A concise inline comment above every non-obvious decision explaining **why**, not just **what**

After all 10 fixes are implemented, produce:

5. An updated `README.md` section titled **"Universal Usage"** with 5 concrete examples using completely different domain data (not products):
   - A **user directory** (search by name, email, department)
   - A **legal case database** (search by case number, summary, jurisdiction)
   - A **recipe collection** (search by ingredient, cuisine, preparation time)
   - A **job board** (search by title, skills, location, salary range)
   - A **multi-index manager** combining users + articles + products in one `searchAll` call

6. A performance benchmark file `src/benchmarks/bench.ts` that:
   - Generates synthetic data for 3 domain types (products, users, articles) using random data — no hardcoded samples
   - Indexes 10,000, 50,000, and 100,000 documents for each domain
   - Measures and logs: index time, search time (p50/p95/p99 over 1,000 queries), suggest time, `getAll` time, export/import round-trip time
   - Confirms p99 search latency is < 50ms at 50,000 documents

---

## Success Criteria

When all 10 problems are fixed, the following must be true:

1. `npx tsc --noEmit` exits with zero errors and zero warnings
2. A document shaped as `{ _id: ObjectId, nom: "Kofi", adresse: { ville: "Accra" } }` can be indexed by passing `idResolver: doc => doc._id.toString()` and `fields: { nom: { weight: 3 }, "adresse.ville": { weight: 1 } }` with no code changes to the engine
3. Searching for `"Kof"` finds `"Kofi"` via prefix match
4. Searching for `"Kophy"` finds `"Kofi"` via fuzzy match (distance 2)
5. A `LiteSearchManager` with 3 named indexes can execute `searchAll("query")` and return merged ranked results tagged with their source index
6. An index of 10,000 documents can be exported to JSON, cleared, re-imported, and return identical search results in under 300ms total
7. Facets work: a search for `""` (empty, browse mode via `getAll`) with `facets: { department: { type: "terms", size: 5 } }` returns the top 5 departments and their document counts
8. The package has zero npm dependencies in `package.json` `dependencies` (devDependencies for TypeScript is fine)
