/**
 * Minimal BM25 (Okapi BM25) implementation for indexing MCP tool descriptions.
 *
 * Parameters: k1=1.5, b=0.75 (standard defaults).
 * Tokenisation: lowercase, split on non-alphanumerics, filter empties.
 */
export class BM25Index {
  private readonly k1 = 1.5;
  private readonly b = 0.75;

  private readonly tf: Map<string, number>[] = [];
  private readonly df = new Map<string, number>();
  private avgDocLen = 0;

  /**
   * Add all documents at once. After calling this, search is available.
   * Documents are indexed in insertion order; search returns their indices.
   */
  add(docs: ReadonlyArray<string>): void {
    const docTerms = docs.map((d) => this.tokenize(d));

    let totalLen = 0;
    for (const terms of docTerms) {
      totalLen += terms.length;
      const freqs = new Map<string, number>();
      for (const term of terms) {
        freqs.set(term, (freqs.get(term) ?? 0) + 1);
      }
      this.tf.push(freqs);
      for (const term of freqs.keys()) {
        this.df.set(term, (this.df.get(term) ?? 0) + 1);
      }
    }
    this.avgDocLen = docTerms.length > 0 ? totalLen / docTerms.length : 0;
  }

  /**
   * Returns up to `limit` document indices ranked by BM25 score (highest first).
   * Returns an empty array if the index is empty or the query matches nothing.
   */
  search(query: string, limit: number): ReadonlyArray<number> {
    const n = this.tf.length;
    if (n === 0) return [];

    const queryTerms = this.tokenize(query);
    const scores: number[] = [];
    for (let i = 0; i < n; i++) {
      scores.push(0);
    }

    for (const term of queryTerms) {
      const df = this.df.get(term) ?? 0;
      if (df === 0) continue;
      const idf = Math.log((n - df + 0.5) / (df + 0.5) + 1);

      for (let i = 0; i < n; i++) {
        const freq = this.tf[i].get(term) ?? 0;
        if (freq === 0) continue;
        const docLen = this.docLen(i);
        const numerator = freq * (this.k1 + 1);
        const denominator = freq + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLen));
        scores[i] += idf * (numerator / denominator);
      }
    }

    const indices = scores
      .map((score, idx) => ({ score, idx }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ idx }) => idx);

    return indices;
  }

  tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 0);
  }

  private docLen(idx: number): number {
    let len = 0;
    for (const count of this.tf[idx].values()) {
      len += count;
    }
    return len;
  }
}
