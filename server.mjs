import { createServer } from "node:http";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { addActivity, addConversation, createOfficeStore, projectSummary } from "./store.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));

const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const statePath = process.env.OFFICE_STATE_PATH || join(root, "data", "office-state.json");
const store = createOfficeStore(statePath);
// Billeder ligger ved siden af tilstandsfilen, så tests og andre tilstande aldrig skriver i Mads' rigtige data.
const uploadsDirectory = join(dirname(statePath), "uploads");
const maxMessageLength = 2_500;
const maxRunMs = 120_000;
const maxAttachmentBytes = 2 * 1024 * 1024;
const codexBinary = process.env.CODEX_BIN || "codex";
const eventClients = new Set();
let activeRun = false;
let codexAvailable = null;
const assignableRoles = new Set(["designer", "researcher", "developer", "reviewer", "game_designer", "graphic_designer", "copywriter", "marketer", "trend_scout"]);
const projectStates = ["Udforsker", "Bygger", "Pause", "Afsluttet"];
const imageExtensions = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

// Kun browserens egne filer serveres. Kildekode, .git, data og docs bliver aldrig udleveret over HTTP.
const staticFiles = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/enhancements.css": ["enhancements.css", "text/css; charset=utf-8"]
};
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function notFound(response) { return json(response, 404, { error: "Vi kunne ikke finde det, du bad om." }); }

function readBody(request, maxBytes = 32_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    request.on("data", chunk => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        return reject(new Error("Beskeden er for stor."));
      }
      chunks.push(chunk);
    });
    request.on("end", () => { if (!tooLarge) resolve(Buffer.concat(chunks).toString("utf8")); });
    request.on("error", reject);
  });
}

