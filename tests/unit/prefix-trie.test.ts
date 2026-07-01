import { describe, it, expect } from "vitest";
import { PrefixTrie } from "../../src/indexing/prefix-trie";

describe("PrefixTrie", () => {
  it("inserts a term and searches with exact prefix returns it", () => {
    const trie = new PrefixTrie();
    trie.insert("hello");
    expect(trie.search("hello")).toEqual(["hello"]);
    expect(trie.search("hell")).toEqual(["hello"]);
  });

  it("search with prefix that has multiple terms returns all of them", () => {
    const trie = new PrefixTrie();
    trie.insert("hello");
    trie.insert("hell");
    trie.insert("help");
    trie.insert("world");
    const results = trie.search("hel");
    expect(results).toHaveLength(3);
    expect(results).toContain("hello");
    expect(results).toContain("hell");
    expect(results).toContain("help");
  });

  it("search with non-existent prefix returns empty array", () => {
    const trie = new PrefixTrie();
    trie.insert("hello");
    expect(trie.search("xyz")).toEqual([]);
  });

  it("delete a term, search no longer returns it", () => {
    const trie = new PrefixTrie();
    trie.insert("hello");
    trie.insert("world");
    expect(trie.delete("hello")).toBe(true);
    expect(trie.search("hel")).toEqual([]);
    expect(trie.search("wo")).toEqual(["world"]);
  });

  it("multiple deletes work correctly", () => {
    const trie = new PrefixTrie();
    trie.insert("hello");
    trie.insert("hell");
    trie.insert("help");
    trie.insert("world");

    expect(trie.delete("hell")).toBe(true);
    expect(trie.delete("help")).toBe(true);
    expect(trie.delete("hello")).toBe(true);

    expect(trie.search("hel")).toEqual([]);
    expect(trie.search("wo")).toEqual(["world"]);
    expect(trie.size).toBe(1);
  });

  it("clear resets trie", () => {
    const trie = new PrefixTrie();
    trie.insert("hello");
    trie.insert("world");
    expect(trie.size).toBe(2);
    trie.clear();
    expect(trie.size).toBe(0);
    expect(trie.search("hel")).toEqual([]);
    expect(trie.search("wo")).toEqual([]);
  });

  it("has returns correct status", () => {
    const trie = new PrefixTrie();
    trie.insert("hello");
    expect(trie.has("hello")).toBe(true);
    expect(trie.has("hell")).toBe(false);
    expect(trie.has("world")).toBe(false);
  });

  it("delete returns false for non-existent term", () => {
    const trie = new PrefixTrie();
    expect(trie.delete("nonexistent")).toBe(false);
  });

  it("delete a term that shares prefix with others", () => {
    const trie = new PrefixTrie();
    trie.insert("testing");
    trie.insert("tested");
    trie.insert("tester");
    trie.delete("tester");
    const results = trie.search("test");
    expect(results).toHaveLength(2);
    expect(results).toContain("testing");
    expect(results).toContain("tested");
    expect(results).not.toContain("tester");
  });

  it("empty trie search returns empty array", () => {
    const trie = new PrefixTrie();
    expect(trie.search("")).toEqual([]);
    expect(trie.search("a")).toEqual([]);
  });

  it("size tracks unique terms", () => {
    const trie = new PrefixTrie();
    expect(trie.size).toBe(0);
    trie.insert("hello");
    expect(trie.size).toBe(1);
    trie.insert("hello");
    expect(trie.size).toBe(1);
    trie.insert("world");
    expect(trie.size).toBe(2);
  });
});
