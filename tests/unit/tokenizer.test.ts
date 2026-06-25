import { describe, it, expect } from "vitest";
import {
  defaultTokenizer,
  buildTokenizer,
  normalizeTerm,
} from "../../src/core/tokenizer";

describe("defaultTokenizer", () => {
  it("splits on whitespace and punctuation, lowercases, removes stopwords", () => {
    const result = defaultTokenizer("The quick brown fox jumps over the lazy dog");
    expect(result).toEqual(["quick", "brown", "fox", "jumps", "over", "lazy", "dog"]);
  });

  it("removes stopwords like 'the', 'a', 'is'", () => {
    const result = defaultTokenizer("a apple is on the table");
    expect(result).toEqual(["apple", "table"]);
  });

  it("returns empty array for empty string", () => {
    expect(defaultTokenizer("")).toEqual([]);
  });

  it("returns empty array for text with only stopwords", () => {
    expect(defaultTokenizer("the a an is are it")).toEqual([]);
  });

  it("handles punctuation correctly", () => {
    const result = defaultTokenizer("hello, world! how's it going?");
    expect(result).toEqual(["hello", "world", "how's", "going"]);
  });

  it("returns empty array for null/undefined input", () => {
    expect(defaultTokenizer(null as unknown as string)).toEqual([]);
    expect(defaultTokenizer(undefined as unknown as string)).toEqual([]);
  });

  it("keeps stopwords when stripStopwords is false", () => {
    const result = defaultTokenizer("the cat is here", false);
    expect(result).toEqual(["the", "cat", "is", "here"]);
  });

  it("filters out single-character tokens when stripping stopwords", () => {
    const result = defaultTokenizer("a b c hello");
    expect(result).toEqual(["hello"]);
  });
});

describe("buildTokenizer", () => {
  it("uses custom tokenizer function when provided", () => {
    const custom = (text: string) => text.split(" ");
    const tokenizer = buildTokenizer(custom);
    expect(tokenizer("hello world")).toEqual(["hello", "world"]);
  });

  it('uses default with stopwords when language="en"', () => {
    const tokenizer = buildTokenizer(undefined, "en");
    const result = tokenizer("the quick brown fox");
    expect(result).toEqual(["quick", "brown", "fox"]);
  });

  it('disables stopword removal when language="none"', () => {
    const tokenizer = buildTokenizer(undefined, "none");
    const result = tokenizer("the quick brown fox");
    expect(result).toEqual(["the", "quick", "brown", "fox"]);
  });
});

describe("normalizeTerm", () => {
  it("lowercases the term", () => {
    expect(normalizeTerm("Hello")).toBe("hello");
  });

  it("strips leading/trailing whitespace", () => {
    expect(normalizeTerm("  Hello  ")).toBe("hello");
  });

  it("handles mixed case and spaces", () => {
    expect(normalizeTerm("  The Quick  ")).toBe("the quick");
  });
});
