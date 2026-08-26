import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type AppConfig = {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  frontendOrigins: string[];
  panelOriginRoles: Record<string, string[]>;
  cookieDomain?: string;
  cookieSecure: boolean;
  cookieSameSite: 'lax' | 'none' | 'strict';
};

export type AuthConfig = {
  accessSecret: string;
  refreshSecret: string;
  accessTtl: string;
  refreshTtl: string;
};

export type InfrastructureConfig = {
  databaseUrl: string;
  redisUrl: string;
};

export type StorageConfig = {
  rootPath: string;
  maxFileSizeBytes: number;
  signedUrlTtlSeconds: number;
};

export type AiConfig = {
  provider: 'deterministic' | 'openai' | 'gemini';
  apiKey?: string;
  model: string;
  requestTimeoutMs: number;
};

export type RuntimeConfig = {
  app: AppConfig;
  auth: AuthConfig;
  infrastructure: InfrastructureConfig;
  storage: StorageConfig;
  ai: AiConfig;
};

function parsePanelOriginRoles(value?: string): Record<string, string[]> {
  if (!value) {
    return {};
  }

  return Object.fromEntries(
    value.split(';').map((entry) => {
      const [origin, roles = ''] = entry.split('=');
      return [origin.trim(), roles.split('|').map((role) => role.trim()).filter(Boolean)];
    }),
  );
}

export const runtimeConfig = (): RuntimeConfig => ({
  app: {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 4000),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1',
    frontendOrigins: (process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:4177')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    panelOriginRoles: parsePanelOriginRoles(process.env.PANEL_ORIGIN_ROLES),
    cookieDomain: process.env.COOKIE_DOMAIN,
    cookieSecure: (process.env.COOKIE_SECURE ?? 'false') === 'true',
    cookieSameSite: (process.env.COOKIE_SAME_SITE ?? 'lax') as AppConfig['cookieSameSite'],
  },
  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },
  infrastructure: {
    databaseUrl: process.env.DATABASE_URL ?? '',
    redisUrl: process.env.REDIS_URL ?? '',
  },
  storage: {
    rootPath: process.env.STORAGE_ROOT || join(tmpdir(), 'dijital-cam-storage'),
    maxFileSizeBytes: Number(process.env.STORAGE_MAX_FILE_SIZE_BYTES ?? 26_214_400),
    signedUrlTtlSeconds: Number(process.env.STORAGE_SIGNED_URL_TTL_SECONDS ?? 300),
  },
  ai: {
    provider: (process.env.AI_PROVIDER ?? 'deterministic') as AiConfig['provider'],
    apiKey: process.env.AI_API_KEY,
    model: process.env.AI_MODEL ?? (process.env.AI_PROVIDER === 'gemini' ? 'gemini-3.6-flash' : 'gpt-4.1-mini'),
    requestTimeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 30_000),
  },
});
