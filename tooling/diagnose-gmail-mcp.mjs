#!/usr/bin/env node
// One-shot diagnostic: load the Gmail credential's stored OAuth2 material, decrypt the
// access token, then probe Gmail API + Gmail MCP API directly so we can see the *actual*
// 403 body (Google embeds a structured reason that the MCP transport hides).
//
// Run with:
//   pnpm tsx tooling/diagnose-gmail-mcp.mjs <credentialInstanceId>
// from the framework root. CredentialInstanceId is required (UUID).

import { DatabaseSync } from "node:sqlite";
import { createDecipheriv, hkdfSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dbPath = path.join(repoRoot, "apps/test-dev/.codemation/codemation.sqlite");
const envPath = path.join(repoRoot, "apps/test-dev/.env");

const instanceId = process.argv[2];
if (!instanceId) {
  console.error("usage: pnpm tsx tooling/diagnose-gmail-mcp.mjs <credentialInstanceId>");
  process.exit(1);
}

function loadEnv(p) {
  const env = {};
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv(envPath);
const masterKeyB64 = env.CODEMATION_CREDENTIALS_MASTER_KEY;
if (!masterKeyB64) {
  console.error("FATAL: CODEMATION_CREDENTIALS_MASTER_KEY not in apps/test-dev/.env");
  process.exit(1);
}
const ikm = Buffer.from(masterKeyB64.trim(), "base64");
if (ikm.length !== 32) {
  console.error(`FATAL: master key must decode to 32 bytes, got ${ikm.length}`);
  process.exit(1);
}
const aesKey = Buffer.from(
  hkdfSync(
    "sha256",
    ikm,
    Buffer.from("codemation/credential-cipher/v1", "utf8"),
    Buffer.from("aes-256-gcm-key", "utf8"),
    32,
  ),
);

const db = new DatabaseSync(dbPath, { readOnly: true });
const row = db.prepare("SELECT encrypted_json FROM CredentialOAuth2Material WHERE instance_id = ?").get(instanceId);
if (!row) {
  console.error(`FATAL: no OAuth2 material for instance ${instanceId}`);
  process.exit(1);
}

const packed = Buffer.from(row.encrypted_json, "base64");
const iv = packed.subarray(0, 12);
const authTag = packed.subarray(12, 28);
const encrypted = packed.subarray(28);
const decipher = createDecipheriv("aes-256-gcm", aesKey, iv);
decipher.setAuthTag(authTag);
const material = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8"));
const accessToken = material.accessToken;
console.log(`Loaded access token (length=${accessToken.length})`);
console.log(`Stored scopes: ${material.grantedScopes}`);

// 1. tokeninfo (Google introspection)
const tokeninfo = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`)
  .then((r) => r.json())
  .catch((e) => ({ fetchError: String(e) }));
console.log("\n=== tokeninfo ===");
console.log(JSON.stringify(tokeninfo, null, 2));

// 2. Gmail API getProfile (sanity — credential test already passes this)
const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
  headers: { authorization: `Bearer ${accessToken}` },
});
console.log("\n=== Gmail API users.getProfile ===");
console.log(`status: ${profileRes.status} ${profileRes.statusText}`);
console.log(`body: ${(await profileRes.text()).slice(0, 600)}`);

// 3. Gmail API messages.list — exercises gmail.readonly properly (not just identity)
const messagesRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1", {
  headers: { authorization: `Bearer ${accessToken}` },
});
console.log("\n=== Gmail API users.messages.list ===");
console.log(`status: ${messagesRes.status} ${messagesRes.statusText}`);
console.log(`body: ${(await messagesRes.text()).slice(0, 600)}`);

// 4. Gmail MCP tools/list — pull the FULL tool catalog with schemas
const mcpToolsList = await fetch("https://gmailmcp.googleapis.com/mcp/v1", {
  method: "POST",
  headers: {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
});
const toolsListJson = await mcpToolsList.json();
console.log("\n=== Gmail MCP tools/list ===");
console.log(`status: ${mcpToolsList.status}`);
const tools = toolsListJson.result?.tools ?? [];
console.log(`tool names: ${tools.map((t) => t.name).join(", ")}`);
const searchThreads = tools.find((t) => t.name === "search_threads");
if (searchThreads) {
  console.log("\nsearch_threads schema:");
  console.log(JSON.stringify(searchThreads.inputSchema, null, 2));
}

// 5. Gmail MCP search_threads with NO args (let server use defaults — sees pure 403 if perm issue)
const mcpSearchEmpty = await fetch("https://gmailmcp.googleapis.com/mcp/v1", {
  method: "POST",
  headers: {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "search_threads", arguments: {} },
  }),
});
console.log("\n=== Gmail MCP tools/call search_threads (empty args) ===");
console.log(`status: ${mcpSearchEmpty.status}`);
console.log(`body: ${(await mcpSearchEmpty.text()).slice(0, 1500)}`);

// 6. Try every tool with empty args and see which fail (and how)
for (const tool of tools) {
  const callRes = await fetch("https://gmailmcp.googleapis.com/mcp/v1", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 100,
      method: "tools/call",
      params: { name: tool.name, arguments: {} },
    }),
  });
  const text = await callRes.text();
  let summary = text.slice(0, 200);
  try {
    const j = JSON.parse(text);
    summary = j.result?.content?.[0]?.text ?? j.error?.message ?? text.slice(0, 200);
  } catch {}
  console.log(`${callRes.status} ${tool.name.padEnd(20)} → ${summary}`);
}

// 7. Confirm whether get_thread (which needs gmail.readonly only) also fails — using a
// real thread id we just got from the direct Gmail API call.
const realThreadId = "19e5571b2264ea29";
const getThreadCall = await fetch("https://gmailmcp.googleapis.com/mcp/v1", {
  method: "POST",
  headers: {
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 300,
    method: "tools/call",
    params: { name: "get_thread", arguments: { threadId: realThreadId } },
  }),
});
const getThreadText = await getThreadCall.text();
console.log(`\n=== get_thread with real threadId=${realThreadId} ===`);
console.log(`status: ${getThreadCall.status}`);
console.log(`body: ${getThreadText.slice(0, 800)}`);

db.close();
