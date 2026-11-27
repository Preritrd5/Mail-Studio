import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env file if present (serverless environments inject process.env directly)
const rootEnvPath = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

// Helper to strip surrounding quotes if present in .env
function cleanEnv(val, fallback = '') {
  if (!val) return fallback;
  const trimmed = String(val).trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.substring(1, trimmed.length - 1);
  }
  return trimmed;
}

const isServerlessRuntime = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const vercelProductionOrigin = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${cleanEnv(process.env.VERCEL_PROJECT_PRODUCTION_URL)}`
  : '';
const vercelDeployOrigin = process.env.VERCEL_URL
  ? `https://${cleanEnv(process.env.VERCEL_URL)}`
  : '';
const vercelBranchOrigin = process.env.VERCEL_BRANCH_URL
  ? `https://${cleanEnv(process.env.VERCEL_BRANCH_URL)}`
  : '';

const defaultOrigin = vercelProductionOrigin || vercelDeployOrigin || 'http://localhost:5173';
const supabaseUrl = cleanEnv(process.env.SUPABASE_URL) || cleanEnv(process.env.VITE_SUPABASE_URL);
const supabaseSecretKey = cleanEnv(process.env.SUPABASE_SECRET_KEY);
const gmailUser = cleanEnv(process.env.GMAIL_USER);
const gmailAppPassword = cleanEnv(process.env.GMAIL_APP_PASSWORD);

const missingBackendVars = [
  !supabaseUrl ? 'SUPABASE_URL' : null,
  !supabaseSecretKey ? 'SUPABASE_SECRET_KEY' : null,
  !gmailUser ? 'GMAIL_USER' : null,
  !gmailAppPassword ? 'GMAIL_APP_PASSWORD' : null,
].filter(Boolean);

// Only fail fast in local/standalone server startup when core credentials are absent.
// In Vercel serverless imports, keep the app bootable so /api/health & error handlers return clean 503 JSON.
if (!isServerlessRuntime && (!supabaseUrl || !supabaseSecretKey)) {
  console.error(
    `FATAL STARTUP ERROR: Missing mandatory environment variable(s): ${[!supabaseUrl && 'SUPABASE_URL', !supabaseSecretKey && 'SUPABASE_SECRET_KEY'].filter(Boolean).join(', ')}`
  );
  process.exit(1);
}

const extraCorsOrigins = cleanEnv(process.env.ALLOWED_ORIGINS, '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const clientOrigins = cleanEnv(process.env.CLIENT_ORIGIN, defaultOrigin)
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

export const config = Object.freeze({
  port: parseInt(cleanEnv(process.env.PORT, '4000'), 10) || 4000,
  nodeEnv: cleanEnv(process.env.NODE_ENV, isServerlessRuntime ? 'production' : 'development'),
  isServerless: isServerlessRuntime,
  clientOrigin: clientOrigins[0] || defaultOrigin,
  allowedOrigins: Array.from(
    new Set([
      ...clientOrigins,
      ...extraCorsOrigins,
      vercelProductionOrigin,
      vercelDeployOrigin,
      vercelBranchOrigin,
    ].filter(Boolean))
  ),
  appBaseUrl: cleanEnv(process.env.APP_BASE_URL, vercelProductionOrigin || vercelDeployOrigin || 'http://localhost:4000'),
  supabaseUrl,
  supabaseSecretKey,
  gmailUser,
  gmailAppPassword,
  missingBackendVars: Object.freeze(missingBackendVars),
  senderName: 'SNPSUNEXUS',
});
