/**
 * Import PHOENIX (PGS Grove) secrets into Keywire's Overlay365 Fleet project
 * (prj-mt7jrul1 / production) so they are centrally recallable via
 * keywire-pull instead of living only in scattered .env.local files.
 *
 * Values are read from the source of truth (Overlay Oncology .env.local) —
 * nothing is hardcoded in this file. Authenticates with Recourse's existing
 * KEYWIRE_SERVICE_TOKEN (write-scoped on the Fleet project) via the official
 * service-token exchange. Never prints values.
 *
 * Usage (from the recourse dir):  node scripts/kw-import-phoenix.cjs
 */
const fs = require('fs');
const path = require('path');

function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#')) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[m[1]] = v;
    }
  }
  return out;
}

const BASE = process.env.KEYWIRE_URL || 'http://127.0.0.1:3000';
const PROJECT = 'prj-mt7jrul1';
const ENV_SLUG = 'production';

(async () => {
  const recourseEnv = parseEnvFile(path.join(process.cwd(), '.env'));
  const TOKEN = recourseEnv.KEYWIRE_SERVICE_TOKEN || process.env.KEYWIRE_SERVICE_TOKEN || '';
  if (!TOKEN) { console.error('KEYWIRE_SERVICE_TOKEN not found in .env'); process.exit(1); }

  const src = parseEnvFile('C:/Users/User/Downloads/Uplift/02_Pillars/Overlay Science/Overlay Oncology/.env.local');
  const keys = ['PHOENIX_API_KEY', 'PHOENIX_BASE_URL', 'PHOENIX_DEFAULT_MODEL', 'PHOENIX_REASONING_MODEL', 'PHOENIX_FAST_MODEL'];
  const secrets = {};
  for (const k of keys) if (src[k]) secrets[k] = src[k];
  if (!secrets.PHOENIX_API_KEY) { console.error('PHOENIX_API_KEY not found in Overlay Oncology .env.local'); process.exit(1); }

  const ex = await fetch(`${BASE}/api/v1/auth/service-token/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: TOKEN }),
  });
  if (!ex.ok) { console.error('exchange failed', ex.status, (await ex.text()).slice(0, 200)); process.exit(1); }
  const { accessToken } = await ex.json();
  console.log('exchanged JWT ok');

  for (const [key, value] of Object.entries(secrets)) {
    const res = await fetch(`${BASE}/api/v1/projects/${PROJECT}/envs/${ENV_SLUG}/secrets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ key, value }),
    });
    if (res.ok) console.log(`  created/updated ${key}`);
    else if (res.status === 409) console.log(`  already present ${key}`);
    else console.log(`  FAILED ${key}: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });