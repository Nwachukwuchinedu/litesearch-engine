import { describe, it, expect } from "vitest";
import { BM25Scorer } from "../../src/core/bm25";
import type { DocMeta, Postings } from "../../src/types/index";

describe("BM25Scorer", () => {
  describe("scoreField", () => {
    it("computes correct BM25+ score with known values", () => {
      const scorer = new BM25Scorer({ k1: 1.2, b: 0.75 });

      // Setup: 10 docs total, term appears in 2 docs (df=2), N=10
      // For our test doc: tf=3, fieldLen=50, avgLen=40, weight=1.0
      const postings: Postings = new Map([
        ["doc1", [0, 1, 2]], // tf=3
        ["doc2", [0]],       // tf=1 (other doc with the term)
      ]);

      const docMetas = new Map<string, DocMeta>([
        [
          "doc1",
          {
            id: "doc1",
            fieldLengths: { title: 50 },
            doc: { id: "doc1", title: "" },
          },
        ],
        [
          "doc2",
          {
            id: "doc2",
            fieldLengths: { title: 30 },
            doc: { id: "doc2", title: "" },
          },
        ],
      ]);

      const scores = scorer.scoreField("test", postings, docMetas, "title", 40, 10, 1.0);

      // BM25+ formula for doc1:
      // idf = log((10 - 2 + 0.5) / (2 + 0.5) + 1) = log(8.5/2.5 + 1) = log(3.4 + 1) = log(4.4) ≈ 1.4816
      // tfNorm = (3 * (1.2 + 1)) / (3 + 1.2 * (1 - 0.75 + 0.75 * (50/40)))
      //        = (3 * 2.2) / (3 + 1.2 * (0.25 + 0.9375))
      //        = 6.6 / (3 + 1.2 * 1.1875)
      //        = 6.6 / (3 + 1.425)
      //        = 6.6 / 4.425
      //        ≈ 1.4915
      // score = 1.4816 * 1.4915 * 1.0 ≈ 2.210
      expect(scores.get("doc1")).toBeDefined();
      const score = scores.get("doc1")!;
      expect(score).toBeGreaterThan(2.0);
      expect(score).toBeLessThan(2.4);
    });

    it("returns zero score when tf is zero (no postings)", () => {
      const scorer = new BM25Scorer();
      const postings: Postings = new Map();
      const docMetas = new Map<string, DocMeta>();
      const scores = scorer.scoreField("empty", postings, docMetas, "title", 40, 100, 1.0);
      expect(scores.size).toBe(0);
    });
  });

  describe("normalise", () => {
    it("returns values in [0, 1] range with max doc getting 1.0", () => {
      const scores = new Map<string, number>([
        ["doc1", 10],
        ["doc2", 5],
        ["doc3", 2.5],
      ]);

      const normalised = BM25Scorer.normalise(scores);
      expect(normalised.get("doc1")).toBe(1.0);
      expect(normalised.get("doc2")).toBe(0.5);
      expect(normalised.get("doc3")).toBe(0.25);
    });

    it("returns empty map for empty input", () => {
      const scores = new Map<string, number>();
      const normalised = BM25Scorer.normalise(scores);
      expect(normalised.size).toBe(0);
    });

    it("returns same map when all scores are zero", () => {
      const scores = new Map<string, number>([["doc1", 0]]);
      const normalised = BM25Scorer.normalise(scores);
      expect(normalised.get("doc1")).toBe(0);
    });
  });

  describe("applyExactBoost", () => {
    it("applies 1.5x multiplier to exact match documents", () => {
      const scores = new Map<string, number>([
        ["doc1", 10],
        ["doc2", 5],
      ]);
      const exactIds = new Set<string>(["doc1"]);

      BM25Scorer.applyExactBoost(scores, exactIds, 1.5);
      expect(scores.get("doc1")).toBe(15);
      expect(scores.get("doc2")).toBe(5);
    });

    it("does not modify scores for non-matching exact IDs", () => {
      const scores = new Map<string, number>([["doc1", 10]]);
      const exactIds = new Set<string>(["doc2"]);

      BM25Scorer.applyExactBoost(scores, exactIds, 1.5);
      expect(scores.get("doc1")).toBe(10);
    });
  });

  describe("mergeScores", () => {
    it("sums scores from multiple fields", () => {
      const field1 = new Map<string, number>([
        ["doc1", 5],
        ["doc2", 3],
      ]);
      const field2 = new Map<string, number>([
        ["doc1", 2],
        ["doc3", 4],
      ]);

      const merged = BM25Scorer.mergeScores([field1, field2]);
      expect(merged.get("doc1")).toBe(7);
      expect(merged.get("doc2")).toBe(3);
      expect(merged.get("doc3")).toBe(4);
    });

    it("merges into existing target map", () => {
      const target = new Map<string, number>([["doc1", 10]]);
      const field1 = new Map<string, number>([["doc1", 5]]);

      BM25Scorer.mergeScores([field1], target);
      expect(target.get("doc1")).toBe(15);
    });
  });

  describe("IDF cache", () => {
    it("returns the same score for same term+N (uses cache)", () => {
      const scorer = new BM25Scorer();
      const postings: Postings = new Map([["doc1", [0]]]);
      const docMetas = new Map<string, DocMeta>([
        ["doc1", { id: "doc1", fieldLengths: { title: 10 }, doc: { id: "doc1" } }],
      ]);

      const r1 = scorer.scoreField("hello", postings, docMetas, "title", 10, 5, 1.0);
      const r2 = scorer.scoreField("hello", postings, docMetas, "title", 10, 5, 1.0);
      expect(r1.get("doc1")).toBe(r2.get("doc1"));
    });

    it("computes new IDF after invalidateIdfCache", () => {
      const scorer = new BM25Scorer();
      const postings1: Postings = new Map([["doc1", [0]]]);
      const docMetas1 = new Map<string, DocMeta>([
        ["doc1", { id: "doc1", fieldLengths: { title: 10 }, doc: { id: "doc1" } }],
      ]);

      const r1 = scorer.scoreField("test", postings1, docMetas1, "title", 10, 5, 1.0);

      scorer.invalidateIdfCache();

      const postings2: Postings = new Map([["doc1", [0]], ["doc2", [0]]]);
      const docMetas2 = new Map<string, DocMeta>([
        ["doc1", { id: "doc1", fieldLengths: { title: 10 }, doc: { id: "doc1" } }],
        ["doc2", { id: "doc2", fieldLengths: { title: 10 }, doc: { id: "doc2" } }],
      ]);

      const r2 = scorer.scoreField("test", postings2, docMetas2, "title", 10, 10, 1.0);
      expect(r2.get("doc1")).not.toBe(r1.get("doc1"));
    });

    it("cacheIdf precomputes and stores IDF", () => {
      const scorer = new BM25Scorer();
      const postings: Postings = new Map([["doc1", [0]]]);

      scorer.cacheIdf("cached", postings, 5);

      const docMetas = new Map<string, DocMeta>([
        ["doc1", { id: "doc1", fieldLengths: { title: 10 }, doc: { id: "doc1" } }],
      ]);

      const scores = scorer.scoreField("cached", postings, docMetas, "title", 10, 5, 1.0);
      expect(scores.get("doc1")).toBeGreaterThan(0);
    });
  });
});