// Serveren lytter kun på 127.0.0.1, men en hvilken som helst hjemmeside i Mads' browser kan stadig sende
// forespørgsler dertil. Host-tjekket stopper DNS-rebinding; Origin- og JSON-kravet stopper skjulte
// cross-site POSTs, som ellers kunne oprette data eller bruge Codex-kvote i baggrunden.
function rejectForeignRequest(request) {
  if (!allowedHosts.has(request.headers.host || "")) return "Ukendt værtsnavn. Åbn kontoret på http://127.0.0.1.";
  if (request.method === "GET" || request.method === "HEAD") return null;
  const origin = request.headers.origin;
  if (origin && !allowedHosts.has(origin.replace(/^http:\/\//, ""))) return "Forespørgslen kom ikke fra kontoret selv.";
  // Kun POST kan sendes som "simpel" cross-site-forespørgsel uden preflight. PATCH og DELETE kræver altid preflight, som serveren ikke besvarer.
  if (request.method === "POST" && !/^application\/json\b/i.test(request.headers["content-type"] || "")) return "Kontoret tager kun imod JSON fra sin egen side.";
  return null;
}

function checkCodex() {
  if (codexAvailable !== null) return Promise.resolve(codexAvailable);
  return new Promise(resolve => {
    const done = value => { codexAvailable = value; resolve(value); };
    try {
      const child = spawn(codexBinary, ["--version"], { stdio: "ignore" });
      const timer = setTimeout(() => { child.kill("SIGTERM"); done(false); }, 5_000);
      child.on("error", () => { clearTimeout(timer); done(false); });
      child.on("close", code => { clearTimeout(timer); done(code === 0); });
    } catch { done(false); }
  });
}

function parseBody(raw) {
  try { return JSON.parse(raw); }
  catch { throw new Error("Beskeden kunne ikke læses."); }
}

function makeId(prefix) { return `${prefix}-${randomUUID().slice(0, 8)}`; }
function roleName(role) { return ({ manager: "Manageren", designer: "Designeren", researcher: "Researcheren", developer: "Udvikleren", reviewer: "Revieweren", game_designer: "Spildesigneren", graphic_designer: "Grafikeren", copywriter: "Tekstforfatteren", marketer: "Marketingpersonen", trend_scout: "Trendspejderen" })[role] || role; }

function decodeImageData(dataUrl) {
  if (typeof dataUrl !== "string") throw new Error("Vælg et billede først.");
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match || !imageExtensions[match[1]]) throw new Error("Vælg et PNG-, JPEG-, WebP- eller GIF-billede.");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > maxAttachmentBytes) throw new Error("Billedet skal være under 2 MB.");
  return { buffer, mimeType: match[1], extension: imageExtensions[match[1]] };
}

function decisionView(decision) {
  const level = decision.level === "executive" ? "executive" : "team";
  const urgency = ["now", "today", "when_ready"].includes(decision.urgency) ? decision.urgency : "when_ready";
  return {
    ...decision,
    level,
    urgency,
    recommendation: decision.recommendation || "Manageren anbefaler den beskrevne retning.",
    tradeoff: decision.tradeoff || "Ingen yderligere trade-off er dokumenteret endnu."
  };
}

const openTaskStates = new Set(["planned", "ready", "active"]);

// Skrivebordenes status udledes af de rigtige opgaver, så et gammelt statusfelt aldrig lever videre alene.
function agentWorkload(state, agentId) {
  const open = state.tasks.filter(task => task.role === agentId && openTaskStates.has(task.state));
  const pick = stateName => open.find(task => task.state === stateName);
  const next = pick("active") || pick("ready") || pick("planned") || null;
  return {
    active: open.filter(task => task.state === "active").length,
    ready: open.filter(task => task.state === "ready").length,
    planned: open.filter(task => task.state === "planned").length,
    next: next ? { id: next.id, title: next.title, state: next.state, projectId: next.projectId } : null
  };
}

function officeView(state) {
  const agents = Object.fromEntries(Object.entries(state.agents).map(([agentId, agent]) => [agentId, { ...agent, workload: agentWorkload(state, agentId) }]));
  return {
    ...state,
    agents,
    managerAvailable: codexAvailable === true,
    projects: state.projects.map(project => projectSummary(state, project)),
    decisions: state.decisions.filter(decision => decision.status === "open").map(decisionView)
  };
}

async function publish(state) {
  const payload = `event: office-state\ndata: ${JSON.stringify(officeView(state))}\n\n`;
  for (const client of eventClients) client.write(payload);
}

async function mutate(mutator) {
  const outcome = await store.mutate(mutator);
  await publish(outcome.state);
  return outcome;
}

export function managerPrompt(message, project, projectTasks, projectReferences, conversationHistory, preferences, previousDecision, radarItems = []) {
  const projectContext = project ? `Aktivt projekt: ${project.name}. ${project.description}` : "Intet projekt er valgt endnu; afgør om beskeden peger på et nyt projekt eller næste spor.";
  const taskLine = task => {
    const by = task.state === "active" ? ` · udføres af ${task.executor || "Mads"}` : "";
    const artifact = task.state === "done" && task.artifactId ? projectReferences.find(item => item.id === task.artifactId) : null;
    return `- [${task.state}] ${roleName(task.role)}: ${task.title}${by}${task.acceptance ? ` (accept: ${task.acceptance})` : ""}${artifact ? ` → afleveret: ${artifact.title}` : ""}`;
  };
  const taskContext = projectTasks.length
    ? `Arbejdskø (planned/ready er ikke startet; active udføres af den nævnte person eller agent uden for kontoret; done er afleveret med et artefakt):\n${projectTasks.map(taskLine).join("\n")}`
    : "Arbejdskø: ingen konkrete opgaver endnu.";
  const referenceContext = projectReferences.length
    ? `Fælles bibliotek (Mads har gemt disse noter eller links; links er ikke hentet eller læst, og gemte billeder er ikke set):\n${projectReferences.map(item => `- [${item.type}] ${item.title}: ${item.type === "attachment" ? "Et lokalt billede er gemt, men er ikke læst af manageren." : item.content}`).join("\n")}`
    : "Fælles bibliotek: intet projektmateriale er gemt endnu.";
  const conversationContext = conversationHistory.length
    ? `Seneste læsbare projekthistorik (ikke skjult ræsonnement):\n${[...conversationHistory].reverse().map(item => `- ${item.role === "mads" ? "Mads" : "Manageren"}: ${item.text}`).join("\n")}`
    : "Projekthistorik: ingen tidligere beskeder.";
  const radarContext = radarItems.length
    ? `\nRadar (nyt om AI og vibecoding, registreret af Mads eller holdet; kilderne er ikke læst af dig):\n${radarItems.map(item => `- [${item.status}] ${item.title}: ${item.content}`).join("\n")}\nBrug kun et radar-punkt, hvis det konkret forbedrer dette spor, og sig hvorfor.`
    : "";
  const profile = preferences.map(preference => `- ${preference.value}`).join("\n");
  const decisionContext = previousDecision ? `\nMads svarer på dit tidligere spørgsmål: "${previousDecision.title}". Det tidligere oplæg var: "${previousDecision.text}". Brug hans nye besked som svaret og lav et opdateret spor.` : "";
  return `Du er Manageren i Mads' AI-kontor. Du skal hjælpe Mads med at omsætte en idé til et lille, sikkert arbejdsspor.

Mads skrev: "${message}"
${projectContext}
${taskContext}
${referenceContext}
${conversationContext}${radarContext}

Kendte præferencer (bløde signaler, ikke forbud):
${profile}
${decisionContext}

Tilgængelige specialistroller i talentbanken: Spildesigneren (core loop, progression, systembrief), Grafikeren (art direction, asset-briefs, visuelle referencer), Tekstforfatteren (UX-tekst, tone-of-voice, tekstvarianter) Marketingpersonen (målgruppe, positionering, launch-hypoteser) og Trendspejderen (nye AI-modeller, værktøjer, prompt-mønstre og vibecoding-workflows omsat til konkrete forsøg). Brug kun en specialist, når rollen ændrer den konkrete aflevering. En rolle i talentbanken er ikke en tilsluttet model eller en ny adgang.

Returnér KUN et JSON-objekt, der overholder det givne schema. Vælg højst tre roller. Stil kun et spørgsmål, hvis noget vigtigt reelt blokerer næste trin; ellers er question null.

Beslutningsniveau: Vælg "executive" kun for retning, smag med stor effekt, væsentligt omfang, prioritering mellem projekter, offentlighed, økonomi eller noget svært at rulle tilbage. Vælg "team" for et reversibelt, afgrænset valg. recommendation skal være dit klare råd; tradeoff skal forklare hvad Mads giver op eller vinder; urgency er "now", "today" eller "when_ready".

Vigtige regler: Du må ikke påstå, at medarbejdere allerede er startet, at du har set en vedhæftning, læst en ekstern konto, ændret filer eller lavet deploy. Du er kun i læse- og rådgivningstilstand. Lav ikke skjult ræsonnement eller værktøjslog i svaret.`;
}

// Et svar uden for schemaet bliver afvist i stedet for at blive gættet om til en plan.
// Kontoret må hellere sige "prøv igen" end vise roller og beslutninger, manageren aldrig foreslog.
export function parsePlan(message) {
  let parsed;
  try { parsed = JSON.parse(message); } catch { parsed = null; }
  const text = value => (typeof value === "string" ? value.trim() : "");
  const roles = Array.isArray(parsed?.roles) ? [...new Set(parsed.roles.filter(role => assignableRoles.has(role)))].slice(0, 3) : [];
  const decision = parsed?.decision || {};
  if (!text(parsed?.summary) || !text(parsed?.nextAction) || !roles.length || !text(decision.title) || !text(decision.recommendation)) {
    throw new Error("Manageren svarede ikke i det aftalte format. Intet er gemt — prøv igen.");
  }
  return {
    summary: text(parsed.summary),
    roles,
    nextAction: text(parsed.nextAction),
    question: text(parsed.question) || null,
    decision: {
      level: decision.level === "executive" ? "executive" : "team",
      title: text(decision.title),
      recommendation: text(decision.recommendation),
      tradeoff: text(decision.tradeoff) || "Ingen afvejning er dokumenteret.",
      urgency: ["now", "today", "when_ready"].includes(decision.urgency) ? decision.urgency : "when_ready"
    }
  };
}

function runManager(message, project, projectTasks, projectReferences, conversationHistory, preferences, previousDecision, radarItems) {
  return new Promise((resolve, reject) => {
    const child = spawn(codexBinary, [
      "exec", "--json", "--sandbox", "read-only", "--ephemeral", "--cd", root,
      "--output-schema", join(root, "schemas", "manager-plan.schema.json"),
      managerPrompt(message, project, projectTasks, projectReferences, conversationHistory, preferences, previousDecision, radarItems)
    ], { cwd: root, env: { ...process.env, NO_COLOR: "1" } });

    let output = "";
    let agentMessage = "";
    let usage = null;
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error); else resolve(result);
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
          // Non-JSON Codex warnings are intentionally not exposed as office activity.
        }
      }
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error("Manageren brugte for lang tid. Prøv igen om lidt."));
    }, maxRunMs);

    child.stdout.on("data", chunk => { output += chunk.toString(); consumeLines(); });
    child.on("error", error => finish(error));
    child.stdin.end();
    child.on("close", code => {
      consumeLines();
      if (code !== 0) return finish(new Error("Manageren kunne ikke starte. Tjek Codex-login og prøv igen."));
      if (!agentMessage.trim()) return finish(new Error("Manageren kom ikke tilbage med et svar. Prøv igen."));
      try { finish(null, { plan: parsePlan(agentMessage), usage }); }
      catch (error) { finish(error); }
    });
  });
}

