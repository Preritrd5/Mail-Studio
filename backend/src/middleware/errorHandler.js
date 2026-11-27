import { config } from '../config/env.js';

export function errorHandler(err, req, res, next) {
  // Never expose credentials, database connection strings, or full stack traces in production
  const statusCode = err.statusCode || err.status || 500;
  const errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  const errorMessage = err.message || 'An unexpected internal error occurred.';

  // Structured safe error log
  console.error(`[API Error] [${req.method} ${req.originalUrl}] [${statusCode} ${errorCode}]: ${errorMessage}`);
  if (config.nodeEnv !== 'production' && err.stack) {
    console.error(err.stack);
  }

  const responsePayload = {
    success: false,
    error: {
      code: errorCode,
      message: errorMessage,
      ...(err.details ? { details: err.details } : {}),
      ...(config.nodeEnv !== 'production' && statusCode === 500 ? { devStack: err.stack } : {}),
    },
  };

  res.status(statusCode).json(responsePayload);
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist.`,
    },
  });
}
