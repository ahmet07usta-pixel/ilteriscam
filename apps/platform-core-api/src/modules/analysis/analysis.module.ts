import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../storage/storage.module';
import { AnalysisController } from './analysis.controller';
import { ANALYSIS_PROVIDER } from './analysis-provider.contract';
import { AnalysisJobDispatcher } from './analysis-job.dispatcher';
import { ANALYSIS_JOB_QUEUE } from './analysis-job.queue';
import { AnalysisJobRunner } from './analysis-job.runner';
import { AnalysisService } from './analysis.service';
import { DeterministicAnalysisProvider } from './deterministic-analysis.provider';
import { GeminiAnalysisProvider } from './gemini-analysis.provider';
import {
  ANALYSIS_HTTP_CLIENT,
  AnalysisHttpClient,
  OpenAiAnalysisProvider,
} from './openai-analysis.provider';

@Module({
  imports: [AuditModule, StorageModule],
  controllers: [AnalysisController],
  providers: [
    AnalysisService,
    AnalysisJobRunner,
    AnalysisJobDispatcher,
    { provide: ANALYSIS_JOB_QUEUE, useExisting: AnalysisJobDispatcher },
    {
      provide: ANALYSIS_HTTP_CLIENT,
      useValue: ((input, init) => fetch(input, init)) satisfies AnalysisHttpClient,
    },
    {
      provide: ANALYSIS_PROVIDER,
      inject: [ConfigService, ANALYSIS_HTTP_CLIENT],
      useFactory: (configService: ConfigService, httpClient: AnalysisHttpClient) => {
        const provider = configService.getOrThrow<string>('ai.provider');
        if (provider === 'openai') return new OpenAiAnalysisProvider(configService, httpClient);
        if (provider === 'gemini') return new GeminiAnalysisProvider(configService);
        return new DeterministicAnalysisProvider();
      },
    },
  ],
  exports: [AnalysisService],
})
export class AnalysisModule {}