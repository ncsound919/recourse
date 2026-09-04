import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        // The Recourse engine persists state to these JSON files on every tick.
        // Watching them makes Vite full-reload the page on each write, which,
        // combined with persisted isAutoEvolving, produces an infinite reload
        // loop (tick -> write -> reload -> tick). Never watch runtime data.
        ignored: ['**/recourse_*.json', '**/*.json.tmp', '**/metadata.json'],
        ...(process.env.DISABLE_HMR === 'true' ? { ignored: ['**/*'] } : {}),
      },
    },
  };
});
