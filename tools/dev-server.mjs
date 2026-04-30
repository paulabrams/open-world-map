#!/usr/bin/env node
// Local dev server for the Open World map.
//
// Serves the static site from the repo root AND exposes /api/* endpoints
// that the browser can call to do AI-assisted hex generation. The whole
// thing runs on one port so there's no CORS dance.
//
// In production the site is hosted on GitHub Pages — no /api/* endpoints
// available, so the browser code feature-detects via /api/health and
// hides the Generate UI. The Anthropic API key never leaves this proxy.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-ant-... node tools/dev-server.mjs
//   # or put the key in .env at repo root and run:
//   node tools/dev-server.mjs
//
// Stops with Ctrl-C.

import { createServer } from "node:http";
import { readFile, stat, writeFile, rename } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { spawn, spawnSync } from "node:child_process";

const REPO = resolve(fileURLToPath(import.meta.url), "..", "..");
const PORT = parseInt(process.env.PORT || "8787", 10);

// --- Load env from the first matching location. Simple parser, no quoting.
// Priority: $OPEN_WORLD_ENV_FILE → ~/.config/open-world-map.env → repo .env.
// Putting the file in ~/.config keeps the secret out of the repo entirely.
function loadDotenv() {
  const candidates = [
    process.env.OPEN_WORLD_ENV_FILE,
    join(homedir(), ".config", "open-world-map.env"),
    join(REPO, ".env"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const txt = readFileSync(p, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(k in process.env)) process.env[k] = v;
    }
    console.log(`Loaded env from ${p}`);
    return;
  }
}
loadDotenv();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

// Pick a backend: explicit BACKEND env var wins, otherwise prefer Claude Code
// (uses the user's Pro/Max subscription) when the `claude` CLI is on PATH,
// else fall back to the Anthropic API. Setting BACKEND=api forces the API path.
function findClaudeCli() {
  const r = spawnSync("which", ["claude"], { encoding: "utf8" });
  if (r.status === 0) return (r.stdout || "").trim();
  return "";
}
const CLAUDE_CLI = findClaudeCli();
let BACKEND = (process.env.BACKEND || "").toLowerCase();
if (!BACKEND) {
  if (CLAUDE_CLI) BACKEND = "claude-code";
  else if (ANTHROPIC_API_KEY) BACKEND = "api";
  else BACKEND = "none";
}
const aiEnabled = (BACKEND === "claude-code" && !!CLAUDE_CLI)
               || (BACKEND === "api" && !!ANTHROPIC_API_KEY);

// --- Static file serving --------------------------------------------------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico":  "image/x-icon",
  ".txt":  "text/plain; charset=utf-8",
};

async function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  // Defence: clamp to repo root.
  const filePath = normalize(join(REPO, urlPath));
  if (!filePath.startsWith(REPO)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  try {
    const st = await stat(filePath);
    if (st.isDirectory()) {
      const indexPath = join(filePath, "index.html");
      if (existsSync(indexPath)) return serveFile(indexPath, res);
      res.writeHead(404); res.end("Not found"); return;
    }
    return serveFile(filePath, res);
  } catch {
    res.writeHead(404); res.end("Not found");
  }
}
async function serveFile(filePath, res) {
  const data = await readFile(filePath);
  const mime = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache" });
  res.end(data);
}

// --- /api/health: feature detection from the browser ---------------------
function apiHealth(req, res) {
  const body = JSON.stringify({
    ok: true,
    aiEnabled,
    backend: aiEnabled ? BACKEND : null,
    model: aiEnabled ? ANTHROPIC_MODEL : null,
  });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(body);
}

// --- Backends -------------------------------------------------------------
// runAnthropicApi: direct REST call. Requires ANTHROPIC_API_KEY + credits.
// runClaudeCli:    spawns the local `claude -p` CLI, which uses the user's
//                  Pro/Max subscription instead of API credits.
async function runAnthropicApi(system, userPrompt) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = (j.error && j.error.message) || j.message || text;
    } catch { /* keep raw */ }
    const err = new Error(`Anthropic ${resp.status}: ${msg}`);
    err.status = resp.status;
    throw err;
  }
  const json = await resp.json();
  return (json.content || []).map(c => c.text || "").join("").trim();
}

