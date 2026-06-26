# litesearch-engine

**Zero-dependency, blazing-fast, in-memory full-text search engine for Node.js and TypeScript — 100% dynamic, domain-agnostic.**

Built to replace Elasticsearch for datasets of up to ~50,000 documents where you need speed, simplicity, and full control — no Docker, no JVM, no DevOps. Search completes in **< 15ms** for 10,000 documents.

**Any data shape, any use case.** Products, blog posts, user profiles, support tickets, log entries, code snippets, recipes, messages — if it's a JSON object with string fields, litesearch indexes and searches it. No schema, no setup, no domain lock-in.

```
npm install litesearch-engine
```

---

## Features

| Feature | Details |
|---|---|---|
| **100% dynamic schema** | Works with any document shape — products, posts, users, tickets, logs, anything |
| **Full-text search** | BM25+ scoring (the same algorithm powering Elasticsearch/Lucene) |
| **Fuzzy / typo tolerance** | Levenshtein distance with adaptive thresholds and early-exit optimisation |
| **Partial matching** | Any prefix of any word matches instantly |
| **Autocomplete suggestions** | Trie prefix tree, < 1ms per query |
| **Nested filters** | AND / OR / NOT with 10 operators |
| **Highlighted snippets** | `<mark>` tags with match context window |
| **Live index updates** | add / update / remove in real time, no re-index needed |
| **Domain-agnostic** | No schemas, no models, no setup — index anything |
| **TypeScript-first** | Full generics, every input/output typed |
| **Zero dependencies** | Pure TypeScript, 0 npm dependencies |

---

## Quick Start

```typescript
import { LiteSearch } from "litesearch-engine";

// 1. Define your document type — any shape works
interface BlogPost {
  id: string;
  title: string;
  body: string;
  tags: string[];
  author: string;
}

// 2. Create the engine — no schema, just point at fields
const engine = new LiteSearch<BlogPost>({
  idField: "id",
  fields: {
    title:  { weight: 3, suggest: true },
    body:   { weight: 1 },
    tags:   { weight: 1.5 },
    author: { weight: 2, suggest: true },
  },
});

// 3. Index your data
engine.addMany(posts);

// 4. Search — BM25 scoring, fuzzy matching, all automatic
const result = engine.search("typescript performance");
console.log(result.hits[0].document.title); // best match
console.log(result.took);                    // → 2 (ms)
```

---

## Table of Contents

