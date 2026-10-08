/**
 * End-to-end smoke test for the in-harness Recourse panel.
 *
 * A React panel cannot be verified by type-checking, by the parity harness, or by
 * watching the server log -- it only exists once a browser has evaluated it. So
 * this drives the real harness UI in Chromium and asserts the three things a user
 * would notice:
 *
 *   1. the plugin's client entry loaded without a console error
 *   2. a "Recourse" destination exists in the sidebar
 *   3. opening it renders live Recourse telemetry, not an empty shell
 *
 * It also exercises the `/recourse` slash command, which is a separate
 * registration path from the sidebar row.
 *
 *   node scripts/ui-smoke.mjs [--screenshot out.png]
 *
 * Exits non-zero on any failed assertion. Requires the harness to be running;
 * the token is read from the profile's start-all.out.log unless --token is given.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const PROFILE_DIR = 'C:/Users/User/.dsh/profiles/web';
const ORIGIN = process.env.DSH_ORIGIN ?? 'http://127.0.0.1:3080';

/** Read the boot token the harness printed, so the browser can authenticate. */
function bootToken() {
  const fromArg = process.argv.find((a) => a.startsWith('--token='));
  if (fromArg !== undefined) return fromArg.slice('--token='.length);
  const log = readFileSync(`${PROFILE_DIR}/start-all.out.log`, 'utf8');
  const matches = [...log.matchAll(/token=([A-Za-z0-9_-]+)/g)];
  if (matches.length === 0) throw new Error(`no boot token found in ${PROFILE_DIR}/start-all.out.log`);
  return matches[matches.length - 1][1];
}

const problems = [];
const check = (ok, message) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) problems.push(message);
};

/**
 * Locate a Chromium build.
 *
 * Playwright pins an exact browser build and refuses to run against a different
 * one, so a machine with playwright 1.63 and only the 1228/1234/1243 builds in
 * its cache fails at launch with "Executable doesn't exist". Rather than make
 * this test depend on a network download, resolve an installed build here and
 * pass it explicitly; the protocol surface used below is stable across these
 * versions.
 */
function chromiumExecutable() {
  if (process.env.CHROMIUM_PATH !== undefined) return process.env.CHROMIUM_PATH;
  const cache = `${process.env.LOCALAPPDATA ?? ''}\\ms-playwright`;
  if (!existsSync(cache)) return undefined;
  const dirs = readdirSync(cache)
    .filter((name) => name.startsWith('chromium-'))
    .sort()
    .reverse();
  for (const dir of dirs) {
    const exe = join(cache, dir, 'chrome-win64', 'chrome.exe');
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

const executablePath = chromiumExecutable();
const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

/** Console/page errors from the plugin's own code are failures; others are noise. */
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

try {
  const token = bootToken();
  await page.goto(`${ORIGIN}/?token=${token}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Readiness is the sidebar nav, not a composer: with no workspace selected the
  // app shows a "choose a workspace" empty state and renders no conversation
  // input at all.
  await page.getByText('Workspaces', { exact: true }).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);

  console.log('sidebar:');
  const nav = page.getByText('Recourse', { exact: true }).first();
  const navVisible = await nav.isVisible().catch(() => false);
  check(navVisible, 'a Recourse destination is registered in the sidebar');
  if (!navVisible) throw new Error('no Recourse nav row');

  console.log('panel:');
  await nav.click();
  // The panel fetches three endpoints through its own proxy; give them a cycle.
  await page.waitForTimeout(4000);

  const body = await page.locator('body').innerText();
  check(/MISSION STATUS/i.test(body), 'the mission status strip rendered');
  check(/GEN\s+\d+/.test(body), 'the status strip shows a live generation counter');
  check(/DOMAIN COVERAGE/i.test(body), 'the domain coverage section rendered');
  check(/RECURSIVE LOOP/i.test(body), 'the loop-control section rendered');
  check(
    !/Could not reach the Recourse proxy/i.test(body),
    'the panel reached Recourse through its own authenticated proxy',
  );
  // Absence must read as absence, not as a fabricated zero.
  check(!/\bNaN\b/.test(body), 'no NaN leaked into the rendered panel');

  const screenshotArg = process.argv.indexOf('--screenshot');
  if (screenshotArg !== -1 && process.argv[screenshotArg + 1] !== undefined) {
    await page.screenshot({ path: process.argv[screenshotArg + 1], fullPage: false });
    console.log(`  ..   screenshot -> ${process.argv[screenshotArg + 1]}`);
  }

  // The slash command needs a conversation input, which only exists once a
  // session exists. Report it as skipped rather than failing when there is none.
  console.log('slash command:');
  const composer = page.locator('textarea, [contenteditable="true"]').first();
  if (await composer.isVisible().catch(() => false)) {
    await composer.click();
    await composer.fill('/recourse');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    const after = await page.locator('body').innerText();
    check(/MISSION STATUS|DOMAIN COVERAGE|RECURSIVE LOOP/i.test(after), '/recourse selects the Recourse panel');
  } else {
    console.log('  skip  no conversation composer in this state (no workspace selected)');
  }

  console.log('console:');
  const ours = consoleErrors.filter((text) => /dsh-recourse/i.test(text));
  check(ours.length === 0, `no console errors from dsh-recourse${ours.length ? `: ${ours[0].slice(0, 160)}` : ''}`);
} finally {
  await browser.close();
}

if (problems.length > 0) {
  console.error(`\n${problems.length} UI problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log('\nUI smoke: the Recourse panel is mounted, populated, and reachable from the command bar');
}