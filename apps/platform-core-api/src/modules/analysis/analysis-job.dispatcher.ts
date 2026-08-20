import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AnalysisJobStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AnalysisJobRunner } from './analysis-job.runner';
import { AnalysisJobQueue } from './analysis-job.queue';

@Injectable()
export class AnalysisJobDispatcher implements AnalysisJobQueue, OnModuleInit, OnModuleDestroy {
  private readonly scheduled = new Set<string>();
  private recoveryTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: AnalysisJobRunner,
  ) {}

  onModuleInit(): void {
    void this.recover();
    this.recoveryTimer = setInterval(() => void this.recover(), 5_000);
    this.recoveryTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
  }

  enqueue(jobId: string): void {
    if (this.scheduled.has(jobId)) return;
    this.scheduled.add(jobId);
    setImmediate(() => void this.run(jobId));
  }

  private async recover(): Promise<void> {
    let jobs;
    try {
      jobs = await this.prisma.analysisJob.findMany({
        where: {
          OR: [
            { status: AnalysisJobStatus.QUEUED },
            { status: AnalysisJobStatus.RUNNING, leaseExpiresAt: { lt: new Date() } },
          ],
        },
        select: { id: true, attemptCount: true, maxAttempts: true },
        take: 25,
        orderBy: { createdAt: 'asc' },
      });
    } catch {
      return;
    }
    for (const job of jobs) {
      if (job.attemptCount < job.maxAttempts) this.enqueue(job.id);
    }
  }

  private async run(jobId: string): Promise<void> {
    let retry = false;
    try {
      retry = await this.runner.execute(jobId) === 'REQUEUED';
    } catch {
      retry = false;
    } finally {
      this.scheduled.delete(jobId);
    }
    if (retry) {
      const timer = setTimeout(() => this.enqueue(jobId), 1_000);
      timer.unref();
    }
  }
}