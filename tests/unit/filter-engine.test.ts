import { describe, it, expect } from "vitest";
import { evaluateFilter, filterDocuments } from "../../src/filters/filter-engine";
import type { AnyDocument } from "../../src/types/index";

const testDoc: AnyDocument = {
  id: "1",
  title: "Running Shoes",
  category: "Footwear",
  price: 7500,
  tags: ["sports", "running"],
  brand: "Nike",
  active: true,
  meta: { level: "advanced" },
};

describe("evaluateFilter", () => {
  describe("all 12 operators", () => {
    it("eq: equals works", () => {
      expect(
        evaluateFilter(testDoc, { field: "category", operator: "eq", value: "Footwear" })
      ).toBe(true);
      expect(
        evaluateFilter(testDoc, { field: "category", operator: "eq", value: "Shoes" })
      ).toBe(false);
    });

    it("neq: not equals works", () => {
      expect(
        evaluateFilter(testDoc, { field: "category", operator: "neq", value: "Shoes" })
      ).toBe(true);
      expect(
        evaluateFilter(testDoc, { field: "category", operator: "neq", value: "Footwear" })
      ).toBe(false);
    });

    it("gt: greater than works", () => {
      expect(
        evaluateFilter(testDoc, { field: "price", operator: "gt", value: 5000 })
      ).toBe(true);
      expect(
        evaluateFilter(testDoc, { field: "price", operator: "gt", value: 8000 })
      ).toBe(false);
    });

    it("gte: greater than or equal works", () => {
      expect(
        evaluateFilter(testDoc, { field: "price", operator: "gte", value: 7500 })
      ).toBe(true);
      expect(
        evaluateFilter(testDoc, { field: "price", operator: "gte", value: 8000 })
      ).toBe(false);
    });

    it("lt: less than works", () => {
      expect(
        evaluateFilter(testDoc, { field: "price", operator: "lt", value: 10000 })
      ).toBe(true);
      expect(
        evaluateFilter(testDoc, { field: "price", operator: "lt", value: 5000 })
      ).toBe(false);
    });

    it("lte: less than or equal works", () => {
      expect(
        evaluateFilter(testDoc, { field: "price", operator: "lte", value: 7500 })
      ).toBe(true);
      expect(
        evaluateFilter(testDoc, { field: "price", operator: "lte", value: 5000 })
      ).toBe(false);
    });

    it("range: inclusive range works", () => {
      expect(
        evaluateFilter(testDoc, { field: "price", operator: "range", value: [5000, 10000] })
      ).toBe(true);
      expect(
        evaluateFilter(testDoc, { field: "price", operator: "range", value: [8000, 10000] })
      ).toBe(false);
    });

    it("in: value in array works", () => {
      expect(
        evaluateFilter(testDoc, { field: "category", operator: "in", value: ["Footwear", "Clothing"] })
      ).toBe(true);
      expect(
        evaluateFilter(testDoc, { field: "category", operator: "in", value: ["Clothing"] })
      ).toBe(false);
    });

    it("nin: value not in array works", () => {
      expect(
        evaluateFilter(testDoc, { field: "category", operator: "nin", value: ["Clothing"] })
      ).toBe(true);
      expect(
        evaluateFilter(testDoc, { field: "category", operator: "nin", value: ["Footwear"] })
      ).toBe(false);
    });

    it("contains: string contains substring (case-insensitive)", () => {
      expect(
        evaluateFilter(testDoc, { field: "title", operator: "contains", value: "shoes" })
      ).toBe(true);
      expect(
        evaluateFilter(testDoc, { field: "title", operator: "contains", value: "boots" })
      ).toBe(false);
    });

    it("startsWith: string starts with prefix (case-insensitive)", () => {
      expect(
        evaluateFilter(testDoc, { field: "title", operator: "startsWith", value: "running" })
      ).toBe(true);
      expect(
        evaluateFilter(testDoc, { field: "title", operator: "startsWith", value: "walking" })
      ).toBe(false);
    });

    it("exists: field exists and is not null/undefined", () => {
      expect(
        evaluateFilter(testDoc, { field: "title", operator: "exists", value: true })
      ).toBe(true);
      expect(
        evaluateFilter(testDoc, { field: "nonexistent", operator: "exists", value: true })
      ).toBe(false);
    });

    it("exists returns false when value is null", () => {
      const doc = { id: "1", name: null };
      expect(
        evaluateFilter(doc, { field: "name", operator: "exists", value: true })
      ).toBe(false);
    });
  });

  describe("AND composition", () => {
    it("returns true when all clauses match", () => {
      const result = evaluateFilter(testDoc, {
        AND: [
          { field: "category", operator: "eq", value: "Footwear" },
          { field: "price", operator: "gt", value: 5000 },
        ],
      });
      expect(result).toBe(true);
    });

    it("returns false when any clause fails", () => {
      const result = evaluateFilter(testDoc, {
        AND: [
          { field: "category", operator: "eq", value: "Footwear" },
          { field: "price", operator: "gt", value: 10000 },
        ],
      });
      expect(result).toBe(false);
    });
  });

  describe("OR composition", () => {
    it("returns true when any clause matches", () => {
      const result = evaluateFilter(testDoc, {
        OR: [
          { field: "category", operator: "eq", value: "Footwear" },
          { field: "category", operator: "eq", value: "Clothing" },
        ],
      });
      expect(result).toBe(true);
    });

    it("returns false when no clause matches", () => {
      const result = evaluateFilter(testDoc, {
        OR: [
          { field: "category", operator: "eq", value: "Clothing" },
          { field: "category", operator: "eq", value: "Electronics" },
        ],
      });
      expect(result).toBe(false);
    });
  });

  describe("NOT composition", () => {
    it("inverts the filter result", () => {
      const result = evaluateFilter(testDoc, {
        NOT: { field: "category", operator: "eq", value: "Clothing" },
      });
      expect(result).toBe(true);
    });

    it("returns false when inner filter is true", () => {
      const result = evaluateFilter(testDoc, {
        NOT: { field: "category", operator: "eq", value: "Footwear" },
      });
      expect(result).toBe(false);
    });
  });

  describe("nested groups", () => {
    it("evaluates deeply nested AND/OR/NOT", () => {
      const result = evaluateFilter(testDoc, {
        AND: [
          { field: "category", operator: "eq", value: "Footwear" },
          {
            OR: [
              { field: "price", operator: "lt", value: 5000 },
              { field: "price", operator: "gt", value: 6000 },
            ],
          },
          {
            NOT: { field: "brand", operator: "eq", value: "Adidas" },
          },
        ],
      });
      expect(result).toBe(true);
    });
  });

  describe("empty group", () => {
    it("returns true for empty filter group", () => {
      const result = evaluateFilter(testDoc, {});
      expect(result).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles null value gracefully", () => {
      const doc = { id: "1", name: null };
      expect(
        evaluateFilter(doc, { field: "name", operator: "exists", value: true })
      ).toBe(false);
    });
  });
});

describe("filterDocuments", () => {
  it("filters array of documents", () => {
    const docs: AnyDocument[] = [
      { id: "1", category: "Footwear", price: 5000 },
      { id: "2", category: "Footwear", price: 10000 },
      { id: "3", category: "Clothing", price: 3000 },
    ];

    const result = filterDocuments(docs, {
      AND: [
        { field: "category", operator: "eq", value: "Footwear" },
        { field: "price", operator: "gte", value: 8000 },
      ],
    });

    expect(result.length).toBe(1);
    expect(result[0].id).toBe("2");
  });
});
