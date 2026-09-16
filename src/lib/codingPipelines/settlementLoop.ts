/**
 * Settlement harness entry point used by the benchmark pipeline.
 *
 * The upstream supervisor's CLI (`tsx settlement-supervisor.ts <contract>
 * <worktree> <executable>`) hard-codes `tool_call_timeout_ms = 30000`, which is
 * too short for a live model iteration (each adapter turn is at least one LLM
 * call). This wrapper imports the same supervisor function and supplies
 * benchmark-appropriate options without forking the harness internals.
 *
 * Invoked as:
 *   tsx settlementLoop.ts <contract-path> <worktree> "<agent-executable>" [max-actions]
 *
 * Env:
 *   SETTLEMENT_HARNESS_DIR     harness checkout (default ~/Downloads/settlement-harness)
 *   SETTLEMENT_TOOL_TIMEOUT_MS per-tool-call read timeout (default 600000)
 *   SETTLEMENT_MAX_ACTIONS     runaway-loop cap (default 16)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

function harnessDir(): string {
  return (
    process.env.SETTLEMENT_HARNESS_DIR?.trim() ||
    path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Downloads', 'settlement-harness')
  );
}

async function main(): Promise<void> {
  const [contractPath, worktree, agentExecutable, maxActionsArg] = process.argv.slice(2);
  if (!contractPath || !worktree || !agentExecutable) {
    throw new Error('usage: settlementLoop.ts <contract-path> <worktree> "<agent-executable>" [max-actions]');
  }

  const supervisor = path.join(harnessDir(), 'settlement-supervisor.ts');
  if (!fs.existsSync(supervisor)) throw new Error(`settlement supervisor not found: ${supervisor}`);

  const mod = (await import(pathToFileURL(supervisor).href)) as {
    settlementHarnessLoop: (
      contract: string,
      root: string,
      executable: string,
      options?: Record<string, unknown>,
    ) => Promise<unknown>;
  };

  const result = await mod.settlementHarnessLoop(contractPath, worktree, agentExecutable, {
    tool_call_timeout_ms: Number(process.env.SETTLEMENT_TOOL_TIMEOUT_MS || 600_000),
    max_actions: Number(maxActionsArg || process.env.SETTLEMENT_MAX_ACTIONS || 16),
    doom_max_repeats: Number(process.env.SETTLEMENT_DOOM_MAX_REPEATS || 3),
  });

  console.log('[settlementLoop] result:', JSON.stringify(result));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
