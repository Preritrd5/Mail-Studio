import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/env.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/healthRoutes.js';
import { emailRouter } from './routes/emailRoutes.js';
import { templateRouter } from './routes/templateRoutes.js';
import { importRouter } from './routes/importRoutes.js';
import { queueRouter } from './routes/queueRoutes.js';
import { activityRouter } from './routes/activityRoutes.js';
import { reportsRouter } from './routes/reportsRoutes.js';

export const app = express();

// 1. Security Headers via Helmet
app.use(helmet());

// 2. Strict CORS Configuration
const allowedOrigins = [
  config.clientOrigin,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, or same-origin server requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy violation: Origin ${origin} not permitted.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}));

// 3. Body Parser with strict payload size limits (500KB maximum for JSON/UrlEncoded)
app.use(express.json({ limit: '500kb' }));
app.use(express.urlencoded({ extended: false, limit: '500kb' }));

// 3.1. Route Alias / Rewrite Middleware (Transparently normalizes paths without /api prefix)
app.use((req, res, next) => {
  const rootAliases = ['/queue', '/activity', '/reports', '/templates', '/imports', '/emails', '/email', '/health', '/system'];
  if (rootAliases.some(prefix => req.url === prefix || req.url.startsWith(`${prefix}/`) || req.url.startsWith(`${prefix}?`))) {
    req.url = `/api${req.url}`;
  }
  next();
});

// 4. Global API Rate Limiter
app.use('/api', apiRateLimiter);

// 5. Mount API Routes (Canonical /api prefix)
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
