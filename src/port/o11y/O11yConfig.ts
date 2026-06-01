export interface O11yConfig {
  readonly enabled: boolean;
  readonly baseUrl: string;
  readonly flushIntervalMs: number;
  readonly batchSize: number;
}
