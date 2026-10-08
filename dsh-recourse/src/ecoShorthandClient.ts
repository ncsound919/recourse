/**
 * ecoShorthandClient.ts — EcoShorthand integration for the DSH harness.
 *
 * Wraps the existing RecourseApi with EcoShorthand encoding.
 * Messages are encoded in the compact DSL format, reducing token
 * usage by 70-80% compared to JSON.
 *
 * Usage:
 *   const client = new EcoShorthandClient(api);
 *   const response = await client.send({
 *     src: "dsh", dst: "recourse", op: "?", path: "user.*", type: "user"
 *   });
 */

import { encode, decode, encodeBinary, decodeBinary, encodeBatch, decodeBatch, type Message, type Service } from "./ecoShorthand.js";
import type { RecourseApi } from "./api.js";

export interface EcoShorthandClientOptions {
  /** The RecourseApi instance to wrap. */
  api: RecourseApi;
  /** Use binary encoding (default: text). */
  binary?: boolean;
}

export class EcoShorthandClient {
  private api: RecourseApi;
  private binary: boolean;

  constructor(options: EcoShorthandClientOptions) {
    this.api = options.api;
    this.binary = options.binary ?? false;
  }

  /**
   * Send an EcoShorthand message to Recourse.
   */
  async send(message: Message): Promise<Message> {
    const encoded = this.binary ? encodeBinary(message) : encode(message);

    const headers: Record<string, string> = {
      "Content-Type": this.binary ? "application/octet-stream" : "text/plain",
    };
    if (this.api.hasSecret) {
      headers.Authorization = `Bearer ${this.api.getSecret()}`;
    }

    const response = await fetch(`${this.api.baseUrl}/api/eco`, {
      method: "POST",
      headers,
      body: this.binary ? encoded : encoded,
    });

    if (!response.ok) {
      throw new Error(`EcoShorthand request failed: HTTP ${response.status}`);
    }

    if (this.binary) {
      const data = new Uint8Array(await response.arrayBuffer());
      return decodeBinary(data);
    } else {
      const text = await response.text();
      return decode(text);
    }
  }

  /**
   * Send a batch of messages in one frame.
   */
  async sendBatch(messages: Message[]): Promise<Message[]> {
    const encoded = encodeBatch(messages);

    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
    };
    if (this.api.hasSecret) {
      headers.Authorization = `Bearer ${this.api.getSecret()}`;
    }

    const response = await fetch(`${this.api.baseUrl}/api/eco/batch`, {
      method: "POST",
      headers,
      body: encoded,
    });

    if (!response.ok) {
      throw new Error(`EcoShorthand batch request failed: HTTP ${response.status}`);
    }

    const data = new Uint8Array(await response.arrayBuffer());
    return decodeBatch(data);
  }

  /**
   * Encode a message to EcoShorthand format (for debugging).
   */
  encode(message: Message): string {
    return encode(message);
  }

  /**
   * Decode an EcoShorthand message (for debugging).
   */
  decode(encoded: string): Message {
    return decode(encoded);
  }
}

// Re-export types
export type { Message, Service };
export { encode, decode, encodeBinary, decodeBinary, encodeBatch, decodeBatch };
