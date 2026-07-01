import { describe, it, expect } from "vitest";
import { FilterIndex } from "../../src/indexing/filter-index";

describe("FilterIndex", () => {
  describe("eq index", () => {
    it("returns correct doc IDs for equality lookup", () => {
      const idx = new FilterIndex();
      idx.add("doc1", "category", "Footwear");
      idx.add("doc2", "category", "Clothing");
      idx.add("doc3", "category", "Footwear");

      const result = idx.getEq("category", "Footwear");
      expect(result).toBeDefined();
      expect([...result!].sort()).toEqual(["doc1", "doc3"]);
    });

    it("returns undefined for non-existent field", () => {
      const idx = new FilterIndex();
      idx.add("doc1", "category", "Footwear");
      expect(idx.getEq("nonexistent", "Footwear")).toBeUndefined();
    });

    it("returns undefined for non-existent value", () => {
      const idx = new FilterIndex();
      idx.add("doc1", "category", "Footwear");
      expect(idx.getEq("category", "Electronics")).toBeUndefined();
    });
  });

  describe("range index", () => {
    it("returns correct docs for numeric range", () => {
      const idx = new FilterIndex();
      idx.add("doc1", "price", 1000);
      idx.add("doc2", "price", 2000);
      idx.add("doc3", "price", 3000);
      idx.add("doc4", "price", 4000);

      const result = idx.getRange("price", 2000, 3500, true, true);
      expect([...result].sort()).toEqual(["doc2", "doc3"]);
    });

    it("handles string values that parse as numbers", () => {
      const idx = new FilterIndex();
      idx.add("doc1", "price", "1000");
      idx.add("doc2", "price", "2000");
      idx.add("doc3", "price", "3000");

      const result = idx.getRange("price", 1500, 2500, true, true);
      expect([...result].sort()).toEqual(["doc2"]);
    });

    it("returns empty set for no matches", () => {
      const idx = new FilterIndex();
      idx.add("doc1", "price", 1000);
      const result = idx.getRange("price", 5000, 10000, true, true);
      expect(result.size).toBe(0);
    });

    it("handles gt (exclusive min)", () => {
      const idx = new FilterIndex();
      idx.add("doc1", "price", 1000);
      idx.add("doc2", "price", 2000);
      idx.add("doc3", "price", 3000);

      const result = idx.getRange("price", 1000, undefined, false, true);
      expect([...result].sort()).toEqual(["doc2", "doc3"]);
    });

    it("handles lt (exclusive max)", () => {
      const idx = new FilterIndex();
      idx.add("doc1", "price", 1000);
      idx.add("doc2", "price", 2000);
      idx.add("doc3", "price", 3000);

      const result = idx.getRange("price", undefined, 3000, true, false);
      expect([...result].sort()).toEqual(["doc1", "doc2"]);
    });
  });

  describe("removeDoc", () => {
    it("cleans up all entries for a document", () => {
      const idx = new FilterIndex();
      idx.add("doc1", "category", "Footwear");
      idx.add("doc1", "price", 7500);
      idx.add("doc2", "category", "Clothing");

      idx.removeDoc("doc1");

      expect(idx.getEq("category", "Footwear")).toBeUndefined();
      expect(idx.getEq("category", "Clothing")).toBeDefined();
      expect([...idx.getEq("category", "Clothing")!]).toEqual(["doc2"]);
      expect(idx.getRange("price", 7000, 8000, true, true).size).toBe(0);
    });

    it("handles removing non-existent doc", () => {
      const idx = new FilterIndex();
      expect(() => idx.removeDoc("nonexistent")).not.toThrow();
    });
  });

  describe("exists", () => {
    it("returns all docs that have a field value", () => {
      const idx = new FilterIndex();
      idx.add("doc1", "category", "Footwear");
      idx.add("doc2", "category", "Clothing");
      idx.add("doc3", "price", 5000);

      const result = idx.getExists("category");
      expect([...result].sort()).toEqual(["doc1", "doc2"]);
    });

    it("returns empty set for field with no entries", () => {
      const idx = new FilterIndex();
      idx.add("doc1", "category", "Footwear");
      expect(idx.getExists("nonexistent").size).toBe(0);
    });
  });

  describe("getAllDocIds", () => {
    it("returns all document IDs", () => {
      const idx = new FilterIndex();
      idx.add("doc1", "category", "Footwear");
      idx.add("doc2", "price", 5000);
      idx.add("doc3", "category", "Clothing");

      expect([...idx.getAllDocIds()].sort()).toEqual(["doc1", "doc2", "doc3"]);
    });
  });

  describe("clear", () => {
    it("resets all state", () => {
      const idx = new FilterIndex();
      idx.add("doc1", "category", "Footwear");
      idx.clear();
      expect(idx.getAllDocIds().size).toBe(0);
      expect(idx.getEq("category", "Footwear")).toBeUndefined();
    });
  });

  describe("mixed operations", () => {
    it("handles add, remove, and re-add correctly", () => {
      const idx = new FilterIndex();
      idx.add("doc1", "category", "Footwear");
      idx.remove("doc1", "category", "Footwear");
      expect(idx.getEq("category", "Footwear")).toBeUndefined();
      expect(idx.getExists("category").size).toBe(0);

      idx.add("doc1", "category", "Clothing");
      expect([...idx.getEq("category", "Clothing")!]).toEqual(["doc1"]);
    });
  });
});
