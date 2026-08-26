import { GeometryType, MeasurementUnit } from '@prisma/client';

export const ANALYSIS_PROVIDER = Symbol('ANALYSIS_PROVIDER');

export type AnalysisInput = {
  attachmentId: string;
  requestItemId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  content?: Buffer;
};

export type SuggestedMeasurement = {
  label?: string;
  suggestedProductType?: string;
  geometryType: GeometryType;
  widthMm?: number;
  heightMm?: number;
  lengthMm?: number;
  depthMm?: number;
  thicknessMm?: number;
  quantity?: number;
  unit?: MeasurementUnit;
  confidence?: number;
  warnings?: string[];
  assumptions?: string[];
};

export type AnalysisProviderResult = {
  confidence?: number;
  warnings?: string[];
  assumptions?: string[];
  measurements: SuggestedMeasurement[];
};

export interface AnalysisProvider {
  readonly providerName: string;
  readonly modelName: string;
  readonly modelVersion: string;
  readonly requiresContent: boolean;
  analyze(input: AnalysisInput): Promise<AnalysisProviderResult>;
}

export class AnalysisProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly transient: boolean,
  ) {
    super(message);
    this.name = 'AnalysisProviderError';
  }
}