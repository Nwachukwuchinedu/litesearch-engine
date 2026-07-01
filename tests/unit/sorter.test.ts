import { describe, it, expect } from "vitest";
import { topKDocuments, sortDocuments } from "../../src/search/sorter";
import type { AnyDocument, SortOption } from "../../src/types/index";

interface TestDoc extends AnyDocument {
  id: string;
  score: number;
  title: string;
}

describe("topKDocuments", () => {
  const docs: TestDoc[] = [
    { id: "a", score: 10, title: "Alpha" },
    { id: "b", score: 30, title: "Bravo" },
    { id: "c", score: 20, title: "Charlie" },
    { id: "d", score: 50, title: "Delta" },
    { id: "e", score: 40, title: "Echo" },
  ];

  const sortByScore: SortOption = { field: "score", direction: "desc", type: "number" };

  it("returns top K items by score (desc)", () => {
    const top3 = topKDocuments(docs, sortByScore, 3);
    expect(top3).toHaveLength(3);
    expect(top3[0].id).toBe("d");
    expect(top3[1].id).toBe("e");
    expect(top3[2].id).toBe("b");
  });

  it("returns top K items by score (asc)", () => {
    const sortAsc: SortOption = { field: "score", direction: "asc", type: "number" };
    const top3 = topKDocuments(docs, sortAsc, 3);
    expect(top3).toHaveLength(3);
    expect(top3[0].id).toBe("a");
    expect(top3[1].id).toBe("c");
    expect(top3[2].id).toBe("b");
  });

  it("returns all items when k >= docs.length", () => {
    const result = topKDocuments(docs, sortByScore, 10);
    expect(result).toHaveLength(5);
    expect(result[0].id).toBe("d");
    expect(result[4].id).toBe("a");
  });

  it("returns all items when k === docs.length", () => {
    const result = topKDocuments(docs, sortByScore, 5);
    expect(result).toHaveLength(5);
  });

  it("returns empty array when k = 0", () => {
    const result = topKDocuments(docs, sortByScore, 0);
    expect(result).toEqual([]);
  });

  it("returns empty array when k < 0", () => {
    const result = topKDocuments(docs, sortByScore, -1);
    expect(result).toEqual([]);
  });

  it("handles string field sorting", () => {
    const sortByTitle: SortOption = { field: "title", direction: "asc", type: "string" };
    const top3 = topKDocuments(docs, sortByTitle, 3);
    expect(top3).toHaveLength(3);
    expect(top3[0].id).toBe("a");
    expect(top3[1].id).toBe("b");
    expect(top3[2].id).toBe("c");
  });

  it("handles string field sorting desc", () => {
    const sortByTitle: SortOption = { field: "title", direction: "desc", type: "string" };
    const top3 = topKDocuments(docs, sortByTitle, 3);
    expect(top3).toHaveLength(3);
    expect(top3[0].id).toBe("e");
    expect(top3[1].id).toBe("d");
    expect(top3[2].id).toBe("c");
  });

  it("matches sortDocuments output for the same input", () => {
    const allDesc = sortDocuments(docs, { field: "score", direction: "desc", type: "number" });
    const top5 = topKDocuments(docs, { field: "score", direction: "desc", type: "number" }, 5);
    expect(top5).toEqual(allDesc);
  });
});

describe("sortDocuments (unchanged)", () => {
  it("still works for browse compatibility", () => {
    const docs: Array<{ id: string; price: number }> = [
      { id: "a", price: 30 },
      { id: "b", price: 10 },
      { id: "c", price: 20 },
    ];
    const sorted = sortDocuments(docs, { field: "price", direction: "asc", type: "number" });
    expect(sorted[0].id).toBe("b");
    expect(sorted[1].id).toBe("c");
    expect(sorted[2].id).toBe("a");
  });
});