function runClaudeCli(system, userPrompt, opts = {}) {
  return new Promise((resolveP, rejectP) => {
    const args = [
      "-p",
      "--system-prompt", system,
      "--output-format", "json",
      "--model", ANTHROPIC_MODEL,
    ];
    if (opts.allowedTools && opts.allowedTools.length) {
      args.push("--allowedTools", opts.allowedTools.join(","));
    }
    if (opts.permissionMode) {
      args.push("--permission-mode", opts.permissionMode);
    }
    const tag = opts.tag || "claude";
    log(`[${tag}] spawn ${CLAUDE_CLI} ${args.map(a => a.length > 60 ? a.slice(0, 60) + "…" : a).join(" ")}`);
    const t0 = Date.now();
    const child = spawn(CLAUDE_CLI, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", d => stdout += d.toString());
    child.stderr.on("data", d => stderr += d.toString());
    child.on("error", rejectP);
    child.on("close", code => {
      log(`[${tag}] exited code=${code} in ${Date.now() - t0}ms (stdout=${stdout.length}b, stderr=${stderr.length}b)`);
      if (stderr.trim()) log(`[${tag}] stderr: ${stderr.trim().slice(0, 500)}`);
      if (code !== 0) {
        return rejectP(new Error(`claude exited ${code}: ${(stderr || stdout).slice(0, 500)}`));
      }
      let parsed;
      try { parsed = JSON.parse(stdout); }
      catch (e) { return rejectP(new Error("claude returned non-JSON: " + stdout.slice(0, 200))); }
      if (parsed.is_error) {
        return rejectP(new Error("claude reported error: " + (parsed.result || JSON.stringify(parsed))));
      }
      resolveP(String(parsed.result || "").trim());
    });
    child.stdin.write(userPrompt);
    child.stdin.end();
  });
}

// Persist the generated point to Supabase via the user-scope `open-world`
// MCP server. We invoke `claude -p` again with the capture_thought tool
// pre-allowed; the LLM figures out the exact argument schema from the
// MCP tool's own definition.
async function captureToMcp({ campaign, hex, parsed }) {
  const system = "You are a database integration helper. When asked to save a thought, call the open-world MCP capture_thought tool with the supplied fields and report a one-line confirmation.";
  const userPrompt = [
    "Save the following point to the open-world database using the open-world MCP `capture_thought` tool.",
    "Set thought_type to \"point\". Use the description as the content. Include all the metadata fields below.",
    "",
    `Campaign: ${campaign}`,
    `Hex: ${hex}`,
    `Name: ${parsed.name}`,
    `Point type: ${parsed.point_type}`,
    `Terrain: ${parsed.terrain}`,
    `Description: ${parsed.description}`,
    "",
    "After the tool call returns, reply with a one-line confirmation including the saved id (if any).",
  ].join("\n");
  return runClaudeCli(system, userPrompt, {
    allowedTools: ["mcp__open-world__capture_thought"],
    permissionMode: "acceptEdits",
    tag: "mcp-capture",
  });
}

function log(...args) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}]`, ...args);
}

// --- /api/generate-hex: AI-assisted hex generation -----------------------
//
// Body: { hex, terrain, campaign?, contextNodes?, hint? }
//   hex          — "CCRR" address
//   terrain      — terrain string from hex_terrain
//   campaign     — campaign name for tone (e.g. "The Basilisk Campaign")
//   contextNodes — array of nearby nodes (id, name, point_type, description)
//                  to ground generation in the existing world
//   hint         — optional GM hint (e.g. "should connect to the Trade Road")
//
// Returns: { name, point_type, terrain, description }
async function apiGenerateHex(req, res) {
  if (!aiEnabled) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }));
    return;
  }
  let body;
  try { body = await readJsonBody(req); }
  catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid JSON body: " + e.message }));
    return;
  }
  const { hex, terrain, campaign, contextNodes, nearbyRumors, hint, direction } = body || {};
  if (!hex || typeof hex !== "string") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "hex is required" }));
    return;
  }

  const system = [
    "You are a TTRPG content generator for a point-crawl hex map.",
    "When asked to generate a hex, output ONE concrete location: a single named place with a vivid 1-2 sentence description.",
    "The location should fit the campaign's tone, surrounding region, and the requested terrain.",
    "Avoid clichés (forgotten temples, generic ruins) — favour specific, surprising details: a person, a small mystery, a recent event, a sensory detail.",
    "If the input terrain is 'uncharted' or missing, invent a terrain that fits the nearby places (look at the surrounding hexes and pick a terrain consistent with them — extend forests, follow ridge lines, continue plains, etc.).",
    "Respond ONLY as a JSON object with these exact fields: {\"name\": string, \"point_type\": string, \"terrain\": string, \"description\": string}.",
    "Do not include preamble, code fences, or commentary — just the JSON.",
    "Valid point_type values: heart, fortress, tavern, settlement, wilderness, dungeon, sanctuary, tower, ruin, waypoint, lair.",
    "Valid terrain values: plains, forest, mountains, hills, forested-hills, swamp, marsh, farmland, lake, river, coast, desert, tundra, badlands, jungle, road. Pick one of these — never 'uncharted'.",
  ].join(" ");

  const ctxBlock = (contextNodes || [])
    .slice(0, 12)
    .map(n => `- ${n.name} (${n.point_type}, hex ${n.hex || "?"}): ${(n.description || "").slice(0, 200)}`)
    .join("\n");
  const rumorsBlock = (nearbyRumors || [])
    .slice(0, 6)
    .map(r => `- (hex ${r.hex || "?"}, ${r.reliability || "?"}) ${r.rumor || ""}`)
    .join("\n");

  const dirLabel = ({
    C: "the centre of the hex (no specific approach)",
    N: "the north edge",
    NE: "the north-east edge",
    SE: "the south-east edge",
    S: "the south edge",
    SW: "the south-west edge",
    NW: "the north-west edge",
  })[direction || ""];
  const userPrompt = [
    `Campaign: ${campaign || "(unspecified)"}`,
    `Hex to generate: ${hex}`,
    `Terrain: ${terrain || "unknown"}`,
    dirLabel ? `The exploring party enters from ${dirLabel}. Place the location near that side of the hex if it suggests a feature on the approach, and describe the first thing they see.` : "",
    hint ? `GM hint: ${hint}` : "",
    "",
    ctxBlock ? "Nearby places already on the map:" : "",
    ctxBlock,
    "",
    rumorsBlock ? "Local rumors known about this region (treat as background lore — don't repeat verbatim):" : "",
    rumorsBlock,
    "",
    "Generate one location for this hex.",
  ].filter(Boolean).join("\n");

  const reqStart = Date.now();
  log(`[generate-hex] START hex=${hex} terrain=${terrain || "?"} campaign=${campaign || "?"} dir=${direction || "—"} backend=${BACKEND} model=${ANTHROPIC_MODEL} ctxNodes=${(contextNodes || []).length}${hint ? " hint=" + JSON.stringify(hint) : ""}`);
  let content;
  try {
    if (BACKEND === "claude-code") {
      content = await runClaudeCli(system, userPrompt, { tag: "generate" });
    } else {
      content = await runAnthropicApi(system, userPrompt);
    }
    log(`[generate-hex] model returned ${content.length}b`);
  } catch (e) {
    log(`[generate-hex] ${BACKEND} FAILED: ${e.message}`);
    const status = e.status || 502;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message, status }));
    return;
  }
  // Extract JSON — be lenient if the model wraps it.
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch (e) { /* fall through */ }
    }
  }
  if (!parsed) {
    log(`[generate-hex] PARSE FAILED — raw content was: ${content.slice(0, 300)}`);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "model did not return valid JSON", raw: content }));
    return;
  }
  // Default the terrain back if the model omitted it.
  if (!parsed.terrain && terrain) parsed.terrain = terrain;
  log(`[generate-hex] parsed: name=${JSON.stringify(parsed.name)} point_type=${parsed.point_type} terrain=${parsed.terrain}`);

  // Persist to maps/<campaign>/<campaign>.json so the change survives
  // reloads and is captured for git. The browser's in-memory state still
  // updates immediately for instant feedback.
  let saved = false;
  let savedNode = null;
  if (campaign && /^[A-Za-z0-9_-]+$/.test(campaign)) {
    try {
      savedNode = await appendNodeToCampaign(campaign, hex, parsed);
      saved = true;
      log(`[generate-hex] saved to maps/${campaign}/${campaign}.json — subhex=${savedNode.subhex} pos=(${savedNode.x_hint}, ${savedNode.y_hint})`);
    } catch (e) {
      log(`[generate-hex] file save FAILED: ${e.message}`);
    }
  } else {
    log(`[generate-hex] skipping file save — campaign name invalid: ${JSON.stringify(campaign)}`);
  }

  // Push to Supabase via the open-world MCP. Best-effort: failures here do
  // not abort the request — the JSON is already written to disk.
  let mcpCaptured = false;
  let mcpMessage = null;
  if (saved) {
    try {
      log(`[generate-hex] capturing to MCP via claude -p…`);
      mcpMessage = await captureToMcp({ campaign, hex, parsed });
      mcpCaptured = true;
      log(`[generate-hex] MCP capture OK: ${mcpMessage.slice(0, 200)}`);
    } catch (e) {
      log(`[generate-hex] MCP capture FAILED: ${e.message}`);
      mcpMessage = e.message;
    }
  }

  log(`[generate-hex] DONE in ${Date.now() - reqStart}ms — saved=${saved} mcpCaptured=${mcpCaptured}`);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    ...parsed,
    saved,
    subhex: savedNode ? savedNode.subhex : null,
    x_hint: savedNode ? savedNode.x_hint : null,
    y_hint: savedNode ? savedNode.y_hint : null,
    mcpCaptured,
    mcpMessage,
  }));
}

// --- Sub-hex addressing ---------------------------------------------------
// Every generated point gets a random sub-hex designation (one of 7: C plus
// the 6 flat-top hex directions). The id encodes it so a hex can hold up to
// 7 POIs at distinct sub-positions; repeated explorations that roll the same
// sub-hex replace in place. Sub-hex also drives x_hint/y_hint so the point
// renders offset toward that side of the hex rather than dead-centre.
const SUBHEX_CODES = ["C", "N", "NE", "SE", "S", "SW", "NW"];
const SUBHEX_OFFSET_INCHES = {
  C:  [0,      0],
  N:  [0,     -0.20],
  NE: [ 0.18, -0.10],
  SE: [ 0.18,  0.10],
  S:  [0,      0.20],
  SW: [-0.18,  0.10],
  NW: [-0.18, -0.10],
};
const BC_COL = 10, BC_ROW = 10;
function hexCenterInches(hex) {
  const size = 0.5;
  const colStep = size * 1.5;
  const rowStep = size * Math.sqrt(3);
  const col = parseInt(hex.substring(0, 2), 10);
  const row = parseInt(hex.substring(2, 4), 10);
  const shifted = (col % 2) !== (BC_COL % 2);
  const x = (col - BC_COL) * colStep;
  const y = (row - BC_ROW) * rowStep + (shifted ? rowStep / 2 : 0);
  return [x, y];
}
function pickSubhex() {
  return SUBHEX_CODES[Math.floor(Math.random() * SUBHEX_CODES.length)];
}

// Append (or replace) the generated node in the campaign JSON file. The id
// includes the random sub-hex code so each hex can accumulate multiple
// distinct POIs at different sub-positions; rolling the same code again
// replaces in place.
async function appendNodeToCampaign(campaign, hex, parsed) {
  const file = join(REPO, "maps", campaign, `${campaign}.json`);
  if (!existsSync(file)) throw new Error(`campaign file not found: ${file}`);
  return withFileLock(file, async () => {
    const txt = await readFile(file, "utf8");
    const data = JSON.parse(txt);
    data.nodes = data.nodes || [];
    const subhex = pickSubhex();
    const [hx, hy] = hexCenterInches(hex);
    const [ox, oy] = SUBHEX_OFFSET_INCHES[subhex];
    const id = `hex-${hex}-${subhex}`;
    const node = {
      id,
      name: parsed.name,
      point_type: parsed.point_type || "wilderness",
      terrain: parsed.terrain || "plains",
      description: parsed.description || "",
      hex,
      subhex,
      x_hint: +(hx + ox).toFixed(3),
      y_hint: +(hy + oy).toFixed(3),
      visible: true,
    };
    const idx = data.nodes.findIndex(n => n.id === id);
    if (idx >= 0) data.nodes[idx] = node;
    else data.nodes.push(node);
    data.hex_terrain = data.hex_terrain || {};
    if (parsed.terrain && parsed.terrain !== "uncharted") {
      data.hex_terrain[hex] = parsed.terrain;
    }
    await safeWriteJsonAtomic(file, data);
    return node;
  });
}

// Atomic JSON write that ALSO validates the temp file parses before renaming.
// If something corrupts the serialised output (extension, write race, etc.),
// the existing good file stays intact instead of being replaced by garbage.
let _tmpCounter = 0;
async function safeWriteJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.${++_tmpCounter}.tmp`;
  const json = JSON.stringify(data, null, 2) + "\n";
  await writeFile(tmp, json, "utf8");
  try { JSON.parse(await readFile(tmp, "utf8")); }
  catch (e) {
    throw new Error("post-write JSON validation failed: " + e.message);
  }
  await rename(tmp, file);
}