1. [Installation](#installation)
2. [Configuration](#configuration)
3. [Indexing Documents](#indexing-documents)
4. [Searching](#searching)
5. [Filters](#filters)
6. [Autocomplete / Suggestions](#autocomplete--suggestions)
7. [Highlights](#highlights)
8. [Live Index Updates](#live-index-updates)
9. [Pagination](#pagination)
10. [Stats](#stats)
11. [Advanced: Custom Tokenizer](#advanced-custom-tokenizer)
12. [Advanced: Custom Scoring](#advanced-custom-scoring)
13. [Output Format Reference](#output-format-reference)
14. [Performance Guide](#performance-guide)
15. [Architecture Deep Dive](#architecture-deep-dive)

---

## Installation

```bash
npm install litesearch-engine
# or
yarn add litesearch-engine
# or
pnpm add litesearch-engine
```

**Requirements:** Node.js 16+, TypeScript 4.7+ (if using TypeScript).

---

## Configuration

```typescript
const engine = new LiteSearch<YourDoc>({
  // ── Required ──────────────────────────────────────────────────────────────

  /**
   * The field on your document that uniquely identifies it.
   * Default: "id"
   */
  idField: "id",

  /**
   * Fields to index. Pass as an array (all default config) or an object
   * (per-field control).
   *
   * Short form:
   */
  fields: ["name", "description", "category"],

  // Or long form with per-field config:
  fields: {
    name:        { weight: 3,   suggest: true  },
    description: { weight: 1,   suggest: false },
    category:    { weight: 2,   suggest: true  },
    brand:       { weight: 2.5, suggest: true  },
    tags:        { weight: 1.5, suggest: false },
  },

  // ── Optional ──────────────────────────────────────────────────────────────

  fuzzy: {
    enabled:     true,  // Toggle fuzzy globally
    maxDistance: 2,     // Max Levenshtein edit distance (1 or 2 recommended)
    minLength:   4,     // Minimum query word length before fuzzy activates
  },

  scoring: {
    k1: 1.2,  // BM25 term frequency saturation (1.2 = standard)
    b:  0.75, // BM25 field length normalisation (0.75 = standard)
  },

  suggest: {
    maxResults:    10,   // Max autocomplete suggestions returned
    caseSensitive: false,
  },

  tokenizer: {
    language: "en",  // "en" strips English stopwords, "none" keeps all tokens
  },
});
```

### Field Config Options

| Option | Type | Default | Description |
|---|---|---|---|
| `weight` | `number` | `1.0` | Score multiplier. Name matches should outweigh description matches. |
| `suggest` | `boolean` | `true` | Whether this field feeds the autocomplete trie. |
| `fuzzy` | `boolean` | `true` | Whether fuzzy matching applies to this field. |
| `path` | `string` | field name | Dot-path for nested objects: `"meta.brand"` reads `doc.meta.brand`. |

---

## Indexing Documents

### Single document

```typescript
engine.add({
  id: "prod_001",
  name: "Nike Air Max 270",
  description: "Lightweight running shoe for men",
  category: "Footwear",
  brand: "Nike",
  price: 45000,
});
```

### Batch (recommended for large datasets)

```typescript
// Internally still calls add() per document, but in a tight loop.
// For 10,000 docs this typically takes 100–300ms.
engine.addMany(products);
```

### Nested document fields

Works automatically via the `path` field config:

```typescript
const engine = new LiteSearch({
  fields: {
    title:       { weight: 3 },
    "meta.brand": { weight: 2, path: "meta.brand" }, // reads doc.meta.brand
  },
});

engine.add({
  id: "1",
  title: "Ankara Dress",
  meta: { brand: "Adire Collective", tags: ["fashion"] },
});
```

### Array fields

Arrays are automatically joined with spaces before tokenizing:

```typescript
engine.add({
  id: "1",
  tags: ["running", "outdoor", "men"], // indexed as "running outdoor men"
});
```

---

## Searching

```typescript
const result = engine.search("running shoes nike", {
  limit:      10,       // Results per page. Default: 10
  offset:     0,        // Pagination offset. Default: 0
  highlight:  true,     // Return <mark> snippets. Default: true
  minScore:   0.1,      // Drop results below this normalised score (0–1)
  boostExact: true,     // Boost exact phrase matches to top. Default: true
  fields:     ["name", "brand"], // Search only these fields (subset)
  filter: {             // Optional filter (see Filters section)
    AND: [
      { field: "category", operator: "eq", value: "Footwear" },
      { field: "price", operator: "lte", value: 60000 },
    ]
  },
});
```

### Result shape

```typescript
{
  hits: [
    {
      document:  { id: "1", name: "Nike Air Max 270", ... }, // original doc
      score:     0.97,       // normalised relevance (0–1)
      rawScore:  4.82,       // raw BM25 score
      matchType: "exact",    // "exact" | "prefix" | "fuzzy"
      highlights: [
        {
          field:         "name",
          snippet:       "…<mark>Nike</mark> <mark>Air</mark> Max 270…",
          matchedTokens: ["nike", "air"],
        },
        {
          field:         "description",
          snippet:       "Lightweight <mark>running</mark> <mark>shoes</mark> for men",
          matchedTokens: ["running", "shoes"],
        }
      ]
    },
    // ...more hits
  ],
  total:      47,       // total matching docs (before pagination)
  took:       3,        // milliseconds
  query:      "running shoes nike",
  pagination: {
    limit:   10,
    offset:  0,
    hasMore: true,
  }
}
```

---

## Filters

Filters can be simple clauses or deeply nested AND/OR/NOT groups.

### Simple clause

```typescript
engine.search("phone", {
  filter: { field: "category", operator: "eq", value: "Electronics" }
});
```

### Available operators

| Operator | Description | Example value |
|---|---|---|
| `eq` | Equals | `"Electronics"` |
| `neq` | Not equals | `"Draft"` |
| `gt` | Greater than | `50000` |
| `gte` | Greater than or equal | `50000` |
| `lt` | Less than | `100000` |
| `lte` | Less than or equal | `100000` |
| `range` | Between (inclusive) | `[10000, 50000]` |
| `in` | Value is in list | `["Nike", "Adidas"]` |
| `nin` | Value is NOT in list | `["Draft", "Archived"]` |
| `contains` | String contains (case-insensitive) | `"max"` |
| `startsWith` | String starts with (case-insensitive) | `"Nike"` |
| `exists` | Field is not null/undefined | _(no value needed, pass `true`)_ |

### Compound filters

```typescript
// Products in Electronics, priced ₦100k–₦500k, not out-of-stock
engine.search("laptop", {
  filter: {
    AND: [
      { field: "category",  operator: "eq",    value: "Electronics" },
      { field: "price",     operator: "range", value: [100000, 500000] },
      { field: "inStock",   operator: "eq",    value: true },
    ]
  }
});
```

```typescript
// Either Nike or Adidas, under ₦50k
engine.search("shoes", {
  filter: {
    AND: [
      {
        OR: [
          { field: "brand", operator: "eq", value: "Nike" },
          { field: "brand", operator: "eq", value: "Adidas" },
        ]
      },
      { field: "price", operator: "lt", value: 50000 },
    ]
  }
});
```

```typescript
// Anything BUT the "Food" category
engine.search("noodles", {
  filter: {
    NOT: { field: "category", operator: "eq", value: "Food" }
  }
});
```

### Nested field filters

Use dot-path notation — works the same as field indexing:

```typescript
{ field: "meta.brand", operator: "eq", value: "Nike" }
```

---

## Autocomplete / Suggestions

```typescript
const result = engine.suggest("nikee"); // typo
// {
//   suggestions: [
//     { text: "nike",    documentIds: ["1","9"], frequency: 2, matchType: "fuzzy",  distance: 1 },
//     { text: "nikelab", documentIds: ["3"],     frequency: 1, matchType: "fuzzy",  distance: 2 },
//   ],
//   took: 1,
//   query: "nikee"
// }

// Perfect prefix match
engine.suggest("run");
// → ["running", "runway", ...] matched by trie prefix in < 1ms
```

### How it works

1. **Trie prefix lookup** — O(prefix length), always checked first.
2. **Fuzzy fallback** — Only if prefix returns < 3 results. Scans all trie words with Levenshtein distance ≤ adaptive threshold.
3. **Ranking** — `exact > prefix > fuzzy`, then by frequency (how many docs contain the term).

### Suggestion result shape

```typescript
{
  text:        "running",
  documentIds: ["1", "2", "15"], // which docs contain this word
  frequency:   3,                // how many times indexed
  matchType:   "prefix",         // "exact" | "prefix" | "fuzzy"
  distance:    0,                // Levenshtein distance from query
}
```

---

## Highlights

Highlights are returned by default on every search. Disable them for performance-critical paths where you don't need them:

```typescript
engine.search("nike shoes", { highlight: false });
```

The snippet:
- Finds the position of the first match in the field value
- Returns a ±30 character context window (max 160 chars)
- Wraps matched tokens in `<mark>…</mark>`
- Adds `…` ellipsis when the value is truncated

```typescript
// Input:  "Lightweight running shoes designed for men with narrow feet"
// Query:  "running shoes"
// Output: "Lightweight <mark>running</mark> <mark>shoes</mark> designed for men…"
```

You can render highlights directly in HTML, or strip the `<mark>` tags for plain text:

```typescript
const plain = hit.highlights[0].snippet.replace(/<\/?mark>/g, "");
// → "Lightweight running shoes designed for men…"
```

---

## Live Index Updates

The index updates instantly — no rebuild required.

```typescript
// Add a new document → immediately searchable
engine.add({ id: "99", name: "New Arrival", ... });

// Update an existing document (same ID = upsert)
engine.update({ id: "99", name: "New Arrival - Updated", ... });

// Remove a document
engine.remove("99");

// Wipe the entire index
engine.clear();
```

### Integrating with your database

```typescript
// With Mongoose / MongoDB
Product.watch().on("change", (change) => {
  if (change.operationType === "insert")  engine.add(change.fullDocument);
  if (change.operationType === "update")  engine.update(change.fullDocument);
  if (change.operationType === "delete")  engine.remove(change.documentKey._id.toString());
});

// With Prisma / PostgreSQL
// After any product save:
await prisma.product.update({ ... });
engine.update(updatedProduct);

// After delete:
await prisma.product.delete({ where: { id } });
engine.remove(id);
```

### Seeding on startup

```typescript
// server.ts
const products = await Product.find({}).lean(); // or prisma.product.findMany()
engine.addMany(products);
console.log(`Search index ready: ${engine.stats().documentCount} documents`);
```

---

## Pagination

```typescript
// Page 1
const page1 = engine.search("phone", { limit: 10, offset: 0 });

// Page 2
const page2 = engine.search("phone", { limit: 10, offset: 10 });

// Check if more pages exist
if (page1.pagination.hasMore) {
  // fetch next page
}

// Total results (for "Showing X of Y results")
console.log(`Showing ${page1.hits.length} of ${page1.total} results`);
```

---

## Stats

```typescript
const stats = engine.stats();
// {
//   documentCount:       10000,
//   termCount:           84320,  // unique indexed terms
//   trieNodeCount:       62100,  // autocomplete trie size
//   fields:              ["name", "description", "category", "brand"],
//   memoryEstimateBytes: 15728640, // ~15MB for 10k products
//   lastUpdated:         2024-01-15T10:30:00.000Z,
// }
```

---

## Advanced: Custom Tokenizer

The default tokenizer: lowercases, splits on non-alphanumeric characters, strips English stopwords (a, the, and, etc.), and drops tokens < 2 characters.

Override it completely:

```typescript
const engine = new LiteSearch({
  tokenizer: {
    tokenize: (text: string): string[] => {
      // Your own logic — split on hyphens too, for example
      return text
        .toLowerCase()
        .split(/[\s\-_,\.]+/)
        .filter(t => t.length >= 2);
    }
  }
});
```

Or just change the language setting to keep all tokens (no stopword removal):

```typescript
tokenizer: { language: "none" }
```

---

## Advanced: Custom Scoring

Tune BM25 parameters:

| Parameter | Effect | When to change |
|---|---|---|
| `k1 = 1.2` (default) | Controls term-frequency saturation. Higher = longer documents score higher. | Increase for long descriptions, decrease for short product names. |
| `b = 0.75` (default) | Field-length normalisation. `b=1` fully normalises, `b=0` ignores length. | Decrease if your products have wildly different description lengths. |

```typescript
// Tuned for short product names (less length normalisation)
scoring: { k1: 1.5, b: 0.3 }

// Tuned for long blog posts
scoring: { k1: 1.2, b: 0.9 }
```

---

## Output Format Reference

### `SearchResult<T>`

```typescript
interface SearchResult<T> {
  hits:       SearchHit<T>[];
  total:      number;          // total matches (pre-pagination)
  took:       number;          // ms
  query:      string;
  pagination: {
    limit:   number;
    offset:  number;
    hasMore: boolean;
  };
}
```

### `SearchHit<T>`

```typescript
interface SearchHit<T> {
  document:   T;               // your original document, untouched
  score:      number;          // 0–1 normalised relevance
  rawScore:   number;          // raw BM25 score (for debugging)
  matchType:  "exact" | "prefix" | "fuzzy";
  highlights?: HighlightResult[];
}
```

### `HighlightResult`

```typescript
interface HighlightResult {
  field:         string;     // which field matched
  snippet:       string;     // context window with <mark> tags
  matchedTokens: string[];   // which tokens matched
}
```

### `SuggestResult`

```typescript
interface SuggestResult {
  suggestions: SuggestionHit[];
  took:        number;
  query:       string;
}

interface SuggestionHit {
  text:        string;     // the suggested word
  documentIds: string[];   // which docs contain it
  frequency:   number;     // how many docs (for ranking)
  matchType:   "exact" | "prefix" | "fuzzy";
  distance:    number;     // Levenshtein distance from query
}
```

---

## Performance Guide

### Expected benchmarks

| Documents | Index time | Search (no filter) | Search (with filter) | Suggest |
|---|---|---|---|---|
| 1,000 | ~10ms | < 2ms | < 3ms | < 1ms |
| 10,000 | ~80ms | < 10ms | < 15ms | < 2ms |
| 50,000 | ~400ms | < 50ms | < 80ms | < 10ms |

### Tips

**1. Only index what you search.** Avoid indexing fields you never query. Every extra field increases index time and memory.

```typescript
// ❌ Don't do this
fields: ["id", "createdAt", "updatedAt", "internalNotes", "name"]

// ✅ Only searchable fields
fields: { name: { weight: 3 }, description: { weight: 1 } }
```

**2. Disable suggest on heavy fields.** The trie only needs to index fields your autocomplete uses.

```typescript
fields: {
  name:        { suggest: true  }, // ✅ autocomplete from names
  description: { suggest: false }, // ❌ skip — too many tokens
}
```

**3. Disable highlighting on search-as-you-type routes.** You don't need highlights on every keystroke.

```typescript
// On keypress
engine.suggest(query); // use suggest(), not search()

// On submit / full search
engine.search(query, { highlight: true });
```

**4. Use `minScore` to cut noise.**

```typescript
engine.search("laptop bag", { minScore: 0.2 }); // drop weak matches
```

**5. Pre-filter with filters, not post-filter.** Filters in litesearch are applied after BM25 scoring but before result assembly. For range/category filters on large datasets, consider structuring your index to use pre-filtered collections if you're approaching 50k+ documents.

**6. Seed index at server startup.** Don't re-create the engine per request. Create it once and keep it in module scope.

```typescript
// search.service.ts — module-level singleton
import { LiteSearch } from "litesearch-engine";
export const searchEngine = new LiteSearch({ ... });
```

---

## Architecture Deep Dive

For contributors and advanced users.

### Inverted Index

The core of the engine. Structure:

```
field → term → Map<docId, positions[]>

Example:
"name" → {
  "nike":    { "doc1": [0], "doc9": [0] },
  "air":     { "doc1": [1] },
  "max":     { "doc1": [2] },
  "running": { "doc1": [0], "doc2": [0], "doc15": [3] },
}
```

Each token stores its **positions** (not just presence). Positions enable future phrase-proximity scoring and exact phrase detection.

### BM25+ Scoring

For each query term across each field:

```
score(term, doc, field) =
  IDF(term) × TF_norm(term, doc, field) × field_weight

IDF(term) = log((N - df + 0.5) / (df + 0.5) + 1)
  N  = total documents
  df = documents containing this term

TF_norm = (tf × (k1 + 1)) / (tf + k1 × (1 - b + b × (fieldLen / avgFieldLen)))
  tf       = how many times term appears in this doc's field
  fieldLen = token count of this field in this doc
  avgFieldLen = average across all docs
```

Final doc score = sum of all term+field scores → normalised to [0, 1].

### Levenshtein (Fuzzy)

Uses a two-row dynamic programming table (O(m×n) time, O(n) space) with:
- **Early exit** when the minimum possible distance in a row exceeds `maxDistance`
- **Length pre-filter** — skips terms where `|len_a - len_b| > maxDistance` without running DP
- **Adaptive threshold** — terms < 4 chars require exact match; 4–6 chars allow distance 1; 7+ allow distance 2

### Trie (Autocomplete)

A character-level prefix tree where each node stores:
- `children: Map<char, TrieNode>`
- `docIds: Set<string>` — all docs reachable from this prefix
- `frequency: number` — for ranking

Prefix lookup is O(prefix length). After reaching the prefix node, a DFS collects all descendant words, sorted by frequency.

### Query Pipeline

```
query string
    ↓ tokenize (lowercase, split, strip stopwords)
    ↓ per-token lookup: exact → prefix → fuzzy
    ↓ BM25 score accumulation per field
    ↓ exact phrase boost (if multi-token)
    ↓ normalise scores to [0, 1]
    ↓ filter (AND/OR/NOT evaluation)
    ↓ sort DESC by score
    ↓ paginate
    ↓ build highlights
    ↓ SearchResult
```

---

## License

MIT
