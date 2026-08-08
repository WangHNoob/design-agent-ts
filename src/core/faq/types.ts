export interface FaqMatchRaw {
  readonly hit: boolean;
  readonly score: number;
  readonly answer?: string;
  readonly faqId?: string;
  readonly question?: string;
  readonly projectId?: string;
}

export type FaqDecision =
  | {
      readonly ok: true;
      readonly score: number;
      readonly answer: string;
      readonly faqId?: string;
      readonly question?: string;
    }
  | {
      readonly ok: false;
      readonly reason:
        | "provider_miss"
        | "below_threshold"
        | "empty_answer"
        | "invalid";
    };