// Per-file mutex: serialises read-modify-write so concurrent handlers can't
// clobber each other's edits to the same campaign JSON. Without this, two
// updates can both read the old file, mutate independent copies, and the
// second writer silently overwrites the first writer's changes.
const _fileLocks = new Map();
function withFileLock(file, fn) {
  const prev = _fileLocks.get(file) || Promise.resolve();
  const next = prev.then(fn, fn);
  _fileLocks.set(file, next.catch(() => {}));
  return next;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      buf += chunk;
      if (buf.length > 1_000_000) reject(new Error("payload too large"));
    });
    req.on("end", () => {
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

// --- Router ---------------------------------------------------------------
const server = createServer(async (req, res) => {
  const url = req.url || "/";
  if (url.startsWith("/api/")) console.log(`[${req.method}] ${url}`);
  if (url.startsWith("/api/health")) return apiHealth(req, res);
  if (url.startsWith("/api/generate-hex") && req.method === "POST") return apiGenerateHex(req, res);
  if (url.startsWith("/api/generate-encounter") && req.method === "POST") return apiGenerateEncounter(req, res);
  if (url.startsWith("/api/update-node") && req.method === "POST") return apiUpdateNode(req, res);
  if (url.startsWith("/api/clear-encounter") && req.method === "POST") return apiClearEncounter(req, res);
  if (url.startsWith("/api/toggle-unexplored") && req.method === "POST") return apiToggleUnexplored(req, res);
  if (url.startsWith("/api/generate-rumor") && req.method === "POST") return apiGenerateRumor(req, res);
  if (url.startsWith("/api/update-rumor-status") && req.method === "POST") return apiUpdateRumorStatus(req, res);
  return serveStatic(req, res);
});

// --- /api/generate-rumor: OSR rumor, auto-pushed to MCP -----------------
// Body: { hex, terrain, campaign, contextNodes?, nearbyRumors?, encounter? }
// On success: writes to hex_rumors[hex] in Basilisk.json AND captures to
// open-world MCP as a rumor thought. The "Ask for Rumor" button is the
// only entry point — there's no separate save step.
async function apiGenerateRumor(req, res) {
  if (!aiEnabled) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "AI backend not configured" }));
    return;
  }
  let body;
  try { body = await readJsonBody(req); }
  catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid JSON body: " + e.message }));
    return;
  }
  const { hex, terrain, campaign, contextNodes, nearbyRumors, encounter } = body || {};
  const reqStart = Date.now();
  log(`[rumor] START hex=${hex} terrain=${terrain || "?"} campaign=${campaign || "?"} encounter=${encounter ? "yes" : "no"} priorRumors=${(nearbyRumors || []).length} backend=${BACKEND}`);

  const system = [
    "You are a TTRPG rumor generator in the OSR tradition.",
    "Produce ONE rumor that the party might overhear in a tavern, hear from a road-mate, or pry from a local. Rumors are second-hand reports — they may be true, partly true, or false, and they hint at adventure rather than spelling it out.",
    "Tone matches the campaign — mythic, frontier, a little dangerous.",
    "If an encounter is provided, the rumor should be ABOUT that encounter (someone heard about it, witnessed it, or speculates) — not a verbatim retelling.",
    "If existing rumors are provided, do not repeat them. Build on the local lore: contradict, extend, or echo with a twist.",
    "Pick a colourful source (e.g. a drunk, a coachman, a goatherd, a temple novice, a dwarven dig-foreman, a child) — a specific person, not 'a traveller'.",
    "Mark reliability as one of: \"true\", \"partial\", or \"false\".",
    "Pick a short topic (e.g. \"the basilisk\", \"the cursed well\") — what the rumor is about.",
    "Respond ONLY as a JSON object with exactly these fields: {\"rumor\": string, \"source\": string, \"reliability\": string, \"topic\": string}.",
    "No preamble, no code fences — just the JSON.",
  ].join(" ");

  const ctxBlock = (contextNodes || [])
    .slice(0, 8)
    .map(n => `- ${n.name} (${n.point_type}, hex ${n.hex || "?"})`)
    .join("\n");
  const rumorsBlock = (nearbyRumors || [])
    .slice(0, 6)
    .map(r => `- (hex ${r.hex || "?"}, ${r.reliability || "?"}, source: ${r.source || "?"}) ${r.rumor || ""}`)
    .join("\n");
  const encBlock = encounter
    ? [`Encounter at this hex (rumor should reference this):`,
       `  Creature: ${encounter.creature || "?"} (${encounter.number || "?"})`,
       `  Reaction: ${encounter.reaction || "?"}`,
       `  Description: ${encounter.description || ""}`].join("\n")
    : "";

  const userPrompt = [
    `Campaign: ${campaign || "(unspecified)"}`,
    `Hex: ${hex || "?"}`,
    `Terrain: ${terrain || "wilderness"}`,
    "",
    encBlock,
    "",
    ctxBlock ? "Nearby places:" : "",
    ctxBlock,
    "",
    rumorsBlock ? "Existing rumors (do not repeat):" : "",
    rumorsBlock,
    "",
    "Generate one rumor for this hex.",
  ].filter(Boolean).join("\n");

  let content;
  try {
    if (BACKEND === "claude-code") {
      content = await runClaudeCli(system, userPrompt, { tag: "rumor" });
    } else {
      content = await runAnthropicApi(system, userPrompt);
    }
    log(`[rumor] model returned ${content.length}b`);
  } catch (e) {
    log(`[rumor] FAILED: ${e.message}`);
    const status = e.status || 502;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message, status }));
    return;
  }
  let parsed;
  try { parsed = JSON.parse(content); }
  catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { /* fall */ } }
  }
  if (!parsed) {
    log(`[rumor] PARSE FAILED — raw: ${content.slice(0, 300)}`);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "model did not return valid JSON", raw: content }));
    return;
  }

  // Persist locally — append to hex_rumors[hex] so it survives reload and
  // gets picked up as context in future generations of this and adjacent hexes.
  let saved = false;
  let savedRumor = null;
  if (campaign && /^[A-Za-z0-9_-]+$/.test(campaign)) {
    try {
      savedRumor = await appendRumorToCampaign(campaign, hex, parsed);
      saved = true;
      log(`[rumor] saved to maps/${campaign}/${campaign}.json (hex=${hex})`);
    } catch (e) {
      log(`[rumor] file save FAILED: ${e.message}`);
    }
  } else {
    log(`[rumor] skipping file save — campaign name invalid: ${JSON.stringify(campaign)}`);
  }

  // Auto-push to open-world MCP as a rumor thought. Failures here don't
  // abort the request — the JSON has the rumor either way.
  let mcpCaptured = false;
  let mcpMessage = null;
  if (saved) {
    try {
      log(`[rumor] capturing to MCP via claude -p…`);
      mcpMessage = await captureRumorToMcp({ campaign, hex, parsed });
      mcpCaptured = true;
      log(`[rumor] MCP capture OK: ${mcpMessage.slice(0, 200)}`);
    } catch (e) {
      log(`[rumor] MCP capture FAILED: ${e.message}`);
      mcpMessage = e.message;
    }
  }

  log(`[rumor] DONE in ${Date.now() - reqStart}ms — saved=${saved} mcpCaptured=${mcpCaptured}`);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ...parsed, saved, mcpCaptured, mcpMessage, savedRumor }));
}

