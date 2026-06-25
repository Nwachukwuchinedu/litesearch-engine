import { describe, it, expect } from "vitest";
import {
  levenshtein,
  adaptiveMaxDistance,
  isFuzzyMatch,
} from "../../src/core/levenshtein";

describe("levenshtein", () => {
  it("returns 0 for exact match", () => {
    expect(levenshtein("cat", "cat")).toBe(0);
  });

  it("returns distance 1 for single substitution", () => {
    expect(levenshtein("cat", "car")).toBe(1);
  });

  it("returns distance 1 for single insertion", () => {
    expect(levenshtein("cat", "cast")).toBe(1);
  });

  it("returns distance 1 for single deletion", () => {
    expect(levenshtein("cast", "cat")).toBe(1);
  });

  it("returns distance 2 for kitten vs sitting", () => {
    expect(levenshtein("kitten", "sitting", 3)).toBe(3);
  });

  it("returns Infinity when early exit exceeds maxDist", () => {
    expect(levenshtein("abcdefgh", "xyz", 2)).toBe(Infinity);
  });

  it("returns distance <= maxDist when within threshold", () => {
    expect(levenshtein("hello", "hallo", 1)).toBe(1);
    expect(levenshtein("hello", "hxllo", 2)).toBe(1);
  });

  it("handles empty strings", () => {
    expect(levenshtein("", "abc", 3)).toBe(3);
    expect(levenshtein("abc", "", 3)).toBe(3);
    expect(levenshtein("", "", 0)).toBe(0);
  });

  it("uses default maxDist of 2", () => {
    expect(levenshtein("hello", "hxllo")).toBe(1);
    expect(levenshtein("hello", "hxxlo")).toBe(2);
    expect(levenshtein("hello", "xxxxx")).toBe(Infinity);
  });
});

describe("adaptiveMaxDistance", () => {
  it("returns 0 for words shorter than 4 characters", () => {
    expect(adaptiveMaxDistance("cat", 2)).toBe(0);
    expect(adaptiveMaxDistance("at", 2)).toBe(0);
  });

  it("returns 1 for words of length 4-6", () => {
    expect(adaptiveMaxDistance("hello", 2)).toBe(1);
    expect(adaptiveMaxDistance("test", 2)).toBe(1);
    expect(adaptiveMaxDistance("welcome", 2)).toBe(2);
  });

  it("returns min(configured, 2) for words >= 7", () => {
    expect(adaptiveMaxDistance("elephant", 2)).toBe(2);
    expect(adaptiveMaxDistance("elephant", 1)).toBe(1);
  });
});

describe("isFuzzyMatch", () => {
  it("returns true when edit distance is within threshold", () => {
    expect(isFuzzyMatch("hello", "hallo", 1)).toBe(true);
    expect(isFuzzyMatch("hello", "hxllo", 2)).toBe(true);
  });

  it("returns false when edit distance exceeds threshold", () => {
    expect(isFuzzyMatch("hello", "world", 2)).toBe(false);
    expect(isFuzzyMatch("cat", "dog", 2)).toBe(false);
  });

  it("returns true for exact match with any threshold", () => {
    expect(isFuzzyMatch("hello", "hello", 0)).toBe(true);
    expect(isFuzzyMatch("hello", "hello", 2)).toBe(true);
  });
});
