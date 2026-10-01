/**
 * Read the last `limit` records of a JSONL file without loading the whole file.
 *
 * The conductor ledgers (science/math cycles + findings) are append-only and
 * reach several MB; their "recent N" readers used to read + split the entire
 * file on every dashboard/gamification call, and a single torn line (e.g. a
 * crash mid-append) made JSON.parse throw and the reader return [] — hiding the
 * whole history. This reads backwards in chunks and skips unparsable lines.
 */
import fs from 'node:fs';

const CHUNK = 64 * 1024;

export function readJsonlTail<T>(file: string, limit: number): T[] {
  if (!(limit > 0)) return [];
  let fd: number;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return [];
  }
  try {
    const size = fs.fstatSync(fd).size;
    let pos = size;
    let buf = Buffer.alloc(0);
    let newlines = 0;
    // Collect enough bytes to hold `limit` complete lines (+1 for a partial head).
    while (pos > 0 && newlines <= limit) {
      const len = Math.min(CHUNK, pos);
      pos -= len;
      const chunk = Buffer.alloc(len);
      fs.readSync(fd, chunk, 0, len, pos);
      for (let i = 0; i < len; i++) if (chunk[i] === 0x0a) newlines++;
      buf = Buffer.concat([chunk, buf]);
    }
    let lines = buf.toString('utf-8').split('\n');
    if (pos > 0) lines = lines.slice(1); // first line may be cut mid-record
    const out: T[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push(JSON.parse(t) as T);
      } catch {
        /* torn/corrupt line — skip it, keep the rest of the history */
      }
    }
    return out.slice(-limit);
  } finally {
    fs.closeSync(fd);
  }
}
