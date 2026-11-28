let cachedApp = null;
let cachedBootError = null;

export default async function handler(req, res) {
  if (!cachedApp && !cachedBootError) {
    try {
      const mod = await import('../backend/src/app.js');
      cachedApp = mod.app;
    } catch (err) {
      cachedBootError = err;
      console.error('[Vercel Serverless Bootstrap Error]', err);
    }
  }

  if (cachedBootError) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: {
          code: 'SERVERLESS_BOOTSTRAP_FAILED',
          nodeVersion: process.version,
          message: cachedBootError?.message || 'Failed to initialize Express application.',
        },
      })
    );
    return;
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    res.once('finish', finish);
    res.once('close', finish);

    try {
      cachedApp(req, res);
    } catch (err) {
      console.error('[Vercel Serverless Invocation Error]', err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: false,
            error: {
              code: 'SERVERLESS_INVOCATION_FAILED',
              nodeVersion: process.version,
              message: err?.message || 'Unhandled server error.',
            },
          })
        );
      }
      finish();
    }
  });
}
