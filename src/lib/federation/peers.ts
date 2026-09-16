/**
 * peers.ts — the durable federation peer registry.
 *
 * A peer is another Recourse instance this one may sync with. Peers are
 * default-UNTRUSTED: `add` records them as `pending`, and only a trusted peer
 * may be pushed to / pulled from. This mirrors the capability sandbox's
 * default-deny discipline — adding an address never grants access.
 */
import path from 'node:path';
import { readJsonFile, writeJsonFile } from '../durableJson.js';
import { instanceIdFromPublicKey } from './identity.js';

export type PeerTrust = 'pending' | 'trusted' | 'blocked';
export type PeerStatus = 'unknown' | 'online' | 'offline';

export interface Peer {
  instanceId: string;
  name: string;
  url: string;
  publicKey: string;
  trust: PeerTrust;
  status: PeerStatus;
  addedAt: number;
  lastSeenAt?: number;
  lastError?: string;
  capabilities?: string[];
}

export interface PeerInput {
  name?: string;
  url: string;
  publicKey: string;
  trust?: PeerTrust;
  capabilities?: string[];
}

export interface PeerStore {
  file(): string;
  list(): Peer[];
  get(instanceId: string): Peer | undefined;
  add(input: PeerInput): Peer;
  remove(instanceId: string): boolean;
  setTrust(instanceId: string, trust: PeerTrust): Peer | undefined;
  setStatus(instanceId: string, status: PeerStatus, error?: string): Peer | undefined;
  touch(instanceId: string, at?: number): Peer | undefined;
  trusted(): Peer[];
}

export function peersFile(): string {
  return process.env.RECOURSE_FEDERATION_PEERS_FILE || path.join(process.cwd(), 'data', 'federation', 'peers.json');
}

interface PeerDoc {
  version: 1;
  peers: Peer[];
}

const DEFAULT_DOC: PeerDoc = { version: 1, peers: [] };

function normalizeUrl(url: string): string {
  const u = String(url ?? '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/.+/i.test(u)) throw new Error(`peer url must be http(s): ${url}`);
  return u;
}

function loadDoc(file: string): PeerDoc {
  const doc = readJsonFile<PeerDoc>(file, DEFAULT_DOC);
  if (!doc || !Array.isArray(doc.peers)) return { version: 1, peers: [] };
  return { version: 1, peers: doc.peers.filter((p) => p && typeof p.instanceId === 'string') };
}

export function openPeerStore(file = peersFile()): PeerStore {
  const save = (doc: PeerDoc): void => writeJsonFile(file, doc);
  const update = (id: string, mutate: (p: Peer) => void): Peer | undefined => {
    const doc = loadDoc(file);
    const peer = doc.peers.find((p) => p.instanceId === id);
    if (!peer) return undefined;
    mutate(peer);
    save(doc);
    return { ...peer };
  };

  return {
    file: () => file,
    list: () => loadDoc(file).peers.slice().sort((a, b) => a.addedAt - b.addedAt),
    get: (id) => loadDoc(file).peers.find((p) => p.instanceId === id),
    add(input) {
      const url = normalizeUrl(input.url);
      if (!input.publicKey || typeof input.publicKey !== 'string') throw new Error('peer publicKey is required');
      const instanceId = instanceIdFromPublicKey(input.publicKey);
      const doc = loadDoc(file);
      const existing = doc.peers.find((p) => p.instanceId === instanceId);
      if (existing) {
        existing.url = url;
        existing.name = input.name?.trim() || existing.name;
        if (input.capabilities) existing.capabilities = [...input.capabilities];
        save(doc);
        return { ...existing };
      }
      const peer: Peer = {
        instanceId,
        name: String(input.name ?? '').trim() || instanceId,
        url,
        publicKey: input.publicKey,
        trust: input.trust ?? 'pending',
        status: 'unknown',
        addedAt: Date.now(),
        capabilities: input.capabilities ? [...input.capabilities] : undefined,
      };
      doc.peers.push(peer);
      save(doc);
      return peer;
    },
    remove(id) {
      const doc = loadDoc(file);
      const before = doc.peers.length;
      doc.peers = doc.peers.filter((p) => p.instanceId !== id);
      if (doc.peers.length === before) return false;
      save(doc);
      return true;
    },
    setTrust: (id, trust) => update(id, (p) => { p.trust = trust; }),
    setStatus: (id, status, error) => update(id, (p) => {
      p.status = status;
      if (error === undefined) delete p.lastError;
      else p.lastError = error;
    }),
    touch: (id, at = Date.now()) => update(id, (p) => {
      p.lastSeenAt = at;
      p.status = 'online';
      delete p.lastError;
    }),
    trusted: () => loadDoc(file).peers.filter((p) => p.trust === 'trusted').sort((a, b) => a.addedAt - b.addedAt),
  };
}