async function appendRumorToCampaign(campaign, hex, parsed) {
  const file = join(REPO, "maps", campaign, `${campaign}.json`);
  if (!existsSync(file)) throw new Error(`campaign file not found: ${file}`);
  return withFileLock(file, async () => {
    const txt = await readFile(file, "utf8");
    const data = JSON.parse(txt);
    data.hex_rumors = data.hex_rumors || {};
    data.hex_rumors[hex] = data.hex_rumors[hex] || [];
    const entry = {
      rumor:       parsed.rumor || "",
      source:      parsed.source || "",
      reliability: parsed.reliability || "",
      topic:       parsed.topic || "",
      status:      "new",
      captured_at: new Date().toISOString(),
    };
    data.hex_rumors[hex].push(entry);
    await safeWriteJsonAtomic(file, data);
    return entry;
  });
}

async function captureRumorToMcp({ campaign, hex, parsed }) {
  const system = "You are a database integration helper. When asked to save a thought, call the open-world MCP capture_thought tool with the supplied fields and report a one-line confirmation.";
  const userPrompt = [
    "Save the following rumor to the open-world database using the open-world MCP `capture_thought` tool.",
    "Set thought_type to \"rumor\". Use the rumor text as the content. Include metadata fields: hex, campaign, source, reliability, topic.",
    "",
    `Campaign: ${campaign}`,
    `Hex: ${hex}`,
    `Rumor: ${parsed.rumor}`,
    parsed.source ? `Source: ${parsed.source}` : "",
    parsed.reliability ? `Reliability: ${parsed.reliability}` : "",
    parsed.topic ? `Topic: ${parsed.topic}` : "",
    "",
    "After the tool call returns, reply with a one-line confirmation including the saved id (if any).",
  ].filter(Boolean).join("\n");
  return runClaudeCli(system, userPrompt, {
    allowedTools: ["mcp__open-world__capture_thought"],
    permissionMode: "acceptEdits",
    tag: "mcp-rumor",
  });
}

