export const ANALYSIS_JOB_QUEUE = Symbol('ANALYSIS_JOB_QUEUE');

export interface AnalysisJobQueue {
  enqueue(jobId: string): void;
}