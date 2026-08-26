import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AnalysisInput,
  AnalysisProvider,
  AnalysisProviderError,
  AnalysisProviderResult,
} from './analysis-provider.contract';
import { validateProviderResult } from './validate-provider-result';

export { AnalysisProviderError } from './analysis-provider.contract';

export const ANALYSIS_HTTP_CLIENT = Symbol('ANALYSIS_HTTP_CLIENT');
export type AnalysisHttpClient = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

@Injectable()
export class OpenAiAnalysisProvider implements AnalysisProvider {
  readonly providerName = 'openai';
  readonly modelVersion = 'responses-v1';
  readonly requiresContent = true;
  readonly modelName: string;

  private readonly apiKey: string;
  private readonly requestTimeoutMs: number;

  constructor(
    configService: ConfigService,
    @Inject(ANALYSIS_HTTP_CLIENT) private readonly httpClient: AnalysisHttpClient,
  ) {
    this.apiKey = configService.getOrThrow<string>('ai.apiKey');
    this.modelName = configService.getOrThrow<string>('ai.model');
    this.requestTimeoutMs = configService.getOrThrow<number>('ai.requestTimeoutMs');
  }

  async analyze(input: AnalysisInput): Promise<AnalysisProviderResult> {
    if (!input.content) {
      throw new AnalysisProviderError('CONTENT_REQUIRED', 'Attachment content is required', false);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await this.httpClient('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.requestBody(input)),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new AnalysisProviderError(
          `HTTP_${response.status}`,
          'Analysis provider request failed',
          response.status === 408 || response.status === 429 || response.status >= 500,
        );
      }

      return this.parseResponse(await response.json());
    } catch (error) {
      if (error instanceof AnalysisProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AnalysisProviderError('TIMEOUT', 'Analysis provider timed out', true);
      }
      throw new AnalysisProviderError('NETWORK_ERROR', 'Analysis provider is unavailable', true);
    } finally {
      clearTimeout(timeout);
    }
  }

  private requestBody(input: AnalysisInput) {
    const encoded = input.content?.toString('base64');
    const fileContent = input.mimeType.startsWith('image/')
      ? { type: 'input_image', image_url: `data:${input.mimeType};base64,${encoded}` }
      : {
          type: 'input_file',
          filename: input.fileName,
          file_data: `data:${input.mimeType};base64,${encoded}`,
        };

    return {
      model: this.modelName,
      input: [{
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              'Extract physical measurements from this technical document or photo of glass.',
              'For each measurement, also suggest a likely glass product type/category if the image or any visible labels suggest one (e.g. Temperli Cam, Lamine Cam, Isicam, Duz Cam); use null if genuinely undeterminable.',
              'Return suggestions only; a human will review them.',
              `MIME: ${input.mimeType}`,
              `Size: ${input.sizeBytes}`,
              `Checksum: ${input.checksum}`,
            ].join('\n'),
          },
          fileContent,
        ],
      }],
      text: {
        format: {
          type: 'json_schema',
          name: 'measurement_analysis',
          strict: true,
          schema: this.responseSchema,
        },
      },
    };
  }

  private parseResponse(payload: unknown): AnalysisProviderResult {
    try {
      const output = this.outputText(payload);
      const parsed = JSON.parse(output);
      return validateProviderResult(parsed);
    } catch {
      throw new AnalysisProviderError('INVALID_RESPONSE', 'Analysis provider returned invalid data', false);
    }
  }

  private outputText(payload: unknown): string {
    if (!payload || typeof payload !== 'object') throw new Error('missing payload');
    const response = payload as Record<string, unknown>;
    if (typeof response.output_text === 'string') return response.output_text;
    if (!Array.isArray(response.output)) throw new Error('missing output');
    for (const item of response.output) {
      if (!item || typeof item !== 'object') continue;
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
          return (part as Record<string, unknown>).text as string;
        }
      }
    }
    throw new Error('missing output text');
  }

  private readonly responseSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['confidence', 'warnings', 'assumptions', 'measurements'],
    properties: {
      confidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
      warnings: { type: ['array', 'null'], items: { type: 'string' } },
      assumptions: { type: ['array', 'null'], items: { type: 'string' } },
      measurements: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'label',
            'suggestedProductType',
            'geometryType',
            'widthMm',
            'heightMm',
            'lengthMm',
            'depthMm',
            'thicknessMm',
            'quantity',
            'unit',
            'confidence',
            'warnings',
            'assumptions',
          ],
          properties: {
            label: { type: ['string', 'null'] },
            suggestedProductType: { type: ['string', 'null'] },
            geometryType: { type: 'string', enum: ['COUNT', 'LINE', 'RECTANGLE', 'VOLUME', 'CUSTOM'] },
            widthMm: { type: ['number', 'null'], minimum: 0 },
            heightMm: { type: ['number', 'null'], minimum: 0 },
            lengthMm: { type: ['number', 'null'], minimum: 0 },
            depthMm: { type: ['number', 'null'], minimum: 0 },
            thicknessMm: { type: ['number', 'null'], minimum: 0 },
            quantity: { type: ['number', 'null'], minimum: 0 },
            unit: { type: ['string', 'null'], enum: ['PIECE', 'MM', 'CM', 'M', 'M2', 'M3', null] },
            confidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
            warnings: { type: ['array', 'null'], items: { type: 'string' } },
            assumptions: { type: ['array', 'null'], items: { type: 'string' } },
          },
        },
      },
    },
  };
}