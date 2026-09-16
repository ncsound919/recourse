/**
 * approvals.ts — durable human-approval queue for actions the policy engine
 * marks `require_approval` (deployments, large spend, autonomous merges).
 *
 * Wave 2: "human_approval" must be a real gate, not a status string. A request
 * is appended, then a named operator decides it; only `approved` requests may
 * proceed. Every decision records who and when (audit trail).
 */
import path from 'node:path';
import { readJsonFile, writeJsonFile } from './durableJson';
import type { PolicyAction } from './policy';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ApprovalRequest {
  id: string;
  at: number;
  action: PolicyAction;
  requestedBy?: string;
  reason: string;
  status: ApprovalStatus;
  decidedBy?: string;
  decidedAt?: number;
  decisionNote?: string;
}

export interface ApprovalStore {
  file(): string;
  /** Append a new pending request. */
  request(input: { action: PolicyAction; requestedBy?: string; reason?: string }): ApprovalRequest;
  list(opts?: { status?: ApprovalStatus; limit?: number }): ApprovalRequest[];
  get(id: string): ApprovalRequest | undefined;
  /** Decide a pending request. Returns an error object if not pending/unknown. */
  decide(
    id: string,
    status: 'approved' | 'rejected',
    decidedBy?: string,
    note?: string,
  ): ApprovalRequest | { error: string };
  pendingCount(): number;
}

interface ApprovalDoc {
  version: number;
  sequence: number;
  requests: ApprovalRequest[];
}

export function approvalsFile(): string {
  return process.env.RECOURSE_APPROVALS_FILE || path.join(process.cwd(), 'data', 'approvals.json');
}

const EMPTY: ApprovalDoc = { version: 1, sequence: 0, requests: [] };

export function openApprovalStore(file = approvalsFile()): ApprovalStore {
  let doc = readJsonFile<ApprovalDoc>(file, { ...EMPTY, requests: [] });
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.requests)) doc = { ...EMPTY, requests: [] };

  const persist = () => writeJsonFile(file, doc);

  return {
    file: () => file,
    request({ action, requestedBy, reason }) {
      doc.sequence += 1;
      const entry: ApprovalRequest = {
        id: `apr_${doc.sequence}`,
        at: Date.now(),
        action,
        requestedBy,
        reason: reason ?? `approval required for ${action.kind}`,
        status: 'pending',
      };
      doc.requests.push(entry);
      persist();
      return { ...entry, action: { ...entry.action } };
    },
    list(opts = {}) {
      let out = doc.requests;
      if (opts.status) out = out.filter((r) => r.status === opts.status);
      const limit = opts.limit ?? out.length;
      return out.slice(-limit).map((r) => ({ ...r, action: { ...r.action } }));
    },
    get(id) {
      const r = doc.requests.find((x) => x.id === id);
      return r ? { ...r, action: { ...r.action } } : undefined;
    },
    decide(id, status, decidedBy, note) {
      const r = doc.requests.find((x) => x.id === id);
      if (!r) return { error: `no approval request "${id}"` };
      if (r.status !== 'pending') return { error: `request "${id}" is already ${r.status}` };
      r.status = status;
      r.decidedAt = Date.now();
      if (decidedBy) r.decidedBy = decidedBy;
      if (note) r.decisionNote = note;
      persist();
      return { ...r, action: { ...r.action } };
    },
    pendingCount() {
      return doc.requests.filter((r) => r.status === 'pending').length;
    },
  };
}
