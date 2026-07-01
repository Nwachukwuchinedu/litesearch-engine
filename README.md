# litesearch-engine

**Zero-dependency, blazing-fast, in-memory full-text search engine for Node.js and TypeScript — 100% dynamic, domain-agnostic.**

Built to replace Elasticsearch for datasets of up to ~50,000 documents where you need speed, simplicity, and full control — no Docker, no JVM, no DevOps. Search completes in **< 3ms** for 10,000 documents.

**Any data shape, any use case.** Products, blog posts, user profiles, support tickets, log entries, code snippets, recipes, messages — if it's a JSON object with string fields, litesearch indexes and searches it. No schema, no setup, no domain lock-in.

```
npm install litesearch-engine
```

---

## Features

| Feature | Details |
|---|---|
| **100% dynamic schema** | Works with any document shape — products, posts, users, tickets, logs, anything |
| **Full-text search** | BM25+ scoring (the same algorithm powering Elasticsearch/Lucene) |
| **Fuzzy / typo tolerance** | BK-tree index — O(log n) Levenshtein matching with adaptive thresholds |
| **Partial matching** | PrefixTrie structure — O(k) prefix lookups, instant at any scale |
| **Autocomplete suggestions** | Trie prefix tree, < 1ms per query |
| **Nested filters** | AND / OR / NOT with 10 operators |
| **Highlighted snippets** | `<mark>` tags with match context window |
| **Live index updates** | add / update / remove in real time, no re-index needed |
| **Domain-agnostic** | No schemas, no models, no setup — index anything |
| **TypeScript-first** | Full generics, every input/output typed |
| **Zero dependencies** | Pure TypeScript, 0 npm dependencies |
| **Browse & list** | browse(), getById(), has() — no query string needed |
| **Sort** | Sort by any field (string, number, date), in search or browse |
| **Facets / aggregations** | terms, range, date_histogram — computed over filtered sets |
| **Multi-index manager** | LiteSearchManager with cross-index searchAll, weighted merging |
| **Export / Import** | serialize/deserialize + optional file persistence |
| **Batch indexing** | addMany() with batched tokenization for large datasets |
| **LRU query cache** | Configurable TTL and max entries, automatic cache invalidation on updates |
| **Configurable document retention** | storeDocuments: false retains only IDs, saving memory |
| **Input size limits** | Configurable caps on query length, tokens, document size, field values |

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
2. [Universal Usage](#universal-usage)
3. [Configuration](#configuration)
4. [Indexing Documents](#indexing-documents)
5. [Searching](#searching)
6. [Filters](#filters)
7. [Autocomplete / Suggestions](#autocomplete--suggestions)
8. [Highlights](#highlights)
9. [Live Index Updates](#live-index-updates)
10. [Pagination](#pagination)
11. [Stats](#stats)
12. [Advanced: Custom Tokenizer](#advanced-custom-tokenizer)
13. [Advanced: Custom Scoring](#advanced-custom-scoring)
14. [Output Format Reference](#output-format-reference)
15. [Performance Guide](#performance-guide)
16. [Architecture Deep Dive](#architecture-deep-dive)

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

## Universal Usage

litesearch-engine ingests **any JSON document shape** — no schema, no setup, no config beyond pointing at which fields to index. Every feature below works with any domain: products, users, blog posts, legal cases, recipes, support tickets, logs, you name it.

### 1. User Directory

```typescript
import { LiteSearch } from "litesearch-engine";

interface User {
  id: string;
  name: string;
  email: string;
  department: string;
  bio: string;
}

const users = new LiteSearch<User>({
  idField: "id",
  fields: {
    name:       { weight: 3, suggest: true },
    email:      { weight: 2 },
    department: { weight: 1, suggest: true },
    bio:        { weight: 1 },
  },
});

users.addMany([
  { id: "1", name: "Chiamaka Obi",   email: "chiamaka@example.com", department: "Engineering", bio: "Full-stack developer" },
  { id: "2", name: "Kofi Mensah",    email: "kofi@example.com",     department: "Design",      bio: "UX designer" },
  { id: "3", name: "Aisha Bello",    email: "aisha@example.com",    department: "Marketing",   bio: "Content strategist" },
]);

// Full-text search — BM25 scoring, fuzzy, prefix, all automatic
const r = users.search("chiamaka dev");
console.log(r.hits[0].document.name); // "Chiamaka Obi"

// Autocomplete — trie prefix lookup < 1ms
const s = users.suggest("chi");
console.log(s.suggestions[0].text); // "chiamaka"

// Browse all — with filter + sort
const engineering = users.browse({
  filter: { field: "department", operator: "eq", value: "Engineering" },
  sort:   { field: "name", direction: "asc" },
});

// Faceted navigation — department counts
const faceted = users.search("", {
  facets: { department: { type: "terms", size: 5 } },
});
console.log(faceted.facets!.department.buckets);
// → [{ key: "Engineering", count: 1 }, { key: "Design", count: 1 }, ...]
```

### 2. Legal Case Database

```typescript
interface LegalCase {
  caseNumber: string;
  title: string;
  summary: string;
  jurisdiction: string;
  year: number;
}

const cases = new LiteSearch<LegalCase>({
  idField: "caseNumber",         // custom idField
  fields: {
    title:        { weight: 3, suggest: true },
    summary:      { weight: 2 },
    jurisdiction: { weight: 1 },
  },
});

cases.addMany([
  { caseNumber: "SC/1/2024", title: "Maga v. INEC",      summary: "Electoral dispute",        jurisdiction: "Supreme Court", year: 2024 },
  { caseNumber: "CA/45/2023", title: "Bello v. State",    summary: "Criminal appeal",           jurisdiction: "Court of Appeal", year: 2023 },
  { caseNumber: "HC/12/2022", title: "Okafor v. UBA Plc", summary: "Banking and contract law",  jurisdiction: "High Court", year: 2022 },
]);

// Fuzzy finds typos — "electral" matches "Electoral"
const result = cases.search("electral dispuite", { fuzzy: { enabled: true } });

// Filter by jurisdiction + year range
result = cases.search("appeal", {
  filter: {
    AND: [
      { field: "jurisdiction", operator: "eq", value: "Court of Appeal" },
      { field: "year", operator: "gte", value: 2020 },
    ],
  },
});

// Exact ID lookup
const c = cases.getById("SC/1/2024");

// Existence check
if (cases.has("HC/12/2022")) { /* ... */ }
```

### 3. Recipe Collection

```typescript
interface Recipe {
  id: string;
  name: string;
  ingredients: string[];
  cuisine: string;
  prepTime: number; // minutes
  instructions: string;
}

// Array fields are auto-joined: ingredients: ["rice", "beans"] → "rice beans"
const recipes = new LiteSearch<Recipe>({
  fields: {
    name:         { weight: 3, suggest: true },
    ingredients:  { weight: 2 },
    cuisine:      { weight: 1, suggest: true },
    instructions: { weight: 1 },
  },
});

recipes.addMany([
  { id: "1", name: "Jollof Rice",      ingredients: ["rice", "tomatoes", "pepper", "onions"], cuisine: "West African", prepTime: 60, instructions: "..." },
  { id: "2", name: "Egusi Soup",       ingredients: ["egusi", "pumpkin leaves", "palm oil"],   cuisine: "Nigerian",    prepTime: 90, instructions: "..." },
  { id: "3", name: "Yam Porridge",     ingredients: ["yam", "palm oil", "fish"],               cuisine: "Nigerian",    prepTime: 45, instructions: "..." },
  { id: "4", name: "Pad Thai",         ingredients: ["rice noodles", "shrimp", "peanuts"],     cuisine: "Thai",        prepTime: 30, instructions: "..." },
]);

// Search by ingredient — "rice" finds Jollof Rice, Yam Porridge, Pad Thai
const riceDishes = recipes.search("rice");

// Sort by prep time (ascending)
const quickMeals = recipes.search("", { sort: { field: "prepTime", direction: "asc", type: "number" } });

// Facet by cuisine
const byCuisine = recipes.search("", {
  facets: { cuisine: { type: "terms", size: 10 } },
});

// Browse with pagination (20 per page)
const page2 = recipes.browse({ limit: 20, offset: 20 });
```

### 4. Job Board

```typescript
interface Job {
  _id: string;
  title: string;
  skills: string[];
  location: string;
  salaryMin: number;
  salaryMax: number;
}

// Use idResolver for non-standard IDs — here _id is already a string
const jobs = new LiteSearch<Job>({
  idField: "_id",     // direct mapping
  fields: {
    title:    { weight: 3, suggest: true },
    skills:   { weight: 2 },
    location: { weight: 1, suggest: true },
  },
  tokenizer: {
    language: "none",  // keep all tokens — "React" and "react" both exist
    normalizer: (t) => t.toLowerCase(),  // case-insensitive searching
  },
});

jobs.addMany([
  { _id: "1", title: "Senior React Engineer", skills: ["React", "TypeScript", "Node.js"], location: "Lagos", salaryMin: 8000000, salaryMax: 15000000 },
  { _id: "2", title: "UX Designer",           skills: ["Figma", "User Research"],          location: "Remote", salaryMin: 5000000, salaryMax: 10000000 },
  { _id: "3", title: "DevOps Lead",           skills: ["AWS", "Kubernetes", "Terraform"],  location: "Nairobi", salaryMin: 12000000, salaryMax: 20000000 },
]);

// Range filter on salary
const seniorRoles = jobs.search("senior", {
  filter: {
    AND: [
      { field: "salaryMin", operator: "gte", value: 5000000 },
      { field: "salaryMax", operator: "lte", value: 15000000 },
    ],
  },
  sort: { field: "salaryMin", direction: "desc", type: "number" },
});
```

### 5. Multi-Index Manager — Cross-Search Users, Articles & Products

```typescript
import { LiteSearch, LiteSearchManager } from "litesearch-engine";

const manager = new LiteSearchManager();

manager.createIndex("users", {
  fields: { name: { weight: 3, suggest: true }, bio: { weight: 1 } },
});
manager.createIndex("articles", {
  fields: { title: { weight: 3, suggest: true }, body: { weight: 1 } },
});
manager.createIndex("products", {
  fields: { name: { weight: 3, suggest: true }, description: { weight: 1 } },
});

manager.add("users",    { id: "1", name: "Kofi Mensah", bio: "UX designer" });
manager.add("articles", { id: "1", title: "Design Systems", body: "How to build scalable design systems" });
manager.add("products", { id: "1", name: "Wireframe Kit", description: "UI wireframe components for Figma" });

// Single-index search
const userResult = manager.search("users", "kofi");

// Cross-index search — merged, ranked, tagged
const all = manager.searchAll("design", {
  indexes: { users: 1.0, articles: 1.5, products: 1.0 }, // per-index weight
  limit: 20,
});

console.log(all.hits[0].document._index); // "articles" (highest weight × matched)
console.log(all.perIndex);
// → { users: { total: 1, took: 2 }, articles: { total: 1, took: 3 }, products: { total: 1, took: 2 } }
```

### Nested Documents & Custom ID Resolver

Documents with nested objects work via dot-path fields. MongoDB-style `_id` ObjectIds work via `idResolver`:

```typescript
// A document with nested address and an ObjectId-style _id
interface Customer {
  _id: { toString: () => string };
  name: string;
  address: { city: string; state: string };
  tags: Array<{ name: string }>;
}

const customers = new LiteSearch<Customer>({
  idField: "_id",                                       // dot-path NOT needed for top-level
  idResolver: (doc) => (doc as any)._id.toString(),      // extract string from ObjectId
  fields: {
    name:          { weight: 3, suggest: true },
    "address.city":  { weight: 2, path: "address.city" },  // dot-path to nested value
    "address.state": { weight: 1, path: "address.state" },
    tags:          { weight: 2 },                           // arrays of objects are auto-flattened
  },
});

customers.add({
  _id: { toString: () => "cust_001" },
  name: "Amara Okafor",
  address: { city: "Lagos", state: "Lagos" },
  tags: [{ name: "vip" }, { name: "wholesale" }],
});

// All of these find the document:
customers.search("amara");
customers.search("lagos");     // matches address.city + address.state
customers.search("vip");       // matches flattened tags array
customers.getById("cust_001"); // ✓ works because idResolver maps _id → string
```

### Custom Field Extraction

Use `FieldConfig.extract` to index computed values that don't exist on the raw document:

```typescript
const engine = new LiteSearch({
  fields: {
    "fullName": { weight: 3, extract: (doc) => `${doc.firstName} ${doc.lastName}` },
  },
});

engine.add({ id: "1", firstName: "Chiamaka", lastName: "Obi" });
engine.search("chiamaka obi"); // ✓ matches from computed "fullName"
```

### Persistence: Save & Restore

```typescript
import { serialize, deserialize, saveToFile, loadFromFile } from "litesearch-engine";

// Serialize to JSON string
const json = serialize(engine);

// Restore from JSON
const restored = deserialize(json, { fields: { name: { weight: 3 } } });

// Node.js file persistence (browser-safe — throws if fs not available)
await saveToFile(engine, "./search-index.json");
const fromDisk = await loadFromFile("./search-index.json", { fields: { name: { weight: 3 } } });
```

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

  storeDocuments: true,  // Keep original docs in memory. false saves memory but disables doc access.

  limits: {
    maxQueryLength:   512,     // Max chars in query string
    maxTokenCount:    128,     // Max tokens after tokenization
    maxDocumentSize:  1_000_000, // Max JSON bytes per doc
    maxFieldValueSize: 10_000,   // Max chars per field value
  },

  cache: {
    enabled:     true,   // Enable LRU query cache
    maxEntries:  1000,   // Max cached results
    ttlMs:       30_000, // Cache TTL in milliseconds
  },

  idResolver: (doc) => doc.uuid, // Custom ID resolver (overrides idField)
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
// Batches tokenization and indexing — significantly faster than looping add().
// For 10,000 docs this typically takes 30–80ms.
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
  id:         string;          // document ID (always present)
  document:   T | null;        // original doc (null when storeDocuments: false)
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
|---|---|---|---|---|---|
| 1,000 | ~3ms | < 1ms | < 1ms | < 1ms |
| 10,000 | ~30ms | < 3ms | < 5ms | < 1ms |
| 50,000 | ~150ms | < 15ms | < 25ms | < 5ms |

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

**5. FilterIndex accelerates set-based filtering.** Filters on equality, numeric ranges, and tag inclusion use an optimised FilterIndex (inverted sets per value). For range/category filters on large datasets, the FilterIndex evaluates set intersections in O(min(a,b)) instead of scanning all documents.

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

### Levenshtein (Fuzzy) — BK-tree Index

Uses a **BK-tree** (Burkhard-Keller tree) for O(log n) fuzzy matching instead of brute-force scan:

- **Metric space index** — each node is a word; children are organised by Levenshtein distance from the parent.
- **Query** — recursive traversal that prunes subtrees whose distance is impossible within the threshold.
- **Build** — insert each unique term into the tree (O(log n) per insertion).
- **Adaptive threshold** — terms < 4 chars require exact match; 4–6 chars allow distance 1; 7+ allow distance 2.

Previously the engine scanned all indexed terms with a two-row DP table. The BK-tree reduces fuzzy lookups from O(n) to O(log n).

### Trie (Autocomplete) — Iterative Traversal

A character-level prefix tree where each node stores:
- `children: Map<char, TrieNode>`
- `docIds: Set<string>` — all docs reachable from this prefix
- `frequency: number` — for ranking

Prefix lookup is O(prefix length). After reaching the prefix node, an **iterative DFS** (using an explicit stack) collects all descendant words, sorted by frequency. The iterative approach avoids stack-overflow risks on deep, narrow branches compared to a recursive approach.

### PrefixTrie — Partial Matching in Search

Separate from the suggestion trie, a **PrefixTrie** structure indexes every term for fast partial-match lookups during search queries:

- **Structure** — each node holds `docIds: Set<string>` of documents containing any term with this prefix.
- **Lookup** — O(k) where k = prefix length. Returns a set of matching document IDs directly, without scanning term lists.
- **Serialization** — compact JSON representation with `Object.create(null)` maps for efficient serialization.

### FilterIndex — Accelerated Set Operations

The **FilterIndex** is an inverted index over document field values for fast filter evaluation:

```
field → value → Set<docId>

"category" → {
  "Footwear":  { doc1, doc2, doc15 },
  "Apparel":   { doc3, doc9 },
  "Electronics": { doc7 }
}

"price" → {
  "range:0-100":   { doc7 },
  "range:100-500": { doc1, doc2, doc3, doc9, doc15 }
}
```

- **Equality filters** (`eq`, `in`) — direct set lookup.
- **Numeric filters** (`gte`, `lte`, `range`) — maintains sorted bucket sets.
- **Negation** (`neq`, `not_in`) — computed as full-set difference.
- **AND** — set intersection (O(min(a,b))).
- **OR** — set union.
- The filter result is intersected with the BM25-scored candidate set before building output, reducing downstream work.

When the filter operator is not supported by FilterIndex (e.g. regex, exists), the engine falls back to full-document scan.

### LRU Query Cache

A configurable **Least-Recently-Used cache** that stores query results:

- **Key** — hash of `(query, filters, limit, offset, minScore, sort)`.
- **TTL** — configurable (default 30s). Stale entries are evicted on read.
- **Capacity** — configurable max entries (default 1000).
- **Invalidation** — the cache is cleared automatically on any `add`, `update`, or `remove` operation to prevent stale results.

Cache hits return in < 10µs — useful for repeated searches, debounced autocomplete, and pagination.

### Batch Indexing (addMany)

`addMany()` processes documents in chunks to minimise overhead:

1. All documents are tokenized in a loop, collecting per-doc metadata.
2. Document metadata (field lengths, tokens) is aggregated into index batches.
3. The inverted index, BK-trees, PrefixTries, and filter index are updated in bulk operations.
4. The document store is updated.

This avoids repeated single-document overhead and reduces indexing time by roughly 3–5× compared to individual `add()` calls.

### Query Pipeline

```
query string
    ↓ check LRU cache (hash → results) → cache hit? → return immediately
    ↓ tokenize (lowercase, split, strip stopwords, limit to maxTokenCount)
    ↓ per-token lookup: exact (direct set) → prefix (PrefixTrie) → fuzzy (BK-tree)
    ↓ accumulate BM25 scores per field
    ↓ exact phrase boost (if multi-token)
    ↓ evaluate filters via FilterIndex (set ops) → intersected with scored docs
    ↓ top-K via bounded heap (O(n log K)) instead of full sort
    ↓ normalise scores to [0, 1] against maxScore
    ↓ build highlights (if requested)
    ↓ cache result
    ↓ paginate
    ↓ SearchResult
```

---

## License

MIT
