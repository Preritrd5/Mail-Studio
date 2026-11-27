import { config } from '../config/env.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const requestId = req.requestId || 'req_unknown';
  let statusCode = err.statusCode || err.status || 500;
  let errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  let errorMessage = err.message || 'An unexpected internal error occurred.';

  if (err instanceof SyntaxError && statusCode === 400 && 'body' in err) {
    statusCode = 400;
    errorCode = 'INVALID_JSON_PAYLOAD';
    errorMessage = 'Malformed JSON request payload.';
  } else if (err.name === 'MulterError') {
    statusCode = 400;
    errorCode = err.code || 'FILE_UPLOAD_ERROR';
  } else if (String(errorMessage).includes('CORS policy violation')) {
    statusCode = 403;
    errorCode = 'CORS_ORIGIN_FORBIDDEN';
  }

  const isProduction = config.nodeEnv === 'production' || config.isServerless || process.env.NODE_ENV === 'production';

  // Structured internal diagnostic log without leaking secrets
  console.error(`[API Error] [${requestId}] [${req.method} ${req.originalUrl}] [${statusCode} ${errorCode}]: ${errorMessage}`);
  if (!isProduction && err.stack) {
    console.error(err.stack);
  }

  const safeClientMessage =
    statusCode >= 500 && isProduction && errorCode === 'INTERNAL_SERVER_ERROR'
      ? 'An internal server error occurred while processing the request.'
      : errorMessage;

  const responsePayload = {
    success: false,
    error: {
      code: errorCode,
      message: safeClientMessage,
      requestId,
      ...(err.details ? { details: err.details } : {}),
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
      requestId: req.requestId || 'req_unknown',
    },
  });
}
