// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — Levenshtein Distance (optimised, early-exit)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the Levenshtein edit distance between two strings.
 * Uses a memory-optimised two-row DP approach.
 * Exits early if the minimum possible distance exceeds `maxDistance`.
 *
 * @param a         Source string
 * @param b         Target string
 * @param maxDist   Maximum allowed distance. Returns Infinity if exceeded.
 * @returns         Edit distance, or Infinity if > maxDist
 */
export function levenshtein(a: string, b: string, maxDist = 2): number {
  const la = a.length;
  const lb = b.length;

  // Quick exits
  if (a === b) return 0;
  if (Math.abs(la - lb) > maxDist) return Infinity;
  if (la === 0) return lb <= maxDist ? lb : Infinity;
  if (lb === 0) return la <= maxDist ? la : Infinity;

  // Two-row DP
  let prev = new Uint32Array(lb + 1);
  let curr = new Uint32Array(lb + 1);

  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    let rowMin = i;

    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }

    // Early exit: if minimum in row exceeds maxDist, no point continuing
    if (rowMin > maxDist) return Infinity;

    // Swap rows
    [prev, curr] = [curr, prev];
  }

  const dist = prev[lb];
  return dist <= maxDist ? dist : Infinity;
}

/**
 * Returns true if `term` is within `maxDist` edits of `target`.
 */
export function isFuzzyMatch(
  term: string,
  target: string,
  maxDist: number
): boolean {
  return levenshtein(term, target, maxDist) <= maxDist;
}

/**
 * Compute an adaptive max distance based on word length:
 *  - len < 4  → 0 (must be exact)
 *  - len 4–6  → 1
 *  - len >= 7 → 2
 */
export function adaptiveMaxDistance(term: string, configured: number): number {
  const len = term.length;
  if (len < 4) return 0;
  if (len <= 6) return Math.min(1, configured);
  return Math.min(configured, 2);
}
