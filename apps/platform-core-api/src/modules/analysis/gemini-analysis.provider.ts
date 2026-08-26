import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AnalysisInput,
  AnalysisProvider,
  AnalysisProviderError,
  AnalysisProviderResult,
} from './analysis-provider.contract';
import { validateProviderResult } from './validate-provider-result';

export { AnalysisProviderError } from './analysis-provider.contract';

// @google/genai ships ESM-only; this CommonJS project must load it via dynamic import().
async function loadGenAiModule() {
  return import('@google/genai');
}

type GenAiModule = Awaited<ReturnType<typeof loadGenAiModule>>;
type GoogleGenAIClient = InstanceType<GenAiModule['GoogleGenAI']>;

// Google's free tier (aistudio.google.com) makes this a genuine no-cost alternative to the OpenAI provider.
@Injectable()
export class GeminiAnalysisProvider implements AnalysisProvider {
  readonly providerName = 'gemini';
  readonly modelVersion = 'genai-v1';
  readonly requiresContent = true;
  readonly modelName: string;

  private readonly apiKey: string;
  private readonly requestTimeoutMs: number;
  private client: GoogleGenAIClient | undefined;

  constructor(configService: ConfigService) {
    this.apiKey = configService.getOrThrow<string>('ai.apiKey');
    const configuredModel = configService.getOrThrow<string>('ai.model');
    // The bare model id (e.g. "gemini-3.6-flash") 404s on generateContent; the API needs the full "models/..." resource name.
    this.modelName = configuredModel.includes('/') ? configuredModel : `models/${configuredModel}`;
    this.requestTimeoutMs = configService.getOrThrow<number>('ai.requestTimeoutMs');
  }

  async analyze(input: AnalysisInput): Promise<AnalysisProviderResult> {
    if (!input.content) {
      throw new AnalysisProviderError('CONTENT_REQUIRED', 'Attachment content is required', false);
    }

    const { GoogleGenAI, ApiError: GeminiApiError } = await loadGenAiModule();
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: [{
          role: 'user',
          parts: [
            {
              text: [
                'Extract physical measurements from this technical document or photo of glass, including any handwritten notes.',
                'For each measurement, also suggest a likely glass product type/category if the image or any visible labels/handwriting suggest one (e.g. Temperli Cam, Lamine Cam, Isicam, Duz Cam); use null if genuinely undeterminable.',
                'Return suggestions only; a human will review them.',
              ].join('\n'),
            },
            { inlineData: { mimeType: input.mimeType, data: input.content.toString('base64') } },
          ],
        }],
        config: {
          abortSignal: controller.signal,
          responseMimeType: 'application/json',
          responseJsonSchema: this.responseSchema,
        },
      });

      return this.parseResponse(response.text);
    } catch (error) {
      if (error instanceof AnalysisProviderError) throw error;
      if (error instanceof GeminiApiError) {
        throw new AnalysisProviderError(
          `HTTP_${error.status}`,
          'Analysis provider request failed',
          error.status === 408 || error.status === 429 || error.status >= 500,
        );
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AnalysisProviderError('TIMEOUT', 'Analysis provider timed out', true);
      }
      throw new AnalysisProviderError('NETWORK_ERROR', 'Analysis provider is unavailable', true);
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseResponse(outputText: string | undefined): AnalysisProviderResult {
    if (!outputText) {
      throw new AnalysisProviderError('INVALID_RESPONSE', 'Analysis provider returned no output', false);
    }
    try {
      return validateProviderResult(JSON.parse(outputText));
    } catch (error) {
      if (error instanceof AnalysisProviderError) throw error;
      throw new AnalysisProviderError('INVALID_RESPONSE', 'Analysis provider returned invalid data', false);
    }
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
