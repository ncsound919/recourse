import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Bundled Python training script (runs on Kaggle GPU). */
export function mixingTrainingScript(): string {
  return fs.readFileSync(path.join(__dirname, 'mixingTrainingScript.py'), 'utf8');
}
