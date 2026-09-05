#!/usr/bin/env tsx
/**
 * checkpoint.ts — CLI for listing, approving, and rejecting checkpoints.
 *
 * Usage:
 *   tsx scripts/checkpoint.ts list [--slug=<business-slug>]
 *   tsx scripts/checkpoint.ts approve --id=<checkpoint-id> [--notes="..."]
 *   tsx scripts/checkpoint.ts reject --id=<checkpoint-id> [--notes="..."]
 *
 * The CLI uses the FileCheckpointStore by default, looking in
 * data/business-profiles/<slug>/checkpoints/
 */

import { FileCheckpointStore, resolveCheckpoint, evaluateCheckpointTimeout } from '../src/autopilot/checkpoint';
import { DEFAULT_CHECKPOINTS_DIR, listBusinessSlugs } from '../src/autopilot/businessProfile';

function parseArgs(argv: string[]): { cmd: string; slug?: string; id?: string; notes?: string } {
  let cmd = '';
  let slug: string | undefined;
  let id: string | undefined;
  let notes: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const [key, ...rest] = arg.slice(2).split('=');
      if (key === 'slug') slug = rest.join('=') || argv[++i];
      else if (key === 'id') id = rest.join('=') || argv[++i];
      else if (key === 'notes') notes = rest.join('=');
    } else if (!cmd) {
      cmd = arg;
    }
  }
  return { cmd, slug, id, notes };
}

const { cmd, slug, id, notes } = parseArgs(process.argv.slice(2));
const store = new FileCheckpointStore(DEFAULT_CHECKPOINTS_DIR);
const now = new Date();

if (!cmd) {
  console.log(`
checkpoint.ts — manage interactive-veto checkpoints

Usage:
  tsx scripts/checkpoint.ts <command> [options]

Commands:
  list [--slug=<business-slug>]    List all pending checkpoints
  approve --id=<checkpoint-id> [--notes="..."]    Approve a checkpoint
  reject --id=<checkpoint-id> [--notes="..."]     Reject a checkpoint
  expire --id=<checkpoint-id>              Mark a checkpoint as expired

Options:
  --slug=<val>  Business slug for filtering list
  --id=<val>    Checkpoint ID (required for approve/reject/expire)
  --notes=<val> Optional reviewer notes
`);
  process.exit(0);
}

async function main(): Promise<void> {
  switch (cmd) {
    case 'list': {
      let checkpoints = [];
      if (slug) {
        checkpoints = await store.list(slug);
      } else {
        for (const s of listBusinessSlugs()) {
          const list = await store.list(s);
          checkpoints.push(...list);
        }
      }
      const pending = checkpoints.filter((c) => c.status === 'pending');
      console.log(`[checkpoint] found ${pending.length} pending checkpoints`);
      for (const c of pending) {
        const expired = evaluateCheckpointTimeout(c, now);
        const status = expired ? 'EXPIRED' : c.status;
        console.log(`  [${c.id}] PR #${c.prNumber} @ ${c.createdAt} (${status})`);
        if (c.reviewerNotes) console.log(`    notes: ${c.reviewerNotes}`);
      }
      break;
    }

    case 'approve': {
      if (!id) {
        console.error('error: --id is required');
        process.exit(1);
      }
      const result = await resolveCheckpoint({ checkpointId: id, action: 'approve', store, now, reviewerNotes: notes });
      if (!result) {
        console.error(`error: checkpoint ${id} not found`);
        process.exit(1);
      }
      console.log(`[checkpoint] approved ${id}`);
      break;
    }

    case 'reject': {
      if (!id) {
        console.error('error: --id is required');
        process.exit(1);
      }
      const result = await resolveCheckpoint({ checkpointId: id, action: 'reject', store, now, reviewerNotes: notes });
      if (!result) {
        console.error(`error: checkpoint ${id} not found`);
        process.exit(1);
      }
      console.log(`[checkpoint] rejected ${id}`);
      break;
    }

    case 'expire': {
      if (!id) {
        console.error('error: --id is required');
        process.exit(1);
      }
      const checkpoint = await store.load(id);
      if (!checkpoint) {
        console.error(`error: checkpoint ${id} not found`);
        process.exit(1);
      }
      await store.remove(id);
      console.log(`[checkpoint] removed ${id}`);
      break;
    }

    default:
      console.error(`error: unknown command '${cmd}'`);
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(`[checkpoint] fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
