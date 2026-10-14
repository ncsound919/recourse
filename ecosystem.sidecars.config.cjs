// Recourse loop backing services (started 2026-09-11 to heal science-loop runs).
// Standalone consumer of fleet conventions; NOT part of fleet-manifest.js.
//
// WHY PATHS ARE PROBED (2026-10-13). Every path in this file used to be
// hardcoded to one of two trees that no longer exist -- `Downloads\Uplift\...`
// and `Downloads\recourse` (the pre-dedupe checkout, now a 1-entry stub with no
// server.ts and no python/). The recourse repo moved to
// BUSINESS\INFRASTRUCTURE\recourse and oncology to
// BUSINESS\SCIENCE\Oncology Ecosystem, so the config silently described
// services that could never start. Each root below is resolved by probing for a
// real entrypoint and the resolution is LOGGED at load time, so a wrong root
// shows up in pm2 logs before the first crash instead of as a phantom code bug.
// This mirrors the fix already applied in
// Oncology Ecosystem/orchestration/ecosystem.oncology.config.js.
const fs = require('node:fs');
const path = require('node:path');

const PYTHON = process.env.PYTHON_PATH || 'C:\\Program Files\\Python312\\python.exe';
const NODE = process.env.NODE_PATH || 'C:\\Program Files\\nodejs\\node.exe';
const BUSINESS = 'C:\\Users\\User\\Downloads\\BUSINESS';

/** First candidate root that actually contains `relative`; logged, never guessed silently. */
function resolveRoot(label, candidates, relative) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(path.join(candidate, relative))) return candidate;
  }
  const fallback = candidates.filter(Boolean)[0];
  console.warn(
    `[sidecars] WARNING: no ${label} root contains "${relative}"; ` +
      `falling back to ${fallback} (this service will not start until the tree is restored)`,
  );
  return fallback;
}

const RECOURSE_ROOT = resolveRoot(
  'recourse',
  [process.env.RECOURSE_ROOT, path.join(BUSINESS, 'INFRASTRUCTURE', 'recourse'), 'C:\\Users\\User\\Downloads\\recourse'],
  path.join('python', 'biosim_service', 'main.py'),
);

const ONCOLOGY_PLATFORM = resolveRoot(
  'oncology platform',
  [process.env.ONCOLOGY_ROOT && path.join(process.env.ONCOLOGY_ROOT, 'platform'), path.join(BUSINESS, 'SCIENCE', 'Oncology Ecosystem', 'platform')],
  path.join('node_modules', 'next', 'dist', 'bin', 'next'),
);

const INTEGRITY_ROOT = resolveRoot(
  'research-integrity',
  [process.env.INTEGRITY_ROOT, path.join(BUSINESS, 'SCIENCE', 'research-integrity'), path.join(BUSINESS, '_archive', 'from-uplift', '02_Pillars', 'Overlay Writing', 'research-integrity')],
  path.join('src', 'service.py'),
);

console.log(
  `[sidecars] RECOURSE_ROOT  = ${RECOURSE_ROOT}\n` +
    `[sidecars] ONCOLOGY_PLATFORM = ${ONCOLOGY_PLATFORM}\n` +
    `[sidecars] INTEGRITY_ROOT = ${INTEGRITY_ROOT}`,
);

function svc(name, cwd, port, module, appVar, log) {
  return {
    name,
    script: PYTHON,
    args: `-m uvicorn ${module}:${appVar} --host 127.0.0.1 --port ${port}`,
    cwd,
    autorestart: true,
    max_memory_restart: '512M',
    restart_delay: 3000,
    max_restarts: 10,
    min_uptime: '10s',
    time: true,
    merge_logs: true,
    out_file: log + '-out.log',
    error_file: log + '-err.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
    env: { NODE_ENV: 'production', PYTHONIOENCODING: 'utf-8' },
  };
}

module.exports = {
  apps: [
    {
      name: 'overlay-oncology',
      script: path.join(ONCOLOGY_PLATFORM, 'node_modules', 'next', 'dist', 'bin', 'next'),
      args: 'dev -p 3070',
      cwd: ONCOLOGY_PLATFORM,
      interpreter: NODE,
      autorestart: true,
      max_memory_restart: '1G',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '20s',
      time: true,
      merge_logs: true,
      out_file: path.join(ONCOLOGY_PLATFORM, 'oncology-pm2-out.log'),
      error_file: path.join(ONCOLOGY_PLATFORM, 'oncology-pm2-err.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      env: { PORT: '3070', NODE_ENV: 'development' },
    },
    svc(
      'biosim-sidecar',
      path.join(RECOURSE_ROOT, 'python', 'biosim_service'),
      8503,
      'main',
      'app',
      path.join(RECOURSE_ROOT, 'python', 'biosim_service', 'biosim-pm2'),
    ),
    svc(
      'integrity-svc',
      path.join(INTEGRITY_ROOT, 'src'),
      8025,
      'service',
      'app',
      path.join(INTEGRITY_ROOT, 'integrity-pm2'),
    ),
    svc(
      'ghidra-sidecar',
      path.join(RECOURSE_ROOT, 'python', 'ghidra_service'),
      8510,
      'main',
      'app',
      path.join(RECOURSE_ROOT, 'python', 'ghidra_service', 'ghidra-pm2'),
    ),
    svc(
      'tts-sidecar',
      path.join(RECOURSE_ROOT, 'python', 'tts_service'),
      8910,
      'main',
      'app',
      path.join(RECOURSE_ROOT, 'python', 'tts_service', 'tts-pm2'),
    ),
  ],
};