// --- /api/update-rumor-status: change status on a single rumor entry -----
// Body: { campaign, hex, capturedAt, status }
// Status is GM-tracking metadata (new / investigating / confirmed / debunked /
// resolved). The (hex, captured_at) pair uniquely identifies a rumor since
// captured_at is an ISO timestamp set at generation time. JSON-only — does
// not propagate to the open-world MCP, since status is not lore.
const RUMOR_STATUSES = ["new", "investigating", "confirmed", "debunked", "resolved"];
async function apiUpdateRumorStatus(req, res) {
  let body;
  try { body = await readJsonBody(req); }
  catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid JSON body: " + e.message }));
    return;
  }
  const { campaign, hex, capturedAt, status } = body || {};
  if (!campaign || !/^[A-Za-z0-9_-]+$/.test(campaign)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "valid `campaign` required" }));
    return;
  }
  if (!hex || typeof hex !== "string") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "`hex` required" }));
    return;
  }
  if (!capturedAt || typeof capturedAt !== "string") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "`capturedAt` required" }));
    return;
  }
  if (!RUMOR_STATUSES.includes(status)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `\`status\` must be one of ${RUMOR_STATUSES.join(", ")}` }));
    return;
  }
  const file = join(REPO, "maps", campaign, `${campaign}.json`);
  if (!existsSync(file)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `campaign file not found: ${campaign}` }));
    return;
  }
  const updated = await withFileLock(file, async () => {
    const data = JSON.parse(await readFile(file, "utf8"));
    const list = (data.hex_rumors && data.hex_rumors[hex]) || [];
    const entry = list.find(r => r && r.captured_at === capturedAt);
    if (!entry) return null;
    entry.status = status;
    await safeWriteJsonAtomic(file, data);
    return entry;
  });
  if (!updated) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `rumor not found for hex=${hex} capturedAt=${capturedAt}` }));
    return;
  }
  log(`[update-rumor-status] hex=${hex} capturedAt=${capturedAt} → ${status}`);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, rumor: updated }));
}

