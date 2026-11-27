import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load root .env file regardless of process.cwd()
const rootEnvPath = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: rootEnvPath });

const requiredVariables = [
  'PORT',
  'NODE_ENV',
  'CLIENT_ORIGIN',
  'APP_BASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'GMAIL_USER',
  'GMAIL_APP_PASSWORD',
];

// Startup verification: Stop startup if any mandatory variable is missing
const missing = requiredVariables.filter((key) => {
  const val = process.env[key];
  return val === undefined || val === null || val.trim() === '';
});

if (missing.length > 0) {
  // Safe error: Identifies only the missing variable names, never logging values or other secrets
  console.error(`FATAL STARTUP ERROR: Missing mandatory environment variable(s): ${missing.join(', ')}`);
  process.exit(1);
}

// Helper to strip surrounding quotes if present in .env
function cleanEnv(val, fallback = '') {
  if (!val) return fallback;
  const trimmed = val.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.substring(1, trimmed.length - 1);
  }
  return trimmed;
}

export const config = Object.freeze({
  port: parseInt(cleanEnv(process.env.PORT, '5000'), 10) || 5000,
  nodeEnv: cleanEnv(process.env.NODE_ENV, 'development'),
  clientOrigin: cleanEnv(process.env.CLIENT_ORIGIN, 'http://localhost:5173'),
  appBaseUrl: cleanEnv(process.env.APP_BASE_URL, 'http://localhost:5000'),
  supabaseUrl: cleanEnv(process.env.SUPABASE_URL),
  supabaseSecretKey: cleanEnv(process.env.SUPABASE_SECRET_KEY),
  gmailUser: cleanEnv(process.env.GMAIL_USER),
  gmailAppPassword: cleanEnv(process.env.GMAIL_APP_PASSWORD),
  senderName: 'SNPSUNEXUS',
});
