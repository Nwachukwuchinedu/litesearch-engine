// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — BM25+ Scorer
// ─────────────────────────────────────────────────────────────────────────────
// BM25 is the algorithm behind most modern search engines (Lucene, Elasticsearch).
// It improves on TF-IDF by:
//   1. Capping term frequency saturation (k1 parameter)
//   2. Normalising for field length (b parameter)
//   3. Penalising very long documents proportionally
// ─────────────────────────────────────────────────────────────────────────────

import type { DocMeta, Postings } from "../types/index";

export interface BM25Config {
  k1: number;  // Term frequency saturation. Typical: 1.2
  b: number;   // Length normalisation. Typical: 0.75
}

export const DEFAULT_BM25: BM25Config = { k1: 1.2, b: 0.75 };

export class BM25Scorer {
  private k1: number;
  private b: number;

  constructor(config: Partial<BM25Config> = {}) {
    this.k1 = config.k1 ?? DEFAULT_BM25.k1;
    this.b  = config.b  ?? DEFAULT_BM25.b;
  }

  /**
   * Compute the BM25 score for a single term across a set of matching docs.
   *
   * @param term         The query term
   * @param postings     Map of docId → positions[] for this term
   * @param docMetas     All document metadata (for field lengths)
   * @param field        Which field we're scoring
   * @param avgFieldLen  Average field length across all docs
   * @param N            Total number of documents
   * @param weight       Field weight multiplier
   */
  scoreField(
    postings: Postings,
    docMetas: ReadonlyMap<string, DocMeta>,
    field: string,
    avgFieldLen: number,
    N: number,
    weight: number
  ): Map<string, number> {
    const scores = new Map<string, number>();
    const df = postings.size; // document frequency

    if (df === 0) return scores;

    // IDF component: log((N - df + 0.5) / (df + 0.5) + 1)
    const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

    for (const [docId, positions] of postings) {
      const meta = docMetas.get(docId);
      if (!meta) continue;

      const tf = positions.length; // raw term frequency
      const fieldLen = meta.fieldLengths[field] ?? 1;

      // BM25 TF normalisation
      const tfNorm =
        (tf * (this.k1 + 1)) /
        (tf + this.k1 * (1 - this.b + this.b * (fieldLen / avgFieldLen)));

      const score = idf * tfNorm * weight;
      scores.set(docId, (scores.get(docId) ?? 0) + score);
    }

    return scores;
  }

  /**
   * Merge per-field scores into a single doc score map.
   * Accumulates scores across fields.
   */
  static mergeScores(
    fieldScores: Map<string, number>[],
    target: Map<string, number> = new Map()
  ): Map<string, number> {
    for (const fs of fieldScores) {
      for (const [docId, score] of fs) {
        target.set(docId, (target.get(docId) ?? 0) + score);
      }
    }
    return target;
  }

  /**
   * Normalise scores to [0, 1] range.
   */
  static normalise(scores: Map<string, number>): Map<string, number> {
    if (scores.size === 0) return scores;

    let max = 0;
    for (const s of scores.values()) {
      if (s > max) max = s;
    }

    if (max === 0) return scores;

    const out = new Map<string, number>();
    for (const [id, s] of scores) {
      out.set(id, s / max);
    }
    return out;
  }

  /**
   * Apply an exact-match boost on top of existing scores.
   * Documents where the query matches exactly (as a whole string) get a 1.5× boost.
   */
  static applyExactBoost(
    scores: Map<string, number>,
    exactMatchIds: Set<string>,
    boostFactor = 1.5
  ): Map<string, number> {
    for (const id of exactMatchIds) {
      if (scores.has(id)) {
        scores.set(id, scores.get(id)! * boostFactor);
      }
    }
    return scores;
  }
}