// --- /api/clear-encounter: remove the hex_encounters[hex] entry ----------
// --- /api/toggle-unexplored: add or remove a hex from hex_unexplored ---
// Body: { campaign, hex, unexplored: true|false }
async function apiToggleUnexplored(req, res) {
  let body;
  try { body = await readJsonBody(req); }
  catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid JSON body: " + e.message }));
    return;
  }
  const { campaign, hex, unexplored } = body || {};
  if (!campaign || !/^[A-Za-z0-9_-]+$/.test(campaign)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "valid `campaign` required" }));
    return;
  }
  if (!hex || typeof hex !== "string") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "`hex` required" }));
    return;
  }
  const file = join(REPO, "maps", campaign, `${campaign}.json`);
  if (!existsSync(file)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `campaign file not found: ${campaign}` }));
    return;
  }
  const data = JSON.parse(await readFile(file, "utf8"));
  data.hex_unexplored = data.hex_unexplored || [];
  const idx = data.hex_unexplored.indexOf(hex);
  if (unexplored && idx < 0) data.hex_unexplored.push(hex);
  if (!unexplored && idx >= 0) data.hex_unexplored.splice(idx, 1);
  await safeWriteJsonAtomic(file, data);
  log(`[toggle-unexplored] hex=${hex} unexplored=${unexplored ? "yes" : "no"}`);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, hex_unexplored: data.hex_unexplored }));
}

