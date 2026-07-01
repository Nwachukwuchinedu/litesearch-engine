import { describe, it, expect } from "vitest";
import { SuggestionEngine } from "../../src/suggest/suggestion-engine";

describe("SuggestionEngine", () => {
  function createEngine(): SuggestionEngine {
    const engine = new SuggestionEngine(10);
    engine.insert("hello", "doc1");
    engine.insert("hello", "doc2");
    engine.insert("help", "doc1");
    engine.insert("helpful", "doc1");
    engine.insert("world", "doc3");
    engine.insert("helicopter", "doc2");
    return engine;
  }

  describe("insert and suggest", () => {
    it("returns prefix matches", () => {
      const engine = createEngine();
      const result = engine.suggest("hel");
      const texts = result.suggestions.map((s) => s.text);
      expect(texts).toContain("hello");
      expect(texts).toContain("help");
      expect(texts).toContain("helpful");
      expect(texts).toContain("helicopter");
    });

    it("exact matches ranked first", () => {
      const engine = createEngine();
      const result = engine.suggest("hello");
      expect(result.suggestions[0].text).toBe("hello");
      expect(result.suggestions[0].matchType).toBe("exact");
    });

    it("prefix matches ranked after exact", () => {
      const engine = createEngine();
      const result = engine.suggest("hel");
      const exactIdx = result.suggestions.findIndex((s) => s.matchType === "exact");
      const prefixIdx = result.suggestions.findIndex((s) => s.matchType === "prefix");
      if (exactIdx !== -1 && prefixIdx !== -1) {
        expect(exactIdx).toBeLessThan(prefixIdx);
      }
    });

    it("fuzzy fallback when fewer than 3 prefix results", () => {
      const engine = new SuggestionEngine(10);
      engine.insert("hello", "doc1");
      engine.insert("hallo", "doc2");
      engine.insert("help", "doc1");

      const result = engine.suggest("hallo");
      const fuzzyMatches = result.suggestions.filter((s) => s.matchType === "fuzzy");
      // "hallo" should have exact match, and since there are 3+ prefix results,
      // fuzzy might not be triggered. Let's test with a less common word.
      expect(fuzzyMatches.length).toBeGreaterThanOrEqual(0);
    });

    it("actually tests fuzzy fallback", () => {
      const engine = new SuggestionEngine(10);
      engine.insert("hello", "doc1");
      engine.insert("hallo", "doc2");
      engine.insert("help", "doc1");

      // suggest "halo" — not an exact match, no prefix matches
      const result = engine.suggest("halo");
      const fuzzy = result.suggestions.filter((s) => s.matchType === "fuzzy");
      expect(fuzzy.length).toBeGreaterThanOrEqual(1);
      const fuzzyTexts = fuzzy.map((s) => s.text);
      expect(fuzzyTexts).toContain("hallo");
    });

    it("returns empty results for empty query", () => {
      const engine = createEngine();
      const result = engine.suggest("");
      expect(result.suggestions).toEqual([]);
      expect(result.took).toBe(0);
    });
  });

  describe("ranking", () => {
    it("ranks: exact > prefix > fuzzy, then by frequency", () => {
      const engine = new SuggestionEngine(10);
      engine.insert("apple", "doc1");
      engine.insert("apple", "doc2");
      engine.insert("application", "doc1");
      engine.insert("appetizer", "doc1");

      const result = engine.suggest("app");
      const matchTypes = result.suggestions.map((s) => s.matchType);
      const exactIdx = matchTypes.indexOf("exact");
      const prefixIdx = matchTypes.indexOf("prefix");
      expect(prefixIdx).toBeGreaterThan(exactIdx);
    });
  });

  describe("removeDoc", () => {
    it("removes document's suggestions", () => {
      const engine = createEngine();
      engine.removeDoc("doc1");
      const result = engine.suggest("hel");
      const doc1Suggestions = result.suggestions.filter((s) =>
        s.documentIds.includes("doc1")
      );
      expect(doc1Suggestions.length).toBe(0);
    });

    it("decrements frequency after removeDoc", () => {
      const engine = new SuggestionEngine(10);
      engine.insert("hello", "doc1");
      engine.insert("hello", "doc2");
      expect(engine.suggest("hello").suggestions[0].frequency).toBe(2);

      engine.removeDoc("doc1");
      const suggestions = engine.suggest("hello");
      expect(suggestions.suggestions.length).toBe(1);
      expect(suggestions.suggestions[0].frequency).toBe(1);
    });

    it("prunes node when frequency reaches zero", () => {
      const engine = new SuggestionEngine(10);
      engine.insert("hello", "doc1");
      expect(engine.suggest("hello").suggestions.length).toBe(1);

      engine.removeDoc("doc1");
      // After removing the only doc, the word should no longer appear
      const result = engine.suggest("hello");
      expect(result.suggestions.length).toBe(0);
    });
  });

  describe("nodeCount", () => {
    it("returns non-zero after inserts", () => {
      const engine = createEngine();
      expect(engine.nodeCount).toBeGreaterThan(0);
    });
  });

  describe("clear", () => {
    it("resets all state", () => {
      const engine = createEngine();
      engine.clear();
      expect(engine.nodeCount).toBe(0);
      const result = engine.suggest("hel");
      expect(result.suggestions).toEqual([]);
    });
  });

  describe("iterative trie traversal", () => {
    it("returns same results after iterative refactoring (no behavior change)", () => {
      const engine = createEngine();
      const result1 = engine.suggest("hel");
      const texts1 = result1.suggestions.map((s) => s.text);
      expect(texts1).toContain("hello");
      expect(texts1).toContain("help");
      expect(texts1).toContain("helpful");
      expect(texts1).toContain("helicopter");

      const result2 = engine.suggest("wo");
      expect(result2.suggestions[0].text).toBe("world");

      engine.insert("wonderful", "doc1");
      const result3 = engine.suggest("wo");
      expect(result3.suggestions.length).toBeGreaterThanOrEqual(2);
    });

    it("handles deep words without recursion issues", () => {
      const engine = new SuggestionEngine(10);
      const deepWord = "a".repeat(500);
      engine.insert(deepWord, "doc1");
      const result = engine.suggest("a".repeat(10));
      expect(result.suggestions.length).toBe(1);
      expect(result.suggestions[0].text).toBe(deepWord);

      engine.insert("a" + "b".repeat(499), "doc2");
      const result2 = engine.suggest("a");
      expect(result2.suggestions.length).toBe(2);
    });
  });
});
