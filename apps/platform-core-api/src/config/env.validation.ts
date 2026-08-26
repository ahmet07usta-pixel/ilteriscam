import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateIf,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsString()
  NODE_ENV!: string;

  @IsInt()
  @Min(1)
  PORT!: number;

  @IsString()
  API_PREFIX!: string;

  @IsString()
  FRONTEND_ORIGIN!: string;

  @IsOptional()
  @IsString()
  PANEL_ORIGIN_ROLES?: string;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  JWT_ACCESS_TTL!: string;

  @IsString()
  JWT_REFRESH_TTL!: string;

  @IsOptional()
  @IsString()
  COOKIE_DOMAIN?: string;

  @IsBooleanString()
  COOKIE_SECURE!: string;

  @IsOptional()
  @IsIn(['lax', 'none', 'strict'])
  COOKIE_SAME_SITE?: string;

  @IsOptional()
  @IsString()
  STORAGE_ROOT?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  STORAGE_MAX_FILE_SIZE_BYTES?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  STORAGE_SIGNED_URL_TTL_SECONDS?: number;

  @IsOptional()
  @IsIn(['deterministic', 'openai', 'gemini'])
  AI_PROVIDER?: string;

  @ValidateIf((environment) => environment.AI_PROVIDER === 'openai' || environment.AI_PROVIDER === 'gemini')
  @IsString()
  @IsNotEmpty()
  AI_API_KEY?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  AI_MODEL?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  AI_REQUEST_TIMEOUT_MS?: number;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validated;
}
