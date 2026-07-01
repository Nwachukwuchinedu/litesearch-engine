import { describe, it, expect } from "vitest";
import { LiteSearch } from "../../src/engine";
import type { AnyDocument } from "../../src/types/index";

interface TestDoc extends AnyDocument {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;
}

function createEngine() {
  return new LiteSearch<TestDoc>({
    idField: "id",
    fields: {
      title: { weight: 3, suggest: true },
      description: { weight: 1 },
      category: { weight: 2, suggest: true },
    },
    fuzzy: { enabled: true, maxDistance: 2, minLength: 4 },
  });
}

describe("LiteSearch (integration)", () => {
  describe("flattenValue with circular references", () => {
    it("handles circular references without throwing", () => {
      const engine = new LiteSearch<AnyDocument>({
        idField: "id",
        fields: ["title"],
      });

      // Create a value with circular reference that flattenValue will encounter
      const circular: AnyDocument = { b: "test" };
      circular.a = circular;

      const doc: AnyDocument = { id: "1", title: circular };

      expect(() => engine.add(doc)).not.toThrow();
      const result = engine.search("test");
      expect(result.hits.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("import config validation", () => {
    it("logs a warning when config does not match serialized data", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const engine = new LiteSearch<AnyDocument>({
        idField: "id",
        fields: ["title"],
        fuzzy: { enabled: true, maxDistance: 2, minLength: 4 },
      });
      engine.add({ id: "1", title: "test" });

      const exported = engine.export();

      // Import with different fuzzy config (idField and fields match so import works)
      LiteSearch.import(exported, {
        idField: "id",
        fields: ["title"],
        fuzzy: { enabled: false, maxDistance: 1, minLength: 3 },
      } as LiteSearchConfig<AnyDocument>);

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
  describe("add and search", () => {
    it("basic search returns correct docs", () => {
      const engine = createEngine();
      engine.add({ id: "1", title: "Running Shoes", description: "Comfortable running shoes for daily use", category: "Footwear", price: 7500 });
      engine.add({ id: "2", title: "Basketball Sneakers", description: "High-top basketball shoes", category: "Footwear", price: 12000 });
      engine.add({ id: "3", title: "Yoga Mat", description: "Non-slip yoga mat", category: "Fitness", price: 2500 });

      const result = engine.search("shoes");
      expect(result.hits.length).toBeGreaterThanOrEqual(1);
      expect(result.hits.some((h) => h.document.id === "1")).toBe(true);
      expect(result.hits.some((h) => h.document.id === "2")).toBe(true);
    });

    it("BM25 scoring ranks relevant docs higher", () => {
      const engine = createEngine();
      engine.add({ id: "1", title: "Running Shoes", description: "Comfortable running shoes", category: "Footwear", price: 7500 });
      engine.add({ id: "2", title: "Brown Boots", description: "Leather boots for winter", category: "Footwear", price: 15000 });
      engine.add({ id: "3", title: "Office Chair", description: "Ergonomic office chair", category: "Furniture", price: 45000 });

      const result = engine.search("running shoes");
      expect(result.hits.length).toBeGreaterThanOrEqual(1);
      expect(result.hits[0].document.id).toBe("1");
      expect(result.hits[0].score).toBeGreaterThan(0);
    });

    it("fuzzy matching finds close matches", () => {
      const engine = createEngine();
      engine.add({ id: "1", title: "Running Shoes", description: "For runners", category: "Footwear", price: 7500 });

      // "shoes" vs "shoes" — exact; but test with a typo
      const result = engine.search("shoess"); // one extra 's'
      expect(result.hits.length).toBeGreaterThanOrEqual(1);
      expect(result.hits[0].document.id).toBe("1");
    });

    it("prefix matching works for partial words", () => {
      const engine = createEngine();
      engine.add({ id: "1", title: "Running Shoes", description: "Great for jogging", category: "Footwear", price: 7500 });

      const result = engine.search("run");
      expect(result.hits.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("search with options", () => {
    it("filter returns only matching docs", () => {
      const engine = createEngine();
      engine.add({ id: "1", title: "Running Shoes", description: "Comfortable", category: "Footwear", price: 7500 });
      engine.add({ id: "2", title: "T-Shirt", description: "Cotton fabric", category: "Clothing", price: 1500 });

      const result = engine.search("shoes", {
        filter: { field: "category", operator: "eq", value: "Footwear" },
      });
      expect(result.hits.length).toBe(1);
      expect(result.hits[0].document.id).toBe("1");
    });

    it("pagination with limit and offset works", () => {
      const engine = createEngine();
      for (let i = 1; i <= 20; i++) {
        engine.add({ id: String(i), title: `Item ${i}`, description: "test", category: "General", price: i * 100 });
      }

      const page1 = engine.search("item", { limit: 5, offset: 0 });
      expect(page1.hits.length).toBeLessThanOrEqual(5);
      expect(page1.pagination.hasMore).toBe(true);

      const page2 = engine.search("item", { limit: 5, offset: 5 });
      expect(page2.hits.length).toBeLessThanOrEqual(5);
      const page1Ids = page1.hits.map((h) => h.document.id);
      const page2Ids = page2.hits.map((h) => h.document.id);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap.length).toBe(0);
    });

    it("search with highlighting returns highlights", () => {
      const engine = createEngine();
      engine.add({ id: "1", title: "Running Shoes", description: "Comfortable running shoes for athletes", category: "Footwear", price: 7500 });

      const result = engine.search("running", { highlight: true });
      expect(result.hits.length).toBeGreaterThanOrEqual(1);
      expect(result.hits[0].highlights).toBeDefined();
      expect(result.hits[0].highlights!.length).toBeGreaterThanOrEqual(1);
      if (result.hits[0].highlights) {
        expect(result.hits[0].highlights[0].snippet).toContain("<mark>");
      }
    });

    it("empty query returns empty result with took=0", () => {
      const engine = createEngine();
      const result = engine.search("");
      expect(result.hits).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.took).toBeLessThanOrEqual(1);
    });

    it("field-specific search works", () => {
      const engine = createEngine();
      engine.add({ id: "1", title: "Running Shoes", description: "Comfortable running shoes", category: "Footwear", price: 7500 });
      engine.add({ id: "2", title: "Desk Chair", description: "Office running chair", category: "Furniture", price: 45000 });

      const result = engine.search("running", { fields: ["title"] });
      expect(result.hits.length).toBe(1);
      expect(result.hits[0].document.id).toBe("1");
    });

    it("boostExact flag can be disabled", () => {
      const engine = createEngine();
      engine.add({ id: "1", title: "Running Shoes", description: "Running gear", category: "Footwear", price: 7500 });

      const resultWith = engine.search("running shoes", { boostExact: true });
      const resultWithout = engine.search("running shoes", { boostExact: false });
      expect(resultWith.hits.length).toBe(resultWithout.hits.length);
    });
  });

  describe("suggest", () => {
    it("returns autocomplete suggestions", () => {
      const engine = createEngine();
      engine.add({ id: "1", title: "Running Shoes", description: "test", category: "Footwear", price: 7500 });
      engine.add({ id: "2", title: "Running Shorts", description: "test", category: "Clothing", price: 3000 });

      const result = engine.suggest("run");
      expect(result.suggestions.length).toBeGreaterThanOrEqual(1);
      const texts = result.suggestions.map((s) => s.text);
      expect(texts).toContain("running");
    });
  });

  describe("add, remove, upsert", () => {
    it("removed doc is excluded from search", () => {
      const engine = createEngine();
      engine.add({ id: "1", title: "Running Shoes", description: "test", category: "Footwear", price: 7500 });
      engine.add({ id: "2", title: "Walking Shoes", description: "test", category: "Footwear", price: 5000 });

      expect(engine.search("shoes").hits.length).toBe(2);
      engine.remove("1");
      const result = engine.search("shoes");
      expect(result.hits.length).toBe(1);
      expect(result.hits[0].document.id).toBe("2");
    });

    it("upsert: re-adding doc with same ID updates it", () => {
      const engine = createEngine();
      engine.add({ id: "1", title: "Running Shoes", description: "Old description", category: "Footwear", price: 7500 });

      engine.add({ id: "1", title: "Updated Shoes", description: "New description", category: "Footwear", price: 8000 });

      const result = engine.search("updated");
      expect(result.hits.length).toBeGreaterThanOrEqual(1);
      expect(result.hits.some((h) => h.document.title === "Updated Shoes")).toBe(true);
    });
  });

  describe("stats and clear", () => {
    it("stats returns correct counts", () => {
      const engine = createEngine();
      engine.add({ id: "1", title: "Running Shoes", description: "test", category: "Footwear", price: 7500 });
      engine.add({ id: "2", title: "Yoga Mat", description: "test", category: "Fitness", price: 2500 });

      const stats = engine.stats();
      expect(stats.documentCount).toBe(2);
      expect(stats.termCount).toBeGreaterThan(0);
      expect(stats.trieNodeCount).toBeGreaterThan(0);
      expect(stats.fields).toEqual(expect.arrayContaining(["title", "description", "category"]));
      expect(stats.memoryEstimateBytes).toBeGreaterThan(0);
      expect(stats.lastUpdated).toBeInstanceOf(Date);
    });

    it("clear resets all state", () => {
      const engine = createEngine();
      engine.add({ id: "1", title: "Running Shoes", description: "test", category: "Footwear", price: 7500 });
      engine.clear();

      const stats = engine.stats();
      expect(stats.documentCount).toBe(0);
      expect(stats.termCount).toBe(0);

      const result = engine.search("shoes");
      expect(result.hits).toEqual([]);
    });
  });

  describe("addMany", () => {
    it("uses bounded heap for top-k results in search pipeline", () => {
      const engine = new LiteSearch<AnyDocument>({
        idField: "id",
        fields: ["title"],
      });

      // Add enough documents that a full sort would be expensive
      for (let i = 0; i < 100; i++) {
        engine.add({ id: `doc${i}`, title: `document number ${i} apple` });
      }

      // Search with a small limit
      const result = engine.search("apple", { limit: 5 });

      // Should return exactly 5 results (not 100)
      expect(result.hits.length).toBe(5);
      expect(result.total).toBe(100); // total should reflect all matches, not just top-k

      // Verify hits are ordered by score descending (best matches first)
      for (let i = 1; i < result.hits.length; i++) {
        expect(result.hits[i - 1].score).toBeGreaterThanOrEqual(result.hits[i].score);
      }
    });

    it("batch indexing works", () => {
      const engine = createEngine();
      const docs: TestDoc[] = [
        { id: "1", title: "Running Shoes", description: "test", category: "Footwear", price: 7500 },
        { id: "2", title: "Yoga Mat", description: "test", category: "Fitness", price: 2500 },
        { id: "3", title: "Dumbbells", description: "test", category: "Fitness", price: 5000 },
      ];

      engine.addMany(docs);
      expect(engine.stats().documentCount).toBe(3);

      const result = engine.search("fitness");
      // Should match docs with "Fitness" category (due to suggest-enabled field)
      // Also could match "Yoga" or "Dumbbells" via description if tokenized
      expect(result.hits.length).toBe(2);
    });
  });

  describe("input size limits", () => {
    it("throws when query exceeds maxQueryLength", () => {
      const engine = createEngine();
      const longQuery = "a".repeat(600);
      expect(() => engine.search(longQuery)).toThrow(/exceeds max length/);
    });

    it("throws when query produces too many tokens", () => {
      const engine = new LiteSearch<AnyDocument>({
        idField: "id",
        fields: ["title"],
        limits: { maxTokenCount: 3 },
      });
      engine.add({ id: "1", title: "apple banana cherry date" });
      // "apple banana cherry date" tokenizes to 4 tokens, exceeds limit of 3
      expect(() => engine.search("apple banana cherry date")).toThrow(/exceeding max/);
    });

    it("throws when document exceeds maxDocumentSize", () => {
      const engine = new LiteSearch<AnyDocument>({
        idField: "id",
        fields: ["title"],
        limits: { maxDocumentSize: 50 },
      });
      const largeDoc = { id: "1", title: "x".repeat(100) };
      // JSON.stringify is > 50 bytes
      expect(() => engine.add(largeDoc)).toThrow(/exceeds max/);
    });

    it("truncates field values exceeding maxFieldValueSize", () => {
      const engine = new LiteSearch<AnyDocument>({
        idField: "id",
        fields: ["title"],
        limits: { maxFieldValueSize: 10 },
      });
      engine.add({ id: "1", title: "hello world this is a test" });
      // Title truncated to 10 chars: "hello worl" → tokens ["hello", "worl"]
      const result = engine.search("hello");
      expect(result.hits.length).toBe(1);
      expect(result.hits[0].document.id).toBe("1");
    });
  });
});
