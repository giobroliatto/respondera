import fs from 'fs';
import path from 'path';

type RuntimeEnv = {
  DATABASE_URL: string;
  JWT_SECRET: string;
  ANTHROPIC_API_KEY: string;
  PORT: string;
  CORS_ORIGIN: string;
  NODE_ENV: string;
  PUBLIC_API_URL: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
};

function loadDotEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

function requireEnv(name: keyof RuntimeEnv): string {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

function assertNotPlaceholder(name: keyof RuntimeEnv, value: string): void {
  const placeholders: Partial<Record<keyof RuntimeEnv, string[]>> = {
    JWT_SECRET: ['troque-por-um-secret-longo-e-aleatorio', 'string-longa-e-aleatoria-aqui'],
    ANTHROPIC_API_KEY: ['sk-ant-...'],
  };

  if (placeholders[name]?.includes(value)) {
    throw new Error(`Variavel de ambiente ${name} ainda esta com valor placeholder.`);
  }
}

loadDotEnv();

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const DATABASE_URL = requireEnv('DATABASE_URL');
const JWT_SECRET = requireEnv('JWT_SECRET');
const ANTHROPIC_API_KEY = requireEnv('ANTHROPIC_API_KEY');

assertNotPlaceholder('JWT_SECRET', JWT_SECRET);
assertNotPlaceholder('ANTHROPIC_API_KEY', ANTHROPIC_API_KEY);

if (NODE_ENV === 'production') {
  requireEnv('PUBLIC_API_URL');
  requireEnv('RESEND_API_KEY');
  requireEnv('EMAIL_FROM');
  requireEnv('CORS_ORIGIN');
}

export const env: RuntimeEnv = {
  DATABASE_URL,
  JWT_SECRET,
  ANTHROPIC_API_KEY,
  PORT: process.env.PORT ?? '3333',
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? '*',
  NODE_ENV,
  PUBLIC_API_URL: process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? '3333'}`,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
};

export function getCorsOrigin(): string | string[] {
  if (env.CORS_ORIGIN === '*') return '*';

  return env.CORS_ORIGIN
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
