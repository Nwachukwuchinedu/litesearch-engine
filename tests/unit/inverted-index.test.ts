import { describe, it, expect } from "vitest";
import { InvertedIndexStore } from "../../src/indexing/inverted-index";

describe("InvertedIndexStore", () => {
  function createStore(): InvertedIndexStore {
    const store = new InvertedIndexStore();
    store.addPosting("title", "hello", "doc1", 0);
    store.addPosting("title", "hello", "doc2", 0);
    store.addPosting("title", "world", "doc1", 1);
    store.addPosting("title", "hello", "doc2", 3);
    store.addPosting("title", "testing", "doc3", 0);
    store.addPosting("title", "tested", "doc3", 1);
    store.addPosting("body", "hello", "doc1", 0);
    return store;
  }

  describe("addPosting and getExact", () => {
    it("returns correct postings for a term", () => {
      const store = createStore();
      const postings = store.getExact("title", "hello");
      expect(postings).toBeDefined();
      expect(postings!.size).toBe(2);
      expect(postings!.has("doc1")).toBe(true);
      expect(postings!.has("doc2")).toBe(true);
    });

    it("stores positions correctly", () => {
      const store = createStore();
      const postings = store.getExact("title", "hello");
      const doc2Pos = postings!.get("doc2")!;
      expect(doc2Pos).toEqual([0, 3]);
    });

    it("returns undefined for non-existent term", () => {
      const store = createStore();
      expect(store.getExact("title", "nonexistent")).toBeUndefined();
    });

    it("returns undefined for non-existent field", () => {
      const store = createStore();
      expect(store.getExact("unknown", "hello")).toBeUndefined();
    });
  });

  describe("getByPrefix", () => {
    it("finds all terms with given prefix", () => {
      const store = createStore();
      const results = store.getByPrefix("title", "test");
      expect(results.size).toBeGreaterThanOrEqual(1);
      const doc3Entries = results.get("doc3");
      expect(doc3Entries).toBeDefined();
      const terms = doc3Entries!.map((e) => e.term);
      expect(terms).toContain("testing");
      expect(terms).toContain("tested");
    });

    it("returns empty map for non-existent prefix", () => {
      const store = createStore();
      const results = store.getByPrefix("title", "zzzz");
      expect(results.size).toBe(0);
    });

    it("returns empty map for non-existent field", () => {
      const store = createStore();
      const results = store.getByPrefix("unknown", "test");
      expect(results.size).toBe(0);
    });
  });

  describe("getFuzzy", () => {
    it("finds terms within edit distance", () => {
      const store = createStore();
      store.addPosting("title", "hallo", "doc4", 0);
      const results = store.getFuzzy("title", "hello", 2);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.term === "hallo")).toBe(true);
    });

    it("returns empty array for no matches", () => {
      const store = createStore();
      const results = store.getFuzzy("title", "xyzabc", 2);
      expect(results).toEqual([]);
    });
  });

  describe("lookup", () => {
    it("returns exact match first", () => {
      const store = createStore();
      const results = store.lookup("title", "hello", 2, true);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].matchType).toBe("exact");
      expect(results[0].term).toBe("hello");
    });

    it("includes prefix matches", () => {
      const store = createStore();
      const results = store.lookup("title", "test", 2, true);
      const prefixResults = results.filter((r) => r.matchType === "prefix");
      expect(prefixResults.length).toBeGreaterThanOrEqual(1);
    });

    it("includes fuzzy matches when query length >= 4", () => {
      const store = createStore();
      store.addPosting("title", "hallo", "doc4", 0);
      const results = store.lookup("title", "hello", 2, true);
      const fuzzyResults = results.filter((r) => r.matchType === "fuzzy");
      expect(fuzzyResults.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("removeDoc", () => {
    it("removes all postings for a document", () => {
      const store = createStore();
      expect(store.getExact("title", "hello")!.size).toBe(2);
      store.removeDoc("doc1");
      expect(store.getExact("title", "hello")!.size).toBe(1);
      expect(store.getExact("title", "world")).toBeUndefined();
    });

    it("does not affect other documents", () => {
      const store = createStore();
      store.removeDoc("doc1");
      const postings = store.getExact("title", "hello");
      expect(postings!.has("doc2")).toBe(true);
    });
  });

  describe("hasExactPhrase", () => {
    it("returns true for consecutive positions", () => {
      const store = createStore();
      store.addPosting("title", "quick", "doc1", 0);
      store.addPosting("title", "brown", "doc1", 1);
      store.addPosting("title", "fox", "doc1", 2);
      expect(store.hasExactPhrase("title", ["quick", "brown", "fox"], "doc1")).toBe(true);
    });

    it("returns false for non-consecutive positions", () => {
      const store = createStore();
      store.addPosting("title", "quick", "doc1", 0);
      store.addPosting("title", "brown", "doc1", 2);
      expect(store.hasExactPhrase("title", ["quick", "brown"], "doc1")).toBe(false);
    });

    it("returns false for missing term", () => {
      const store = createStore();
      store.addPosting("title", "quick", "doc1", 0);
      expect(store.hasExactPhrase("title", ["quick", "nonexistent"], "doc1")).toBe(false);
    });
  });

  describe("termCount", () => {
    it("counts unique terms across all fields", () => {
      const store = createStore();
      const count = store.termCount();
      expect(count).toBeGreaterThanOrEqual(4);
    });

    it("counts unique terms for a specific field", () => {
      const store = createStore();
      const titleCount = store.termCount("title");
      const bodyCount = store.termCount("body");
      expect(titleCount).toBeGreaterThanOrEqual(3);
      expect(bodyCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("fields", () => {
    it("returns list of indexed field names", () => {
      const store = createStore();
      const fields = store.fields;
      expect(fields).toContain("title");
      expect(fields).toContain("body");
    });
  });

  describe("clear", () => {
    it("resets all state", () => {
      const store = createStore();
      store.clear();
      expect(store.termCount()).toBe(0);
      expect(store.getExact("title", "hello")).toBeUndefined();
    });
  });
});
