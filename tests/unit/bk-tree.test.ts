import { describe, it, expect } from "vitest";
import { BKTree } from "../../src/indexing/bk-tree";

describe("BKTree", () => {
  it("returns exact match with distance 0", () => {
    const tree = new BKTree();
    tree.insert("hello");
    const results = tree.search("hello", 2);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ term: "hello", distance: 0 });
  });

  it("finds single-edit variations with maxDistance 1", () => {
    const tree = new BKTree();
    tree.insert("hello");
    tree.insert("hallo");
    tree.insert("hullo");
    tree.insert("world");
    const results = tree.search("hello", 1);
    expect(results.some((r) => r.term === "hello" && r.distance === 0)).toBe(true);
    expect(results.some((r) => r.term === "hallo" && r.distance === 1)).toBe(true);
    expect(results.some((r) => r.term === "hullo" && r.distance === 1)).toBe(true);
    expect(results.some((r) => r.term === "world")).toBe(false);
  });

  it("finds double-edit variations with maxDistance 2", () => {
    const tree = new BKTree();
    tree.insert("hello");
    tree.insert("hallo");
    tree.insert("hollp");
    tree.insert("world");
    const results = tree.search("hello", 2);
    expect(results.some((r) => r.term === "hello" && r.distance === 0)).toBe(true);
    expect(results.some((r) => r.term === "hallo" && r.distance === 1)).toBe(true);
    expect(results.some((r) => r.term === "hollp" && r.distance === 2)).toBe(true);
  });

  it("returns empty for terms beyond maxDistance", () => {
    const tree = new BKTree();
    tree.insert("hello");
    tree.insert("help");
    const results = tree.search("xyz", 2);
    expect(results).toHaveLength(0);
  });

  it("multiple inserts and search consistency", () => {
    const tree = new BKTree();
    const words = ["cat", "car", "cart", "care", "bat", "bar", "bart", "cut"];
    for (const w of words) tree.insert(w);
    const results = tree.search("cat", 1);
    expect(results.some((r) => r.term === "cat")).toBe(true);
    expect(results.some((r) => r.term === "car")).toBe(true);
    expect(results.some((r) => r.term === "cut")).toBe(true);
    expect(results.some((r) => r.term === "bat")).toBe(true);
    expect(results.every((r) => r.distance <= 1)).toBe(true);
  });

  it("clear resets tree", () => {
    const tree = new BKTree();
    tree.insert("hello");
    tree.insert("world");
    expect(tree.size).toBe(2);
    tree.clear();
    expect(tree.size).toBe(0);
    expect(tree.search("hello", 2)).toHaveLength(0);
  });

  it("sorts results by distance then alphabetically", () => {
    const tree = new BKTree();
    tree.insert("hello");
    tree.insert("hallo");
    tree.insert("hullo");
    tree.insert("hillo");
    const results = tree.search("hello", 2);
    for (let i = 1; i < results.length; i++) {
      if (results[i].distance === results[i - 1].distance) {
        expect(results[i].term.localeCompare(results[i - 1].term)).toBeGreaterThanOrEqual(0);
      } else {
        expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
      }
    }
  });
});
