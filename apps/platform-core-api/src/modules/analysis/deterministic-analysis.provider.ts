import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { GeometryType, MeasurementUnit } from '@prisma/client';

import {
  AnalysisInput,
  AnalysisProvider,
  AnalysisProviderResult,
} from './analysis-provider.contract';

@Injectable()
export class DeterministicAnalysisProvider implements AnalysisProvider {
  readonly providerName = 'deterministic';
  readonly modelName = 'measurement-fixture';
  readonly modelVersion = '1.0.0';
  readonly requiresContent = false;

  private readonly productTypeFixtures = ['Temperli Cam', 'Lamine Cam', 'Isicam', 'Duz Cam'];

  async analyze(input: AnalysisInput): Promise<AnalysisProviderResult> {
    const digest = createHash('sha256')
      .update(`${input.checksum}:${input.mimeType}:${input.sizeBytes}`)
      .digest();
    const widthMm = 500 + digest.readUInt16BE(0) % 1501;
    const heightMm = 500 + digest.readUInt16BE(2) % 1501;
    const thicknessMm = 4 + digest[4] % 17;
    const suggestedProductType = this.productTypeFixtures[digest[5] % this.productTypeFixtures.length];

    return {
      confidence: 0.9,
      assumptions: ['Deterministic development suggestion; human review required'],
      measurements: [{
        label: input.fileName,
        suggestedProductType,
        geometryType: GeometryType.RECTANGLE,
        widthMm,
        heightMm,
        thicknessMm,
        quantity: 1,
        unit: MeasurementUnit.PIECE,
        confidence: 0.9,
      }],
    };
  }
}