async function apiClearEncounter(req, res) {
  let body;
  try { body = await readJsonBody(req); }
  catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid JSON body: " + e.message }));
    return;
  }
  const { campaign, hex } = body || {};
  if (!campaign || !/^[A-Za-z0-9_-]+$/.test(campaign)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "valid `campaign` required" }));
    return;
  }
  if (!hex || typeof hex !== "string") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "`hex` required" }));
    return;
  }
  const file = join(REPO, "maps", campaign, `${campaign}.json`);
  if (!existsSync(file)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `campaign file not found: ${campaign}` }));
    return;
  }
  const removed = await withFileLock(file, async () => {
    const data = JSON.parse(await readFile(file, "utf8"));
    if (!(data.hex_encounters && data.hex_encounters[hex])) return false;
    delete data.hex_encounters[hex];
    await safeWriteJsonAtomic(file, data);
    return true;
  });
  if (removed) log(`[clear-encounter] removed hex_encounters[${hex}] from maps/${campaign}/${campaign}.json`);
  else log(`[clear-encounter] no entry for hex=${hex} — noop`);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, removed }));
}

// --- /api/update-node: in-place edit of an existing node in the campaign JSON
// Body: { campaign, id, fields: { name?, description?, point_type?, terrain? } }
async function apiUpdateNode(req, res) {
  let body;
  try { body = await readJsonBody(req); }
  catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid JSON body: " + e.message }));
    return;
  }
  const { campaign, id, fields } = body || {};
  if (!campaign || !/^[A-Za-z0-9_-]+$/.test(campaign)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "valid `campaign` required" }));
    return;
  }
  if (!id || typeof id !== "string") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "`id` required" }));
    return;
  }
  if (!fields || typeof fields !== "object") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "`fields` object required" }));
    return;
  }
  const file = join(REPO, "maps", campaign, `${campaign}.json`);
  if (!existsSync(file)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `campaign file not found: ${campaign}` }));
    return;
  }
  const result = await withFileLock(file, async () => {
    const data = JSON.parse(await readFile(file, "utf8"));
    const idx = (data.nodes || []).findIndex(n => n.id === id);
    if (idx < 0) return { notFound: true };
    const allowed = ["name", "description", "point_type", "terrain", "x_hint", "y_hint"];
    const applied = {};
    for (const k of allowed) {
      if (fields[k] !== undefined) {
        data.nodes[idx][k] = fields[k];
        applied[k] = fields[k];
      }
    }
    await safeWriteJsonAtomic(file, data);
    return { applied, node: data.nodes[idx] };
  });
  if (result.notFound) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `node not found: ${id}` }));
    return;
  }
  log(`[update-node] ${id} → ${JSON.stringify(result.applied)}`);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, node: result.node }));
}

