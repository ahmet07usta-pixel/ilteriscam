import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import {
  AnalysisProviderError,
  AnalysisProviderResult,
} from './analysis-provider.contract';
import { ProviderResponseDto } from './provider-response.dto';

export function validateProviderResult(payload: unknown): AnalysisProviderResult {
  const validated = plainToInstance(ProviderResponseDto, payload);
  const errors = validateSync(validated, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length > 0) {
    throw new AnalysisProviderError('INVALID_RESPONSE', 'Analysis provider returned invalid data', false);
  }
  return {
    confidence: validated.confidence ?? undefined,
    warnings: validated.warnings ?? undefined,
    assumptions: validated.assumptions ?? undefined,
    measurements: validated.measurements.map((measurement) => ({
      geometryType: measurement.geometryType,
      label: measurement.label ?? undefined,
      suggestedProductType: measurement.suggestedProductType ?? undefined,
      widthMm: measurement.widthMm ?? undefined,
      heightMm: measurement.heightMm ?? undefined,
      lengthMm: measurement.lengthMm ?? undefined,
      depthMm: measurement.depthMm ?? undefined,
      thicknessMm: measurement.thicknessMm ?? undefined,
      quantity: measurement.quantity ?? undefined,
      unit: measurement.unit ?? undefined,
      confidence: measurement.confidence ?? undefined,
      warnings: measurement.warnings ?? undefined,
      assumptions: measurement.assumptions ?? undefined,
    })),
  };
}