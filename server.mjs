import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = fileURLToPath(new URL(".", import.meta.url));
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const maxMessageLength = 2_500;
const maxRunMs = 120_000;
let activeRun = false;

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", chunk => {
      data += chunk;
      if (data.length > 32_000) reject(new Error("Beskeden er for stor."));
    });
    request.on("end", () => resolve(data));
    request.on("error", reject);
  });
}

function managerPrompt(message) {
  return `Du er Manageren i Mads' AI-kontor. Dit svar bliver vist direkte til Mads i kontoret.

Mads skrev: "${message}"

Svar på dansk og højst 120 ord. Gør tre ting: 1) gentag kort målet, 2) foreslå hvilke roller der bør arbejde på det først, 3) stil højst ét spørgsmål, men kun hvis et valg reelt blokerer arbejdet. Ellers beskriv den næste konkrete handling.

Vigtige regler: Du må ikke påstå, at du allerede har startet medarbejdere, læst eksterne konti, ændret filer, lavet et deploy eller set et billede, som ikke blev givet til dig. Du er kun i læse- og rådgivningstilstand. Skriv ikke om interne kæde-of-thought eller værktøjskald.`;
}

function runManager(message) {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", [
      "exec",
      "--json",
      "--sandbox", "read-only",
      "--ephemeral",
      "--cd", root,
      managerPrompt(message)
    ], { cwd: root, env: { ...process.env, NO_COLOR: "1" } });

    let output = "";
    let stderr = "";
    let agentMessage = "";
    let usage = null;
    let settled = false;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(result);
    };

    const consumeLines = () => {
      const lines = output.split("\n");
      output = lines.pop() || "";
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (event.type === "item.completed" && event.item?.type === "agent_message") agentMessage += event.item.text || "";
          if (event.type === "turn.completed") usage = event.usage || null;
        } catch {
          // Codex can emit non-JSON warnings before JSONL events. They are not user-facing messages.
        }
      }
    };

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error("Manageren brugte for lang tid. Prøv igen om lidt."));
    }, maxRunMs);

    child.stdout.on("data", chunk => { output += chunk.toString(); consumeLines(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", error => finish(error));
    // Codex treats an open stdin stream as additional prompt input. This worker passes
    // the prompt as an argument, so close stdin immediately to let the turn finish.
    child.stdin.end();
    child.on("close", code => {
      consumeLines();
      if (code !== 0) return finish(new Error("Manageren kunne ikke starte. Tjek Codex-login og prøv igen."));
      if (!agentMessage.trim()) return finish(new Error("Manageren kom ikke tilbage med et svar. Prøv igen."));
      finish(null, { message: agentMessage.trim(), usage });
    });
  });
}

async function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const safePath = normalize(requested).replace(/^\.\.([/\\]|$)+/, "");
  const filePath = join(root, safePath);
  if (!filePath.startsWith(root)) return json(response, 403, { error: "Ikke tilladt." });
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { "Content-Type": types[extname(filePath)] || "application/octet-stream" });
    response.end(content);
  } catch {
    json(response, 404, { error: "Filen findes ikke." });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${host}:${port}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    return json(response, 200, { ok: true, busy: activeRun, worker: "Codex · read-only" });
  }

  if (request.method === "POST" && url.pathname === "/api/manager") {
    if (activeRun) return json(response, 429, { error: "Manageren arbejder allerede. Vent på det nuværende svar." });
    try {
      const body = JSON.parse(await readBody(request));
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) return json(response, 400, { error: "Skriv først en besked til manageren." });
      if (message.length > maxMessageLength) return json(response, 400, { error: "Hold beskeden under 2.500 tegn." });
      activeRun = true;
      const result = await runManager(message);
      return json(response, 200, { ok: true, ...result });
    } catch (error) {
      return json(response, 500, { error: error.message || "Noget gik galt hos manageren." });
    } finally {
      activeRun = false;
    }
  }

  if (request.method === "GET") return serveStatic(url.pathname, response);
  return json(response, 405, { error: "Metoden er ikke tilladt." });
});

server.listen(port, host, () => console.log(`AI-kontoret kører på http://${host}:${port}`));
