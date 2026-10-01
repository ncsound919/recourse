// Cloudflare Container entry for the Recourse KG sidecar (FastAPI/uvicorn).
import { Container } from "@cloudflare/containers";

export class Kg extends Container {
  defaultPort = 8080;
  sleepAfter = "10m";
  envVars = { PYTHONUNBUFFERED: "1" };
}

/** Durable Object binding supplied by the wrangler runtime. `@cloudflare/workers-types`
 *  is not a dependency of this sidecar package, so the shape the worker actually
 *  uses is declared here instead of leaving the name unresolved. */
interface DurableObjectNamespace {
  getByName(name: string): { fetch(request: Request): Promise<Response> };
}

interface Env {
  KG: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return await env.KG.getByName("primary").fetch(request);
  },
};
