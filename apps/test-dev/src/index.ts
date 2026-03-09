import http from "node:http";
import { Engine, EngineWorkflowRunnerService, InMemoryCredentialService, createSimpleContainer, credentialId } from "@codemation/core";
import { workflows } from "./workflows";

const workflowsById = new Map(workflows.map((w) => [w.id, w] as const));

/**
 * Credentials are configured once at host startup.
 * You can bind them from anywhere (env, dotenv, secret managers, etc).
 */
const OPENAI_API_KEY = credentialId<string>("openai.apiKey");
const credentials = new InMemoryCredentialService().setFactory(OPENAI_API_KEY, () => {
  const v = process.env.OPENAI_API_KEY;
  if (!v) throw new Error("Missing env var: OPENAI_API_KEY");
  return v;
});

// Minimal webhook registrar placeholder.
const webhooks = new Map<string, (req: unknown) => Promise<unknown>>();

const host = {
  credentials,
  workflows: undefined as any,
  registerWebhook(spec: any) {
    const endpointId = `${spec.workflowId}.${spec.nodeId}.${spec.endpointKey}`;
    const path = `${spec.basePath}/${endpointId}`;
    webhooks.set(endpointId, spec.handler);
    return { endpointId, method: spec.method, path };
  },
  onNodeActivation(_stats: any) {
    // Placeholder: persist to RunStore for UI later
  },
};

const container = createSimpleContainer();
const engine = new Engine({
  container,
  host,
  makeRunId: () => `run_${Date.now()}_${Math.random().toString(16).slice(2)}`,
  makeActivationId: () => `act_${Date.now()}_${Math.random().toString(16).slice(2)}`,
});

host.workflows = new EngineWorkflowRunnerService(engine, workflowsById) as any;

await engine.start(workflows);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname === "/api/workflows") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(workflows.map((w) => ({ id: w.id, name: w.name }))));
    return;
  }

  if (url.pathname === "/api/run" && req.method === "POST") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as { workflowId: string };
    const wf = workflowsById.get(body.workflowId);
    if (!wf) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Unknown workflowId" }));
      return;
    }
    const result = await engine.runWorkflow(wf, wf.nodes.find((n) => n.kind === "trigger")?.id ?? wf.nodes[0]!.id, [{ json: {} }], undefined);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

const port = Number(process.env.PORT ?? 4000);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[test-dev] listening on http://localhost:${port}`);
});