// --- /api/generate-encounter: OSR wandering encounter -------------------
async function apiGenerateEncounter(req, res) {
  if (!aiEnabled) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "AI backend not configured" }));
    return;
  }
  let body;
  try { body = await readJsonBody(req); }
  catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid JSON body: " + e.message }));
    return;
  }
  const { hex, terrain, campaign, contextNodes, nearbyRumors } = body || {};
  const reqStart = Date.now();
  log(`[encounter] START hex=${hex} terrain=${terrain || "?"} campaign=${campaign || "?"} priorRumors=${(nearbyRumors || []).length} backend=${BACKEND}`);

  const system = [
    "You are an OSR (Old-School Renaissance) wandering-encounter generator.",
    "Roll ONE random encounter appropriate for the given terrain following OSR conventions:",
    "  - Single encounter per roll. Terrain-appropriate creatures, NPCs, factions, weather, hazards, or strange events. Many encounters are not combat — they can be talkable, sneakable-past, or environmental.",
    "  - Roll a number appearing as a dice expression resolved to a concrete count (e.g. \"2d6 → 7 goblins\" or \"1 lone hermit\").",
    "  - Roll encounter distance for the terrain (open: 4d6×10 yards; forest/swamp: 2d6×10 yards; close terrain: 2d6 yards).",
    "  - Roll a 2d6 reaction → one of: hostile, unfriendly, neutral, indifferent, friendly. Pick a result that's interesting, not always neutral.",
    "  - State activity: what they are doing right now when the party sees them.",
    "  - One-sentence vivid description that grounds the encounter in the moment.",
    "Respond ONLY as a JSON object with exactly these fields: {\"creature\": string, \"number\": string, \"distance\": string, \"activity\": string, \"reaction\": string, \"description\": string}.",
    "No preamble, no code fences — just the JSON.",
  ].join(" ");

  const ctxBlock = (contextNodes || [])
    .slice(0, 6)
    .map(n => `- ${n.name} (${n.point_type})`)
    .join("\n");
  const rumorsBlock = (nearbyRumors || [])
    .slice(0, 6)
    .map(r => `- (hex ${r.hex || "?"}, ${r.reliability || "?"}) ${r.rumor || ""}`)
    .join("\n");

  const userPrompt = [
    `Campaign: ${campaign || "(unspecified)"}`,
    `Hex: ${hex || "?"}`,
    `Terrain: ${terrain || "wilderness"}`,
    "",
    ctxBlock ? "Nearby places (tonal context, not necessarily involved):" : "",
    ctxBlock,
    "",
    rumorsBlock ? "Local rumors (the encounter may quietly pay them off — don't repeat verbatim):" : "",
    rumorsBlock,
    "",
    "Roll one wandering encounter for this terrain.",
  ].filter(Boolean).join("\n");

  let content;
  try {
    if (BACKEND === "claude-code") {
      content = await runClaudeCli(system, userPrompt, { tag: "encounter" });
    } else {
      content = await runAnthropicApi(system, userPrompt);
    }
    log(`[encounter] model returned ${content.length}b`);
  } catch (e) {
    log(`[encounter] FAILED: ${e.message}`);
    const status = e.status || 502;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message, status }));
    return;
  }
  let parsed;
  try { parsed = JSON.parse(content); }
  catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { /* fall */ } }
  }
  if (!parsed) {
    log(`[encounter] PARSE FAILED — raw: ${content.slice(0, 300)}`);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "model did not return valid JSON", raw: content }));
    return;
  }
  // Persist the encounter into the campaign JSON under hex_encounters[hex]
  // so it survives reload. Re-rolling the same hex replaces in place AND
  // picks a fresh random sub-hex so the marker isn't pinned to one corner.
  let saved = false;
  let savedSubhex = null;
  if (campaign && /^[A-Za-z0-9_-]+$/.test(campaign)) {
    try {
      savedSubhex = await saveEncounterToCampaign(campaign, hex, parsed);
      saved = true;
      log(`[encounter] saved to maps/${campaign}/${campaign}.json (hex=${hex} subhex=${savedSubhex})`);
    } catch (e) {
      log(`[encounter] file save FAILED: ${e.message}`);
    }
  } else {
    log(`[encounter] skipping file save — campaign name invalid: ${JSON.stringify(campaign)}`);
  }

  log(`[encounter] DONE in ${Date.now() - reqStart}ms — creature=${JSON.stringify(parsed.creature)} reaction=${parsed.reaction} saved=${saved}`);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ...parsed, saved, subhex: savedSubhex }));
}

async function saveEncounterToCampaign(campaign, hex, parsed) {
  const file = join(REPO, "maps", campaign, `${campaign}.json`);
  if (!existsSync(file)) throw new Error(`campaign file not found: ${file}`);
  return withFileLock(file, async () => {
    const txt = await readFile(file, "utf8");
    const data = JSON.parse(txt);
    data.hex_encounters = data.hex_encounters || {};
    const subhex = pickSubhex();
    data.hex_encounters[hex] = {
      creature:    parsed.creature || "",
      number:      parsed.number || "",
      distance:    parsed.distance || "",
      activity:    parsed.activity || "",
      reaction:    parsed.reaction || "",
      description: parsed.description || "",
      subhex,
    };
    await safeWriteJsonAtomic(file, data);
    return subhex;
  });
}

server.listen(PORT, () => {
  console.log(`Open World dev server: http://localhost:${PORT}/`);
  if (aiEnabled) {
    console.log(`  AI hex generation: enabled (backend=${BACKEND}, model=${ANTHROPIC_MODEL})`);
    if (BACKEND === "claude-code") console.log(`  Using Claude CLI: ${CLAUDE_CLI}`);
  } else {
    console.log(`  AI hex generation: disabled (no claude CLI, no ANTHROPIC_API_KEY)`);
  }
});
