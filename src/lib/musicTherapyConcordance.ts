import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function musicTherapyConcordanceScript(): string {
  return fs.readFileSync(path.join(__dirname, 'musicTherapyConcordanceScript.py'), 'utf8');
}
