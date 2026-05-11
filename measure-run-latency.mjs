/**
 * Quick Playwright timing measurement: trigger a workflow run and measure
 * time-to-completed on the canvas.
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const {
  chromium,
} = require("/home/cblokland/projects/made/codemation/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.js");

const BASE_URL = "http://localhost:3000";
const WORKFLOW_ID = "wf.dev.canvasLayoutStress";

const browser = await chromium.launch({ headless: true, slowMo: 0 });
const page = await browser.newPage();

// Collect all console logs tagged [codemation]
const logs = [];
page.on("console", (msg) => {
  const text = msg.text();
  if (
    text.includes("realtime") ||
    text.includes("websocket") ||
    text.includes("runSaved") ||
    text.includes("nodeCompleted") ||
    text.includes("codemation")
  ) {
    logs.push(`[${msg.type()}] ${Date.now()} ${text}`);
  }
});

// Intercept WS messages
const wsMessages = [];
page.on("websocket", (ws) => {
  console.log("WS opened:", ws.url());
  ws.on("framereceived", ({ payload }) => {
    const data =
      typeof payload === "string" ? payload : Buffer.isBuffer(payload) ? payload.toString("utf8") : "<binary>";
    wsMessages.push({ t: Date.now(), wsUrl: ws.url(), data });
  });
  ws.on("framesent", ({ payload }) => {
    const data =
      typeof payload === "string" ? payload : Buffer.isBuffer(payload) ? payload.toString("utf8") : "<binary>";
    wsMessages.push({ t: Date.now(), sent: true, wsUrl: ws.url(), data });
  });
});

// Programmatic login (mirrors CodemationPlaywrightUiHarness.signInWithLocalCredentials)
await page.goto(`${BASE_URL}/login`);
await page.waitForLoadState("domcontentloaded");
const loginResult = await page.evaluate(async (baseUrl) => {
  // Bootstrap CSRF token
  await fetch(`${baseUrl}/api/auth/session`, { credentials: "include" });
  const cookie = document.cookie
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith("__Host-codemation.csrf-token=") || p.startsWith("codemation.csrf-token="));
  if (!cookie) return { error: "no csrf cookie" };
  const csrfToken = decodeURIComponent(cookie.split("=").slice(1).join("="));
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-codemation-csrf-token": csrfToken },
    body: JSON.stringify({ email: "test@measure.local", password: "TestPass123!" }),
  });
  return { status: res.status, body: await res.text() };
}, BASE_URL);
console.log("Login result:", loginResult);

await page.goto(`${BASE_URL}/workflows/${WORKFLOW_ID}`);
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(2000);
console.log("Page URL:", page.url());

// Intercept API requests for timing
const httpTimings = [];
page.on("request", (req) => {
  if (req.url().includes("/api/") && (req.method() === "POST" || req.method() === "PATCH")) {
    httpTimings.push({ t: Date.now(), method: req.method(), url: req.url() });
  }
});
page.on("response", (res) => {
  if (res.url().includes("/api/") && (res.request().method() === "POST" || res.request().method() === "PATCH")) {
    httpTimings.push({ t: Date.now(), status: res.status(), url: res.url() });
  }
});

// Click run button
const runBtn = page.getByTestId("canvas-run-workflow-button").last();
await runBtn.waitFor({ timeout: 30_000 });

console.log("=== Clicking run button ===");
const t0 = Date.now();
await runBtn.click();

// Wait for any canvas node to reach "completed"
let completedAt = null;
try {
  await page.waitForFunction(
    () => {
      const cards = document.querySelectorAll("[data-codemation-node-status]");
      for (const card of cards) {
        if (card.getAttribute("data-codemation-node-status") === "completed") return true;
      }
      return false;
    },
    { timeout: 30_000, polling: 100 },
  );
  completedAt = Date.now();
  console.log(`✅ Canvas node reached 'completed' in ${completedAt - t0}ms`);
} catch {
  console.log(`❌ Timed out waiting for 'completed'`);
}

await page.waitForTimeout(1000);

console.log("\n=== HTTP timings ===");
for (const h of httpTimings) {
  const label = h.status !== undefined ? `← ${h.status}` : `→ ${h.method}`;
  console.log(`  t+${h.t - t0}ms ${label} ${h.url.replace(/.*localhost:\d+/, "")}`);
}

console.log("\n=== WS messages on /api/workflows/ws ===");
for (const m of wsMessages) {
  if (!m.wsUrl.includes("/api/workflows/ws")) continue;
  if (!m.sent) {
    try {
      const parsed = JSON.parse(m.data);
      const kind = parsed.kind || parsed.event?.kind || "?";
      console.log(`  t+${m.t - t0}ms ← ${kind}: ${m.data.slice(0, 200)}`);
    } catch {
      console.log(`  t+${m.t - t0}ms ← (unparsed) ${m.data.slice(0, 120)}`);
    }
  } else {
    try {
      const parsed = JSON.parse(m.data);
      console.log(`  t+${m.t - t0}ms → ${JSON.stringify(parsed).slice(0, 120)}`);
    } catch {
      console.log(`  t+${m.t - t0}ms → ${m.data.slice(0, 80)}`);
    }
  }
}

console.log("\n=== Console logs ===");
for (const l of logs) console.log(" ", l);

await browser.close();
