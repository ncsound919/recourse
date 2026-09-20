// Recourse loop backing services (started 2026-09-11 to heal science-loop runs).
// Standalone consumer of fleet conventions; NOT part of fleet-manifest.js.
const PYTHON = process.env.PYTHON_PATH || 'C:\\Program Files\\Python312\\python.exe';

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

const NODE = process.env.NODE_PATH || 'C:\\Program Files\\nodejs\\node.exe';

module.exports = {
  apps: [
    {
      name: 'overlay-oncology',
      script: 'C:\\Users\\User\\Downloads\\Uplift\\02_Pillars\\Overlay Science\\Overlay Oncology\\node_modules\\next\\dist\\bin\\next',
      args: 'dev -p 3070',
      cwd: 'C:\\Users\\User\\Downloads\\Uplift\\02_Pillars\\Overlay Science\\Overlay Oncology',
      interpreter: NODE,
      autorestart: true,
      max_memory_restart: '1G',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '20s',
      time: true,
      merge_logs: true,
      out_file:
        'C:\\Users\\User\\Downloads\\Uplift\\02_Pillars\\Overlay Science\\Overlay Oncology\\oncology-pm2-out.log',
      error_file:
        'C:\\Users\\User\\Downloads\\Uplift\\02_Pillars\\Overlay Science\\Overlay Oncology\\oncology-pm2-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
      env: { PORT: '3070', NODE_ENV: 'development' },
    },
    svc(
      'biosim-sidecar',
      'C:\\Users\\User\\Downloads\\recourse\\python\\biosim_service',
      8503,
      'main',
      'app',
      'C:\\Users\\User\\Downloads\\recourse\\python\\biosim_service\\biosim-pm2'
    ),
    svc(
      'integrity-svc',
      'C:\\Users\\User\\Downloads\\Uplift\\02_Pillars\\Overlay Writing\\research-integrity\\src',
      8025,
      'service',
      'app',
      'C:\\Users\\User\\Downloads\\Uplift\\02_Pillars\\Overlay Writing\\research-integrity\\integrity-pm2'
    ),
    svc(
      'ghidra-sidecar',
      'C:\\Users\\User\\Downloads\\recourse\\python\\ghidra_service',
      8510,
      'main',
      'app',
      'C:\\Users\\User\\Downloads\\recourse\\python\\ghidra_service\\ghidra-pm2'
    ),
    svc(
      'tts-sidecar',
      'C:\\Users\\User\\Downloads\\recourse\\python\\tts_service',
      8910,
      'main',
      'app',
      'C:\\Users\\User\\Downloads\\recourse\\python\\tts_service\\tts-pm2'
    ),
  ],
};
