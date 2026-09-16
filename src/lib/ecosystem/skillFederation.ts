/**
 * skillFederation.ts — the bridge between the Wave 3 signed skill registry and
 * the Wave 4 federation sync seam. `createFederationRouter` accepts injected
 * `exportItems`/`importItems` providers; this supplies them so skills actually
 * replicate between trusted peers (rather than being a dead seam).
 *
 * Imported entries keep their ORIGIN signature (never re-signed locally) and
 * merge newer-wins by `publishedAt`, matching the federation conflict rule.
 */
import type { SkillRegistry } from '../skillRegistry';
import { makeSyncItem, type SyncItem, type SyncKind } from '../federation/sync';

export interface FederationItemProviders {
  exportItems(kind: SyncKind): SyncItem[];
  importItems(kind: SyncKind, items: SyncItem[]): number;
}

export function federationSkillProviders(registry: SkillRegistry): FederationItemProviders {
  return {
    exportItems(kind) {
      if (kind !== 'skill') return [];
      return registry.list().map((e) => makeSyncItem('skill', e.id, e, e.publishedAt));
    },
    importItems(kind, items) {
      if (kind !== 'skill') return 0;
      let applied = 0;
      for (const item of items) {
        const payload = item.payload as Record<string, unknown> | null;
        if (!payload || typeof payload !== 'object') continue;
        if (typeof payload.id !== 'string' || typeof payload.name !== 'string' || typeof payload.version !== 'string') continue;
        const result = registry.importEntry({
          id: payload.id,
          name: payload.name,
          version: payload.version,
          description: typeof payload.description === 'string' ? payload.description : '',
          domain: typeof payload.domain === 'string' ? payload.domain : undefined,
          toolName: typeof payload.toolName === 'string' ? payload.toolName : undefined,
          sourceHash: typeof payload.sourceHash === 'string' ? payload.sourceHash : undefined,
          license: typeof payload.license === 'string' ? payload.license : undefined,
          author: typeof payload.author === 'string' ? payload.author : undefined,
          publishedAt: typeof payload.publishedAt === 'number' ? payload.publishedAt : item.updatedAt,
          signature: typeof payload.signature === 'string' ? payload.signature : undefined,
        });
        if (result.ok && result.applied) applied += 1;
      }
      return applied;
    },
  };
}
