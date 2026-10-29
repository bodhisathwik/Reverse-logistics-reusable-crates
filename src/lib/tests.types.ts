export interface TestResult {
  group: string;
  name: string;
  assertion: string;
  passed: boolean;
  ms: number;
  detail?: string;
}
