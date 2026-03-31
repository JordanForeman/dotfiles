/**
 * SessionHealthMonitor — collects behavioral signals to assess session quality.
 *
 * Signals tracked:
 *  1. Context pressure     — % of context window consumed (passed in externally)
 *  2. Tool error rate      — rolling window of recent tool call success/failure
 *  3. File re-read ratio   — files read again that were already read this session
 *  4. Repetition score     — similarity of recent tool call patterns across turns
 *  5. Hedging score        — confidence-decay markers in assistant messages
 *
 * These combine into a composite health score (1 = healthy, 0 = degraded).
 */

// ─── Configuration ───────────────────────────────────────────────────────────

/** Rolling window size for tool call tracking */
const TOOL_WINDOW = 20;

/** Number of recent turns to compare for repetition detection */
const REPETITION_WINDOW = 4;

/** Number of recent assistant messages to scan for hedging */
const HEDGING_WINDOW = 5;

/** Weights for composite health score (must sum to ~1.0) */
const WEIGHTS = {
  contextPressure: 0.30,
  toolErrorRate:   0.20,
  reReadRatio:     0.15,
  repetitionScore: 0.20,
  hedgingScore:    0.15,
};

// ─── Hedging patterns ────────────────────────────────────────────────────────

const HEDGING_PATTERNS: RegExp[] = [
  /\bi think\b/i,
  /\bperhaps\b/i,
  /\bmaybe\b/i,
  /\bpossibly\b/i,
  /\bi('m| am) not (entirely |completely |fully )?sure\b/i,
  /\blet me try\b/i,
  /\bi('ll| will) try\b/i,
  /\bi apologi[zs]e\b/i,
  /\bsorry\b/i,
  /\bactually,?\s/i,
  /\bwait,?\s/i,
  /\bcorrection\b/i,
  /\blet me reconsider\b/i,
  /\bas (i |we )?(previously |already )?mentioned\b/i,
  /\bi (believe|suspect)\b/i,
];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SignalSnapshot {
  contextPressure: number;
  toolErrorRate: number;
  toolErrorCount: number;
  toolCallCount: number;
  reReadRatio: number;
  reReadCount: number;
  totalReads: number;
  repetitionScore: number;
  hedgingScore: number;
}

export interface HealthReport {
  /** Composite health score: 1 = healthy, 0 = fully degraded */
  health: number;
  /** Context pressure passed in from the extension */
  contextPressure: number;
  /** Individual signal values */
  signals: SignalSnapshot;
}

// ─── Monitor ─────────────────────────────────────────────────────────────────

export class SessionHealthMonitor {
  // Tool tracking (rolling window)
  private toolResults: Array<{ name: string; isError: boolean }> = [];

  // File read tracking (session-wide)
  private filesRead = new Set<string>();
  private fileReadCounts = new Map<string, number>();
  private totalReads = 0;

  // Turn-level tool call pattern tracking (for repetition)
  private turnToolPatterns: string[][] = [];
  private currentTurnTools: string[] = [];

  // Assistant message tracking (for hedging)
  private recentAssistantMessages: string[] = [];

  // Turn counter
  private turns = 0;

  /** Reset all state (e.g. after compaction or new session) */
  reset(): void {
    this.toolResults = [];
    this.filesRead.clear();
    this.fileReadCounts.clear();
    this.totalReads = 0;
    this.turnToolPatterns = [];
    this.currentTurnTools = [];
    this.recentAssistantMessages = [];
    this.turns = 0;
  }

  // ── Signal collection ──────────────────────────────────────────────────

  trackToolResult(name: string, isError: boolean): void {
    this.toolResults.push({ name, isError });
    // Keep rolling window
    if (this.toolResults.length > TOOL_WINDOW) {
      this.toolResults.shift();
    }
    // Also record in current turn pattern
    this.currentTurnTools.push(`${name}:${isError ? "err" : "ok"}`);
  }

  trackFileRead(filePath: string): void {
    const normalized = filePath.replace(/^\.\//, "");
    this.totalReads++;
    const count = (this.fileReadCounts.get(normalized) ?? 0) + 1;
    this.fileReadCounts.set(normalized, count);
    this.filesRead.add(normalized);
  }

  trackAssistantMessage(text: string): void {
    this.recentAssistantMessages.push(text);
    if (this.recentAssistantMessages.length > HEDGING_WINDOW) {
      this.recentAssistantMessages.shift();
    }
  }

  trackTurn(): void {
    this.turns++;
    // Snapshot current turn's tool pattern
    this.turnToolPatterns.push([...this.currentTurnTools]);
    if (this.turnToolPatterns.length > REPETITION_WINDOW) {
      this.turnToolPatterns.shift();
    }
    this.currentTurnTools = [];
  }

  // ── Signal computation ─────────────────────────────────────────────────

  private computeToolErrorRate(): { rate: number; errors: number; total: number } {
    if (this.toolResults.length === 0) return { rate: 0, errors: 0, total: 0 };
    const errors = this.toolResults.filter((r) => r.isError).length;
    return {
      rate: errors / this.toolResults.length,
      errors,
      total: this.toolResults.length,
    };
  }

  private computeReReadRatio(): { ratio: number; reReads: number } {
    if (this.totalReads === 0) return { ratio: 0, reReads: 0 };
    let reReads = 0;
    for (const count of this.fileReadCounts.values()) {
      if (count > 1) reReads++;
    }
    // Ratio of files that were read more than once vs total unique files
    const uniqueFiles = this.filesRead.size;
    if (uniqueFiles === 0) return { ratio: 0, reReads: 0 };
    return { ratio: reReads / uniqueFiles, reReads };
  }

  private computeRepetitionScore(): number {
    if (this.turnToolPatterns.length < 2) return 0;

    // Compare each adjacent pair of turn patterns using Jaccard similarity
    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 1; i < this.turnToolPatterns.length; i++) {
      const prev = new Set(this.turnToolPatterns[i - 1]);
      const curr = new Set(this.turnToolPatterns[i]);

      if (prev.size === 0 && curr.size === 0) continue;

      const union = new Set([...prev, ...curr]);
      const intersection = [...curr].filter((x) => prev.has(x)).length;

      totalSimilarity += intersection / union.size;
      comparisons++;
    }

    return comparisons === 0 ? 0 : totalSimilarity / comparisons;
  }

  private computeHedgingScore(): number {
    if (this.recentAssistantMessages.length === 0) return 0;

    let totalHits = 0;
    let totalChecks = 0;

    for (const msg of this.recentAssistantMessages) {
      // Normalize: only check first ~2000 chars to avoid over-weighting long messages
      const sample = msg.slice(0, 2000);
      const words = sample.split(/\s+/).length;
      if (words < 10) continue; // Skip very short messages

      let hits = 0;
      for (const pattern of HEDGING_PATTERNS) {
        const matches = sample.match(new RegExp(pattern, "gi"));
        if (matches) hits += matches.length;
      }

      // Normalize by message length (hits per 100 words)
      const normalizedRate = Math.min(1, (hits / words) * 20);
      totalHits += normalizedRate;
      totalChecks++;
    }

    return totalChecks === 0 ? 0 : totalHits / totalChecks;
  }

  // ── Composite report ───────────────────────────────────────────────────

  getReport(contextPressure: number): HealthReport {
    const toolError = this.computeToolErrorRate();
    const reRead = this.computeReReadRatio();
    const repetitionScore = this.computeRepetitionScore();
    const hedgingScore = this.computeHedgingScore();

    const signals: SignalSnapshot = {
      contextPressure,
      toolErrorRate: toolError.rate,
      toolErrorCount: toolError.errors,
      toolCallCount: toolError.total,
      reReadRatio: reRead.ratio,
      reReadCount: reRead.reReads,
      totalReads: this.totalReads,
      repetitionScore,
      hedgingScore,
    };

    // Composite health: 1 = healthy, 0 = degraded
    // Each signal is a degradation indicator (higher = worse), so health = 1 - weighted_sum
    const degradation =
      WEIGHTS.contextPressure * contextPressure +
      WEIGHTS.toolErrorRate * toolError.rate +
      WEIGHTS.reReadRatio * reRead.ratio +
      WEIGHTS.repetitionScore * repetitionScore +
      WEIGHTS.hedgingScore * hedgingScore;

    const health = Math.max(0, Math.min(1, 1 - degradation));

    return { health, contextPressure, signals };
  }
}
