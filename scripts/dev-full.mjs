import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    const done = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(800);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function main() {
  const children = [];
  const forwardArgs = process.argv.slice(2);

  const backendUp = await isPortOpen(4000);
  if (!backendUp) {
    const serverProc = spawn(process.execPath, [path.join(ROOT_DIR, 'backend/src/server.js')], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: process.env,
    });
    children.push(serverProc);
  } else {
    console.log('✓ Reusing running backend API server on http://localhost:4000');
  }

  const viteBin = path.join(ROOT_DIR, 'node_modules/vite/bin/vite.js');
  const viteArgs = fs.existsSync(viteBin) ? [viteBin, ...forwardArgs] : [];
  const viteProc = spawn(process.execPath, viteArgs, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: process.env,
  });
  children.push(viteProc);

  const shutdown = (signal) => {
    for (const child of children) {
      if (!child.killed) {
        child.kill(signal);
      }
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  viteProc.on('exit', (code) => {
    for (const child of children) {
      if (child !== viteProc && !child.killed) {
        child.kill('SIGTERM');
      }
    }
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('[dev-full] Startup failed:', err);
  process.exit(1);
});
