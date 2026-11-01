// Mirrors schemas/*.schema.json. Keep in sync; pipeline/validate_data.py checks the JSON.

export type RatingValue = 0 | 0.5 | 1;
export type XStatus = "CURRENTLY_RATED_HELPFUL" | "CURRENTLY_RATED_NOT_HELPFUL" | "NEEDS_MORE_RATINGS";
export type Verdict = "HELPFUL" | "NOT_HELPFUL" | "UNDECIDED";
export type Side = "A" | "B" | "C";

export interface ModelConfig {
  mu: number;
  lambdaIntercept: number;
  lambdaFactor: number;
  helpfulInterceptMin: number;
  /** Optional; calibrated on the real sample. Falls back to -0.05. */
  notHelpfulInterceptMax?: number;
  maxAbsFactor: number;
  minRatings: number;
  ratingValues: { HELPFUL: 1; SOMEWHAT_HELPFUL: 0.5; NOT_HELPFUL: 0 };
}

export interface NoteRating {
  raterId: string;
  value: RatingValue;
  hoursAfterNote: number;
  raterIntercept: number;
  raterFactor: number;
}

export interface ShowcaseNote {
  /** Set by the loader from the raw text (links included): plain English, no charged topic. */
  plainEnglish?: boolean;
  id: string;
  noteId: string;
  tweetId: string;
  summary: string;
  classification: "MISINFORMED_OR_POTENTIALLY_MISLEADING" | "NOT_MISLEADING";
  timeline: {
    postCreatedAtMs: number | null;
    noteCreatedAtMs: number;
    statusChangedAtMs: number | null;
    finalStatus: XStatus;
    hoursPostToNote: number | null;
    hoursNoteToStatus: number | null;
  };
  fitted: { intercept: number; factor: number; verdict: Verdict };
  ratings: NoteRating[];
  replay: {
    kActual: number | null;
    kRandomMedian: number | null;
    kTargeted: number | null;
    hoursToKActual: number | null;
    targetedOrder?: string[];
  };
}

export interface ShowcaseFile {
  schemaVersion: 1;
  isMock: boolean;
  generatedAt: string;
  model: ModelConfig;
  calibrationNoteIds: string[];
  notes: ShowcaseNote[];
}

export interface RaterProfile {
  id: string;
  intercept: number;
  factor: number;
  side: Side;
  nRatings: number;
  isSampleViewer?: boolean;
}

export interface RatersFile {
  schemaVersion: 1;
  isMock: boolean;
  generatedAt: string;
  sideThreshold: number;
  raters: RaterProfile[];
}

export interface PerNoteResult {
  noteId: string;
  nRatings: number;
  xStatus: XStatus;
  ourVerdict: Verdict;
  kActual: number | null;
  kRandomMedian: number | null;
  kTargeted: number | null;
  hoursToKActual: number | null;
  hoursNoteToStatus: number | null;
}

export interface ResultsFile {
  schemaVersion: 1;
  isMock: boolean;
  generatedAt: string;
  sample: {
    ratingsFiles: string[];
    dataSnapshotDate?: string | null;
    nNotes: number;
    nHelpfulNotes: number;
    nNmrNotes: number;
    nRatings: number;
    nRaters: number;
    minRatingsPerNote: number;
    minRatingsPerRater: number;
    nShuffles: number;
  };
  modelAgreement: { pctAgreement: number; nCompared: number; confusion: Record<string, number> };
  summary: {
    nReplayed: number;
    medianKTargeted: number;
    medianKRandom: number;
    medianKActual: number;
    medianHoursToKActual: number;
    medianHoursNoteToStatus: number;
    pctTargetedFaster: number;
    pctTargetedNoSlower: number;
  };
  perNote: PerNoteResult[];
}
