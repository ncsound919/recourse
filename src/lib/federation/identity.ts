/**
 * identity.ts — Ed25519 instance identity for the federation layer.
 *
 * A Recourse instance is identified by an Ed25519 keypair. The public key is its
 * addressable identity; the private key signs every outbound envelope. The
 * instance id is DERIVED from the public key fingerprint, so two instances can
 * never claim the same id without also presenting the same key.
 *
 * Security: the private key is written to `data/federation/identity.json` and
 * must be treated as a secret (never returned by any HTTP surface). Only
 * `publicIdentity()` is exposed over the network.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { readJsonFile, writeJsonFile } from '../durableJson.js';

export interface InstanceIdentity {
  instanceId: string;
  name: string;
  /** base64 SPKI DER public key. */
  publicKey: string;
  /** base64 PKCS8 DER private key — SECRET. */
  privateKey: string;
  createdAt: number;
}

export interface PublicIdentity {
  instanceId: string;
  name: string;
  publicKey: string;
  fingerprint: string;
  createdAt: number;
}

export function identityFile(): string {
  return process.env.RECOURSE_FEDERATION_IDENTITY_FILE || path.join(process.cwd(), 'data', 'federation', 'identity.json');
}

/** SHA-256 fingerprint of a base64 SPKI public key (32 hex chars). */
export function fingerprintOf(publicKeyB64: string): string {
  const der = Buffer.from(publicKeyB64, 'base64');
  return crypto.createHash('sha256').update(der).digest('hex').slice(0, 32);
}

export function instanceIdFromPublicKey(publicKeyB64: string): string {
  return `inst_${fingerprintOf(publicKeyB64).slice(0, 16)}`;
}

export function generateIdentity(name = 'recourse'): InstanceIdentity {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const priv = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  return {
    instanceId: instanceIdFromPublicKey(pub),
    name,
    publicKey: pub,
    privateKey: priv,
    createdAt: Date.now(),
  };
}

export function publicIdentity(identity: InstanceIdentity): PublicIdentity {
  return {
    instanceId: identity.instanceId,
    name: identity.name,
    publicKey: identity.publicKey,
    fingerprint: fingerprintOf(identity.publicKey),
    createdAt: identity.createdAt,
  };
}

function privateKeyObject(b64: string): crypto.KeyObject {
  return crypto.createPrivateKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'pkcs8' });
}

function publicKeyObject(b64: string): crypto.KeyObject {
  return crypto.createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' });
}

/** Sign a UTF-8 message with the instance's private key (base64 signature). */
export function signMessage(identity: Pick<InstanceIdentity, 'privateKey'>, message: string): string {
  const sig = crypto.sign(null, Buffer.from(message, 'utf-8'), privateKeyObject(identity.privateKey));
  return sig.toString('base64');
}

/** Constant-time Ed25519 verification. Returns false on any malformed input. */
export function verifyMessage(publicKeyB64: string, message: string, signatureB64: string): boolean {
  try {
    return crypto.verify(
      null,
      Buffer.from(message, 'utf-8'),
      publicKeyObject(publicKeyB64),
      Buffer.from(signatureB64, 'base64'),
    );
  } catch {
    return false;
  }
}

function isIdentity(x: unknown): x is InstanceIdentity {
  if (!x || typeof x !== 'object') return false;
  const i = x as Record<string, unknown>;
  return (
    typeof i.instanceId === 'string' &&
    typeof i.publicKey === 'string' &&
    typeof i.privateKey === 'string' &&
    typeof i.createdAt === 'number'
  );
}

/** Load the persisted identity, or create + persist one on first boot. */
export function loadOrCreateIdentity(file = identityFile(), name = 'recourse'): InstanceIdentity {
  const existing = readJsonFile<unknown>(file, null);
  if (isIdentity(existing)) {
    // Guard against a tampered/mismatched id: always trust the key.
    const derived = instanceIdFromPublicKey(existing.publicKey);
    if (existing.instanceId !== derived) return { ...existing, instanceId: derived };
    return existing;
  }
  const identity = generateIdentity(name);
  writeJsonFile(file, identity);
  return identity;
}