async function serveStatic(pathname, response) {
  const entry = staticFiles[pathname];
  if (!entry) return notFound(response);
  try {
    const content = await readFile(join(root, entry[0]));
    response.writeHead(200, { "Content-Type": entry[1], "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    response.end(content);
  } catch { notFound(response); }
}

async function openEventStream(request, response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no"
  });
  response.write("retry: 3000\n\n");
  // En fane, der genopretter forbindelsen efter en genstart, får straks den aktuelle tilstand.
  response.write(`event: office-state\ndata: ${JSON.stringify(officeView(await store.snapshot()))}\n\n`);
  eventClients.add(response);
  const heartbeat = setInterval(() => response.write(": puls\n\n"), 25_000);
  request.on("close", () => { clearInterval(heartbeat); eventClients.delete(response); });
}

async function createProject(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!name) throw new Error("Et projekt skal have et navn.");
  if (name.length > 80 || description.length > 420) throw new Error("Projektet er for langt. Hold navnet under 80 og beskrivelsen under 420 tegn.");
  const colors = ["#f36d4c", "#6fc8e7", "#a7a2ed", "#92dfc8", "#f9d977"];
  return mutate(state => {
    const project = { id: makeId("project"), name, description: description || "Et nyt projekt, der venter på sit første arbejdsspor.", state: "Udforsker", color: colors[state.projects.length % colors.length], people: ["manager", "researcher"], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    state.projects.unshift(project);
    state.activeProjectId = project.id;
    addActivity(state, "manager", `Oprettede projektet “${project.name}”.`, project.id, "project");
    return project;
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${host}:${port}`);
  const segments = url.pathname.split("/").filter(Boolean);
  const refusal = rejectForeignRequest(request);
  if (refusal) return json(response, 403, { error: refusal });

  if (request.method === "GET" && url.pathname === "/api/events") return openEventStream(request, response);
  if (request.method === "GET" && url.pathname === "/api/health") return json(response, 200, { ok: true, busy: activeRun, worker: "Codex · read-only", managerAvailable: await checkCodex(), localOnly: true });
  if (request.method === "GET" && url.pathname === "/api/bootstrap") return json(response, 200, { ok: true, office: officeView(await store.snapshot()) });
  if (request.method === "GET" && segments[0] === "api" && segments[1] === "attachments" && segments[2]) {
    const state = await store.snapshot();
    const attachment = (state.attachments || []).find(item => item.id === segments[2]);
    if (!attachment || !imageExtensions[attachment.mimeType] || !/^[a-z0-9-]+\.(png|jpg|webp|gif)$/.test(attachment.storageName || "")) return notFound(response);
    try {
      const content = await readFile(join(uploadsDirectory, attachment.storageName));
      response.writeHead(200, { "Content-Type": attachment.mimeType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      return response.end(content);
    } catch { return notFound(response); }
  }

  if (request.method === "POST" && url.pathname === "/api/projects") {
    try { const result = await createProject(parseBody(await readBody(request))); return json(response, 201, { ok: true, project: result.result, office: officeView(result.state) }); }
    catch (error) { return json(response, 400, { error: error.message || "Projektet kunne ikke oprettes." }); }
  }

  if (request.method === "POST" && segments[0] === "api" && segments[1] === "projects" && segments[3] === "activate") {
    const projectId = segments[2];
    const result = await mutate(state => {
      const project = state.projects.find(item => item.id === projectId);
      if (!project) throw new Error("Projektet findes ikke.");
      state.activeProjectId = projectId;
      addActivity(state, "manager", `Flyttede dagens fokus til “${project.name}”.`, projectId, "focus");
      return project;
    }).catch(error => ({ error }));
    if (result.error) return json(response, 404, { error: result.error.message });
    return json(response, 200, { ok: true, office: officeView(result.state) });
  }

  if (request.method === "POST" && url.pathname === "/api/tasks") {
    try {
      const body = parseBody(await readBody(request));
      const outcome = await mutate(state => {
        const project = state.projects.find(item => item.id === body.projectId);
        const role = state.agents[body.role] ? body.role : "manager";
        const title = typeof body.title === "string" ? body.title.trim() : "";
        if (!project || !title) throw new Error("Vælg et projekt og giv opgaven en titel.");
        const task = { id: makeId("task"), projectId: project.id, role, state: "planned", progress: 0, title, description: String(body.description || "").slice(0, 520), acceptance: String(body.acceptance || "").slice(0, 520), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        state.tasks.unshift(task);
        if (!project.people.includes(role)) project.people.push(role);
        project.updatedAt = new Date().toISOString();
        addActivity(state, "manager", `Klargjorde “${task.title}” til ${roleName(role).toLowerCase()}.`, project.id, "task");
        return task;
      });
      return json(response, 201, { ok: true, task: outcome.result, office: officeView(outcome.state) });
    } catch (error) { return json(response, 400, { error: error.message || "Opgaven kunne ikke oprettes." }); }
  }

  if (request.method === "POST" && url.pathname === "/api/library") {
    try {
      const body = parseBody(await readBody(request));
      const outcome = await mutate(state => {
        const project = state.projects.find(item => item.id === body.projectId);
        const title = typeof body.title === "string" ? body.title.trim() : "";
        const content = typeof body.content === "string" ? body.content.trim() : "";
        const type = ["note", "brief", "link"].includes(body.type) ? body.type : "note";
        if (!project || !title || !content) throw new Error("Vælg et projekt og udfyld både titel og indhold.");
        if (title.length > 120 || content.length > 1_600) throw new Error("Materialet er for langt. Hold titlen under 120 og indholdet under 1.600 tegn.");
        const item = { id: makeId("reference"), projectId: project.id, type, title, content, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        state.libraryItems.unshift(item);
        project.updatedAt = new Date().toISOString();
        addActivity(state, "manager", `Gemte “${item.title}” i det fælles bibliotek.`, project.id, "library");
        return item;
      });
      return json(response, 201, { ok: true, item: outcome.result, office: officeView(outcome.state) });
    } catch (error) { return json(response, 400, { error: error.message || "Materialet kunne ikke gemmes." }); }
  }

  if (request.method === "POST" && url.pathname === "/api/attachments") {
    try {
      const body = parseBody(await readBody(request, maxAttachmentBytes * 2));
      const projectId = typeof body.projectId === "string" ? body.projectId : "";
      const before = await store.snapshot();
      if (!before.projects.some(project => project.id === projectId)) throw new Error("Vælg et projekt, før du gemmer et billede.");
      const { buffer, mimeType, extension } = decodeImageData(body.dataUrl);
      const originalName = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : `Reference.${extension}`;
      const attachment = { id: makeId("attachment"), projectId, name: originalName, mimeType, size: buffer.length, storageName: "", createdAt: new Date().toISOString() };
      attachment.storageName = `${attachment.id}.${extension}`;
      await mkdir(uploadsDirectory, { recursive: true });
      await writeFile(join(uploadsDirectory, attachment.storageName), buffer);
      const outcome = await mutate(state => {
        const project = state.projects.find(item => item.id === projectId);
        if (!project) throw new Error("Projektet findes ikke længere.");
        state.attachments.unshift(attachment);
        const item = { id: makeId("reference"), projectId: project.id, type: "attachment", title: originalName, content: "Lokalt referencebillede. Det er gemt i projektet, men ikke læst af manageren eller sendt til en model.", attachmentId: attachment.id, createdAt: attachment.createdAt, updatedAt: attachment.createdAt };
        state.libraryItems.unshift(item);
        project.updatedAt = attachment.createdAt;
        addActivity(state, "manager", `Mads gemte referencebilledet “${originalName}” i det fælles bibliotek.`, project.id, "attachment");
        return { attachment, item };
      });
      return json(response, 201, { ok: true, ...outcome.result, office: officeView(outcome.state) });
    } catch (error) { return json(response, 400, { error: error.message || "Billedet kunne ikke gemmes." }); }
  }

  if (request.method === "POST" && url.pathname === "/api/presentations") {
    try {
      const body = parseBody(await readBody(request));
      const outcome = await mutate(state => {
        const project = state.projects.find(item => item.id === body.projectId);
        const title = typeof body.title === "string" ? body.title.trim() : "";
        const directionA = typeof body.directionA === "string" ? body.directionA.trim() : "";
        const directionB = typeof body.directionB === "string" ? body.directionB.trim() : "";
        const criteria = typeof body.criteria === "string" ? body.criteria.trim() : "";
        const recommendation = typeof body.recommendation === "string" ? body.recommendation.trim() : "";
        const level = body.level === "team" ? "team" : "executive";
        if (!project || !title || !directionA || !directionB || !criteria) throw new Error("En designgennemgang skal have projekt, titel, to retninger og vurderingskriterier.");
        if ([title, directionA, directionB, criteria, recommendation].some(value => value.length > 1_200)) throw new Error("En del af designgennemgangen er for lang. Hold hvert felt under 1.200 tegn.");
        const presentation = { id: makeId("presentation"), projectId: project.id, type: "design", title, directionA, directionB, criteria, recommendation: recommendation || "Ingen anbefaling er skrevet endnu.", level, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        const decision = {
          id: makeId("decision"), projectId: project.id, type: "Designgennemgang", status: "open", level, urgency: level === "executive" ? "today" : "when_ready",
          title, text: `Retning A: ${directionA}\n\nRetning B: ${directionB}`, recommendation: presentation.recommendation, tradeoff: criteria,
          primary: level === "executive" ? "Vælg retning" : "Godkend teamvalg", secondary: "Bed om ny runde", roles: ["designer"], planTaskIds: [], createdAt: new Date().toISOString(), presentationId: presentation.id
        };
        presentation.decisionId = decision.id;
        state.presentations.unshift(presentation);
        state.decisions.unshift(decision);
        project.updatedAt = new Date().toISOString();
        addConversation(state, project.id, "manager", `Designgennemgang klar: ${title}.`, "presentation", presentation.id);
        addActivity(state, "manager", `Klargjorde designgennemgangen “${title}”.`, project.id, "design");
        return { presentation, decision };
      });
      return json(response, 201, { ok: true, ...outcome.result, office: officeView(outcome.state) });
    } catch (error) { return json(response, 400, { error: error.message || "Designgennemgangen kunne ikke gemmes." }); }
  }

  if (request.method === "POST" && segments[0] === "api" && segments[1] === "tasks" && segments[3] === "ready") {
    const taskId = segments[2];
    try {
      const outcome = await mutate(state => {
        const task = state.tasks.find(item => item.id === taskId);
        if (!task) throw new Error("Opgaven findes ikke længere.");
        if (task.state !== "planned") throw new Error("Kun planlagte opgaver kan klargøres.");
        task.state = "ready";
        task.updatedAt = new Date().toISOString();
        markAgentReady(state.agents[task.role]);
        const project = state.projects.find(item => item.id === task.projectId);
        if (project) project.updatedAt = new Date().toISOString();
        addActivity(state, "manager", `Klargjorde “${task.title}”. Den starter først, når en godkendt worker bliver koblet på.`, task.projectId, "task");
        return task;
      });
      return json(response, 200, { ok: true, task: outcome.result, office: officeView(outcome.state) });
    } catch (error) { return json(response, 400, { error: error.message || "Opgaven kunne ikke klargøres." }); }
  }

  if (request.method === "POST" && segments[0] === "api" && segments[1] === "decisions" && segments[3] === "respond") {
    const decisionId = segments[2];
    try {
      const body = parseBody(await readBody(request));
      const outcome = await mutate(state => {
        const decision = state.decisions.find(item => item.id === decisionId && item.status === "open");
        if (!decision) throw new Error("Beslutningen findes ikke længere.");
        const choice = body.choice === "secondary" ? "secondary" : "primary";
        decision.status = "resolved";
        decision.choice = choice;
        decision.resolvedAt = new Date().toISOString();
        const planTasks = (decision.planTaskIds || []).map(taskId => state.tasks.find(item => item.id === taskId)).filter(task => task?.state === "planned");
        for (const task of planTasks) {
          // "Ny runde" betyder, at oplægget er fravalgt. Dets opgaver må ikke blive liggende som spøgelsesarbejde.
          task.state = choice === "primary" ? "ready" : "dropped";
          task.updatedAt = decision.resolvedAt;
          if (choice === "primary") markAgentReady(state.agents[task.role]);
        }
        const delivered = decision.deliveryTaskId && state.tasks.find(item => item.id === decision.deliveryTaskId);
        if (delivered && choice === "secondary" && delivered.state === "done") {
          // Sendt tilbage: opgaven er åben igen, artefaktet bliver liggende som historik.
          delivered.state = "active";
          delivered.progress = 0;
          delivered.updatedAt = decision.resolvedAt;
        }
        addConversation(state, decision.projectId, "mads", `${choice === "primary" ? "Godkendte" : delivered ? "Sendte tilbage" : "Bad om ny runde på"}: ${decision.title}.`, "decision", decision.id);
        addActivity(state, "manager", choice === "primary" ? `Mads godkendte næste arbejdsspor: ${decision.title}.` : `Mads bad om en ny runde på: ${decision.title}.`, decision.projectId, "decision");
        return decision;
      });
      return json(response, 200, { ok: true, decision: outcome.result, office: officeView(outcome.state) });
    } catch (error) { return json(response, 400, { error: error.message || "Beslutningen kunne ikke gemmes." }); }
  }

  if (request.method === "POST" && url.pathname === "/api/meetings") {
    try {
      const body = parseBody(await readBody(request));
      const outcome = await mutate(state => {
        const projectId = state.projects.some(project => project.id === body.projectId) ? body.projectId : state.activeProjectId;
        addActivity(state, "manager", "Mads markerede et kort møde om retning og afhængigheder. Der er endnu ikke startet en automatisk samtale mellem modeller.", projectId, "meeting");
        return { projectId };
      });
      return json(response, 200, { ok: true, office: officeView(outcome.state) });
    } catch (error) { return json(response, 400, { error: error.message || "Mødet kunne ikke startes." }); }
  }

  if (request.method === "POST" && url.pathname === "/api/manager") {
    if (activeRun) return json(response, 429, { error: "Manageren arbejder allerede. Vent på det nuværende svar." });
    activeRun = true;
    let started = false;
    try {
      if (!(await checkCodex())) return json(response, 503, { error: "Manageren er ikke forbundet: Codex blev ikke fundet på denne Mac. Installér og log ind i Codex, og genstart serveren." });
      const body = parseBody(await readBody(request));
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) return json(response, 400, { error: "Skriv først en besked til manageren." });
      if (message.length > maxMessageLength) return json(response, 400, { error: "Hold beskeden under 2.500 tegn." });
      const before = await store.snapshot();
      const project = before.projects.find(item => item.id === body.projectId) || before.projects.find(item => item.id === before.activeProjectId) || null;
      const projectTasks = before.tasks.filter(task => task.projectId === project?.id && task.state !== "dropped").slice(0, 12);
      const projectReferences = (before.libraryItems || []).filter(item => item.projectId === project?.id).slice(0, 12);
      const conversationHistory = (before.conversations || []).filter(item => item.projectId === project?.id).slice(0, 12);
      const previousDecision = before.decisions.find(item => item.id === body.decisionId && item.status === "open") || null;
      started = true;
      await mutate(state => {
        addConversation(state, project?.id || state.activeProjectId, "mads", message, "message");
        state.agents.manager.availability = "active";
        state.agents.manager.status = "Tænker over din idé";
        state.agents.manager.task = { title: "Samler et arbejdsspor", description: "Manageren vurderer mål, roller og om noget reelt behøver Mads' beslutning.", progress: 35 };
        addActivity(state, "manager", "Tog imod en ny besked fra Mads og samler et forslag.", project?.id || null, "manager");
      });
      const result = await runManager(message, project, projectTasks, projectReferences, conversationHistory, before.preferences, previousDecision, (before.radar || []).filter(item => ["ny", "afprøves"].includes(item.status)).slice(0, 5));
      const outcome = await mutate(state => {
        const projectId = project?.id || state.activeProjectId;
        // Spørgsmålet lukkes først, når der faktisk findes et nyt oplæg. Fejler kørslen, står det stadig i indbakken.
        const previous = previousDecision && state.decisions.find(item => item.id === previousDecision.id && item.status === "open");
        if (previous) {
          previous.status = "resolved";
          previous.choice = "reply";
          previous.resolvedAt = new Date().toISOString();
          for (const taskId of previous.planTaskIds || []) {
            const task = state.tasks.find(item => item.id === taskId);
            if (task?.state === "planned") { task.state = "dropped"; task.updatedAt = previous.resolvedAt; }
          }
          addActivity(state, "manager", "Mads svarede på managerens spørgsmål; det nye oplæg erstatter det forrige.", previous.projectId, "decision");
        }
        const mutableProject = state.projects.find(item => item.id === projectId);
        const newlyStaffed = mutableProject
          ? result.plan.roles.filter(role => !mutableProject.people.includes(role))
          : [];
        if (mutableProject) {
          mutableProject.people.push(...newlyStaffed);
          mutableProject.updatedAt = new Date().toISOString();
        }
        const planTaskIds = result.plan.roles.map(role => {
          const task = { id: makeId("task"), projectId, role, state: "planned", progress: 0, title: `${roleName(role)}: ${roleTaskAction(role, result.plan.nextAction)}`, description: result.plan.summary, acceptance: "Aflever et konkret artefakt, forklar valget og peg på eventuelle beslutninger til Mads.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          state.tasks.unshift(task);
          return task.id;
        });
        const decision = {
          id: makeId("decision"), projectId, type: result.plan.decision.level === "executive" ? "Direktionsbeslutning" : "Team-afgørelse", status: "open",
          level: result.plan.decision.level, urgency: result.plan.decision.urgency, title: result.plan.question || result.plan.decision.title,
          text: result.plan.summary, recommendation: result.plan.decision.recommendation, tradeoff: result.plan.decision.tradeoff,
          primary: result.plan.question ? "Svar manageren" : result.plan.decision.level === "executive" ? "Tag beslutning" : "Godkend teamvalg",
          secondary: "Bed om ny runde", roles: result.plan.roles, planTaskIds, createdAt: new Date().toISOString(), plan: result.plan
        };
        state.decisions.unshift(decision);
        const manager = state.agents.manager;
        manager.availability = "ready";
        manager.status = "Har et oplæg klar til Mads";
        manager.task = { title: "Har afleveret et arbejdsspor", description: result.plan.nextAction, progress: 100 };
        manager.message = result.plan.summary;
        manager.artifacts.unshift({ name: "Managerens oplæg", state: "netop nu" });
        manager.artifacts = manager.artifacts.slice(0, 6);
        addConversation(state, decision.projectId, "manager", result.plan.summary, "plan", decision.id);
        if (newlyStaffed.length) addActivity(state, "manager", `Satte ${newlyStaffed.map(role => roleName(role).toLowerCase()).join(", ")} på “${mutableProject.name}”.`, decision.projectId, "staffing");
        addActivity(state, "manager", `Afleverede et oplæg og klargjorde ${result.plan.roles.length} opgave${result.plan.roles.length === 1 ? "" : "r"}.`, decision.projectId, "manager");
        return { plan: result.plan, decision };
      });
      return json(response, 200, { ok: true, ...outcome.result, usage: result.usage, office: officeView(outcome.state) });
    } catch (error) {
      const message = error.message || "Noget gik galt hos manageren.";
      if (!started) return json(response, 400, { error: message });
      const recovery = await mutate(state => {
        state.agents.manager.availability = "ready";
        state.agents.manager.status = "Klar igen efter en fejl";
        state.agents.manager.task = { title: "Venter på næste besked", description: "Den forrige managerkørsel fejlede, men ændrede ikke filer eller eksterne tjenester.", progress: 0 };
        addActivity(state, "manager", "Kunne ikke afslutte et oplæg; kontoret er klar til et nyt forsøg.", state.activeProjectId, "error");
      });
      return json(response, 500, { error: message, office: officeView(recovery.state) });
    } finally {
      activeRun = false;
      await publish(await store.snapshot());
    }
  }

  if (request.method === "POST" && segments[0] === "api" && segments[1] === "tasks" && ["start", "deliver", "drop"].includes(segments[3])) {
    const taskId = segments[2];
    const action = segments[3];
    try {
      const body = parseBody(await readBody(request));
      const outcome = await mutate(state => {
        const task = state.tasks.find(item => item.id === taskId);
        if (!task) throw new Error("Opgaven findes ikke længere.");
        const at = new Date().toISOString();
        const project = state.projects.find(item => item.id === task.projectId);
        if (action === "start") return startTask(state, task, body, at);
        if (action === "deliver") return deliverTask(state, task, project, body, at);
        if (!openTaskStates.has(task.state)) throw new Error("Kun åbne opgaver kan fravælges.");
        task.state = "dropped";
        task.updatedAt = at;
        addActivity(state, "manager", `Fravalgte “${task.title}”.`, task.projectId, "task");
        return { task };
      });
      return json(response, 200, { ok: true, ...outcome.result, office: officeView(outcome.state) });
    } catch (error) { return json(response, 400, { error: error.message || "Opgaven kunne ikke opdateres." }); }
  }

  if (segments[0] === "api" && segments[1] === "preferences" && ((request.method === "POST" && !segments[2]) || (["PATCH", "DELETE"].includes(request.method) && segments[2]))) {
    try {
      const body = request.method === "DELETE" ? {} : parseBody(await readBody(request));
      const outcome = await mutate(state => {
        if (request.method === "DELETE") {
          const index = state.preferences.findIndex(item => item.id === segments[2]);
          if (index < 0) throw new Error("Præferencen findes ikke længere.");
          const [removed] = state.preferences.splice(index, 1);
          addActivity(state, "manager", `Mads fjernede præferencen “${removed.label}”.`, null, "profile");
          return { preference: removed };
        }
        const fields = preferenceFields(body);
        if (request.method === "POST") {
          const preference = { id: makeId("pref"), ...fields, source: "Tilføjet af Mads" };
          state.preferences.push(preference);
          addActivity(state, "manager", `Mads tilføjede præferencen “${preference.label}”.`, null, "profile");
          return { preference };
        }
        const preference = state.preferences.find(item => item.id === segments[2]);
        if (!preference) throw new Error("Præferencen findes ikke længere.");
        Object.assign(preference, fields, { source: preference.source?.includes("redigeret") ? preference.source : `${preference.source || "Mads"} · redigeret` });
        addActivity(state, "manager", `Mads redigerede præferencen “${preference.label}”.`, null, "profile");
        return { preference };
      });
      return json(response, request.method === "POST" ? 201 : 200, { ok: true, ...outcome.result, office: officeView(outcome.state) });
    } catch (error) { return json(response, 400, { error: error.message || "Præferencen kunne ikke gemmes." }); }
  }

  if (request.method === "PATCH" && segments[0] === "api" && segments[1] === "projects" && segments[2] && !segments[3]) {
    try {
      const body = parseBody(await readBody(request));
      const outcome = await mutate(state => {
        const project = state.projects.find(item => item.id === segments[2]);
        if (!project) throw new Error("Projektet findes ikke længere.");
        const name = cleanText(body.name, 80);
        if (!name) throw new Error("Et projekt skal have et navn.");
        const description = cleanText(body.description, 420);
        const nextState = projectStates.includes(body.state) ? body.state : project.state;
        const changes = [name !== project.name && "navn", description !== project.description && "beskrivelse", nextState !== project.state && `status → ${nextState}`].filter(Boolean);
        Object.assign(project, { name, description: description || project.description, state: nextState, updatedAt: new Date().toISOString() });
        if (changes.length) addActivity(state, "manager", `Mads opdaterede “${project.name}”: ${changes.join(", ")}.`, project.id, "project");
        return { project };
      });
      return json(response, 200, { ok: true, ...outcome.result, office: officeView(outcome.state) });
    } catch (error) { return json(response, 400, { error: error.message || "Projektet kunne ikke opdateres." }); }
  }

  if (request.method === "DELETE" && segments[0] === "api" && segments[1] === "library" && segments[2]) {
    try {
      let storageName = null;
      const outcome = await mutate(state => {
        const item = state.libraryItems.find(entry => entry.id === segments[2]);
        if (!item) throw new Error("Materialet findes ikke længere.");
        state.libraryItems = state.libraryItems.filter(entry => entry.id !== item.id);
        if (item.attachmentId) {
          const attachment = state.attachments.find(entry => entry.id === item.attachmentId);
          storageName = attachment?.storageName || null;
          state.attachments = state.attachments.filter(entry => entry.id !== item.attachmentId);
        }
        for (const task of state.tasks) if (task.artifactId === item.id) task.artifactId = null;
        addActivity(state, "manager", `Mads fjernede “${item.title}” fra biblioteket.`, item.projectId, "library");
        return { item };
      });
      // Billedfilen slettes først, når registreringen er væk, så biblioteket aldrig peger på en manglende fil.
      if (storageName && /^[a-z0-9-]+\.(png|jpg|webp|gif)$/.test(storageName)) await unlink(join(uploadsDirectory, storageName)).catch(() => undefined);
      return json(response, 200, { ok: true, ...outcome.result, office: officeView(outcome.state) });
    } catch (error) { return json(response, 400, { error: error.message || "Materialet kunne ikke fjernes." }); }
  }

  if (segments[0] === "api" && segments[1] === "radar" && ((request.method === "POST" && !segments[2]) || (["PATCH", "DELETE"].includes(request.method) && segments[2]))) {
    try {
      const body = request.method === "DELETE" ? {} : parseBody(await readBody(request));
      const outcome = await mutate(state => {
        if (request.method === "POST") {
          const item = { id: makeId("radar"), ...radarFields(body), status: "ny", addedBy: cleanText(body.addedBy, 60) || "Mads", createdAt: new Date().toISOString() };
          state.radar.unshift(item);
          state.radar = state.radar.slice(0, 120);
          addActivity(state, "trend_scout", `Nyt på radaren: “${item.title}” · tilføjet af ${item.addedBy}.`, null, "radar");
          return { item };
        }
        const item = state.radar.find(entry => entry.id === segments[2]);
        if (!item) throw new Error("Radar-punktet findes ikke længere.");
        if (request.method === "DELETE") {
          state.radar = state.radar.filter(entry => entry.id !== item.id);
          return { item };
        }
        if (!radarStatuses.includes(body.status)) throw new Error("Ukendt status for radar-punktet.");
        item.status = body.status;
        item.updatedAt = new Date().toISOString();
        addActivity(state, "trend_scout", `Radar-punktet “${item.title}” er nu: ${item.status}.`, null, "radar");
        return { item };
      });
      return json(response, request.method === "POST" ? 201 : 200, { ok: true, ...outcome.result, office: officeView(outcome.state) });
    } catch (error) { return json(response, 400, { error: error.message || "Radaren kunne ikke opdateres." }); }
  }

  if (request.method === "GET") return serveStatic(url.pathname, response);
  return json(response, 405, { error: "Metoden er ikke tilladt." });
});

// Præferencer er bløde signaler til manageren. Kun Mads kan skrive dem, og de må aldrig blive til forbud.
function preferenceFields(body) {
  const label = cleanText(body.label, 60);
  const value = cleanText(body.value, 400);
  if (!label || !value) throw new Error("En præference skal have en kort overskrift og en forklaring.");
  return { label, value, confidence: body.confidence === "antagelse" ? "antagelse" : "bekræftet" };
}

const radarStatuses = ["ny", "afprøves", "brugt", "forkastet"];

// Et radar-punkt skal kunne efterprøves: hvad er nyt, hvorfor det betyder noget for kontoret, og helst en kilde.
function radarFields(body) {
  const title = cleanText(body.title, 140);
  const content = cleanText(body.content, 800);
  const url = cleanText(body.url, 600);
  if (!title || !content) throw new Error("Et radar-punkt skal have en titel og en kort forklaring af, hvorfor det er relevant.");
  if (url && !/^https?:\/\//i.test(url)) throw new Error("Kilden skal være et http- eller https-link.");
  return { title, content, url: url || null };
}

function cleanText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// "I gang" registrerer, hvem der faktisk arbejder på opgaven — Mads selv eller en agent uden for kontoret.
// Kontoret starter aldrig selv en model, så der skal altid stå et menneskeligt eller eksternt navn på.
function startTask(state, task, body, at) {
  if (task.state !== "ready") throw new Error("Kun klargjorte opgaver kan sættes i gang.");
  task.state = "active";
  task.executor = cleanText(body.executor, 80) || "Mads";
  task.startedAt = at;
  task.updatedAt = at;
  addActivity(state, task.role, `“${task.title}” er i gang · udføres af ${task.executor}.`, task.projectId, "task");
  return { task };
}

// En aflevering er et artefakt, ikke en påstand: den kræver en titel og enten et link/en placering eller en beskrivelse af tjekket.
function deliverTask(state, task, project, body, at) {
  if (!["ready", "active"].includes(task.state)) throw new Error("Kun klargjorte eller igangværende opgaver kan afleveres.");
  const title = cleanText(body.title, 160);
  const location = cleanText(body.location, 600);
  const check = cleanText(body.check, 1_200);
  const forMads = cleanText(body.forMads, 600);
  if (!title || (!location && !check)) throw new Error("En aflevering skal have en titel og enten et link/en placering eller en beskrivelse af, hvordan den er tjekket.");
  const item = {
    id: makeId("reference"), projectId: task.projectId, type: "artifact", title,
    content: [check && `Tjekket: ${check}`, location && `Placering: ${location}`].filter(Boolean).join("\n"),
    url: /^https?:\/\//i.test(location) ? location : null, taskId: task.id, createdAt: at, updatedAt: at
  };
  state.libraryItems.unshift(item);
  task.state = "done";
  task.progress = 100;
  task.artifactId = item.id;
  task.deliveredAt = at;
  task.updatedAt = at;
  if (project) project.updatedAt = at;
  let decision = null;
  if (forMads) {
    decision = {
      id: makeId("decision"), projectId: task.projectId, type: "Aflevering", status: "open", level: "team", urgency: "today",
      title: `Aflevering: ${title}`, text: forMads, recommendation: "Se artefaktet i biblioteket og godkend, eller send det tilbage med en kort note.",
      tradeoff: check || "Tjekket er ikke beskrevet.", primary: "Godkend aflevering", secondary: "Send tilbage",
      roles: [task.role], planTaskIds: [], deliveryTaskId: task.id, createdAt: at
    };
    state.decisions.unshift(decision);
  }
  const by = task.executor || "Mads";
  addConversation(state, task.projectId, "manager", `Aflevering på ${roleName(task.role).toLowerCase()}s spor: “${title}” · udført af ${by}${forMads ? ". Venter på dit blik." : "."}`, "delivery", task.id);
  addActivity(state, task.role, `“${title}” er afleveret til “${task.title}” · udført af ${by}.`, task.projectId, "delivery");
  return { task, item, decision };
}

function markAgentReady(agent) {
  if (!agent || agent.availability === "active") return;
  // En specialist i talentbanken er stadig ikke forbundet, selv om der ligger en opgave klar til rollen.
  if (agent.availability === "bench") { agent.status = "Har en opgave klar · ikke forbundet"; return; }
  agent.availability = "ready";
  agent.status = "Har en opgave klar";
}

function roleTaskAction(role, nextAction) {
  const prefix = { designer: "formgiv", researcher: "undersøg", developer: "gør klar til at bygge", reviewer: "forbered kvalitetstjek af", game_designer: "afgræns gameplay for", graphic_designer: "læg visuel retning for", copywriter: "formulér tekst til", marketer: "positionér og afgræns", trend_scout: "find afprøvelige nyheder til" }[role] || "bearbejd";
  return `${prefix} — ${nextAction}`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  Promise.all([store.load(), checkCodex()]).then(([, codexReady]) => server.listen(port, host, () => {
    console.log(`AI-kontoret kører på http://${host}:${port}`);
    if (!codexReady) console.log("Codex blev ikke fundet. Kontoret virker, men manageren kan ikke lave oplæg før Codex er installeret og logget ind.");
  }));
}
