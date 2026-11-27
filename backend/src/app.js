import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/env.js';
import { isSupabaseConfigured } from './config/supabase.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/authRoutes.js';
import { healthRouter } from './routes/healthRoutes.js';
import { emailRouter } from './routes/emailRoutes.js';
import { templateRouter } from './routes/templateRoutes.js';
import { importRouter } from './routes/importRoutes.js';
import { queueRouter } from './routes/queueRoutes.js';
import { activityRouter } from './routes/activityRoutes.js';
import { reportsRouter } from './routes/reportsRoutes.js';

export const app = express();

// Trust Vercel / reverse proxy X-Forwarded-For headers for accurate rate limiting
app.set('trust proxy', 1);

// 1. Security Headers via Helmet
app.use(helmet());

// 2. Strict CORS Configuration (local dev, configured origins, and project Vercel origins)
const allowedOrigins = Array.from(
  new Set([
    ...(config.allowedOrigins || []),
    config.clientOrigin,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://emaildraft.vercel.app',
  ].filter(Boolean).map((o) => o.replace(/\/+$/, '')))
);

function isPermittedOrigin(origin) {
  const normalized = origin.replace(/\/+$/, '');
  if (allowedOrigins.includes(normalized)) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) return true;
  if (/^https:\/\/(emaildraft|snpsunexus)(-[a-z0-9-]+)?\.vercel\.app$/i.test(normalized)) return true;
  return false;
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin requests, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (isPermittedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy violation: Origin ${origin} not permitted.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}));

// 3. Body Parser with strict payload size limits (500KB maximum for JSON/UrlEncoded)
app.use(express.json({ limit: '500kb' }));
app.use(express.urlencoded({ extended: false, limit: '500kb' }));

// 3.1. Route Alias / Rewrite Middleware (Transparently normalizes paths without /api prefix)
app.use((req, res, next) => {
  const rootAliases = ['/auth', '/queue', '/activity', '/reports', '/templates', '/imports', '/emails', '/email', '/health', '/system'];
  if (rootAliases.some(prefix => req.url === prefix || req.url.startsWith(`${prefix}/`) || req.url.startsWith(`${prefix}?`))) {
    req.url = `/api${req.url}`;
  }
  next();
});

// 4. Global API Rate Limiter
app.use('/api', apiRateLimiter);

// 4.1. Guard protected API routes with explicit 503 diagnostics when backend env vars are missing on Vercel
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  if (!isSupabaseConfigured()) {
    const missing = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY'].filter(
      (k) => !(k === 'SUPABASE_URL' ? config.supabaseUrl : config.supabaseSecretKey)
    );
    return res.status(503).json({
      success: false,
      error: {
        code: 'SERVER_CONFIG_MISSING',
        message: `Backend Supabase environment variables are not configured in this deployment: ${missing.join(', ')}. Add them in Vercel Project Settings -> Environment Variables and redeploy.`,
      },
    });
  }
  next();
});

// 5. Mount API Routes (Canonical /api prefix)
app.use('/api', authRouter);
app.use('/api', healthRouter);
app.use('/api', emailRouter);
app.use('/api', templateRouter);
app.use('/api', importRouter);
app.use('/api', queueRouter);
app.use('/api', activityRouter);
app.use('/api', reportsRouter);

// 6. 404 Route Handler
app.use(notFoundHandler);

// 7. Centralized Error Handler
app.use(errorHandler);
