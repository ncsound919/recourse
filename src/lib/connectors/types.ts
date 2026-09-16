/**
 * connectors/types.ts — contracts for the generic connector framework (Wave 3).
 *
 * Integrations were ~28 bespoke clients with their own env URLs and parsers.
 * A connector manifest makes an integration declarative and discoverable, and a
 * single health probe replaces the ad-hoc `/status` routes.
 */

export type ConnectorKind = 'webhook' | 'rest' | 'sidecar' | 'mcp' | 'a2a';

export interface ConnectorAuth {
  type: 'none' | 'bearer' | 'hmac' | 'oauth2';
  /** Env var holding the secret/token (never the secret itself). */
  secretEnv?: string;
}

export interface ConnectorManifest {
  id: string;
  name: string;
  version: string;
  kind: ConnectorKind;
  baseUrl?: string;
  auth?: ConnectorAuth;
  /** Path appended to baseUrl for the health probe (default `/health`). */
  healthPath?: string;
  description?: string;
}

export interface ConnectorHealth {
  id: string;
  ok: boolean;
  status?: number;
  latencyMs?: number;
  error?: string;
}

export interface WebhookDeliveryResult {
  ok: boolean;
  status: number;
  attempts: number;
  error?: string;
  body?: string;
}
