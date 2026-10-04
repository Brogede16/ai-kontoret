import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { addActivity, createOfficeStore, projectSummary } from "./store.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const store = createOfficeStore(process.env.OFFICE_STATE_PATH || join(root, "data", "office-state.json"));
const maxMessageLength = 2_500;
const maxRunMs = 120_000;
const eventClients = new Set();
let activeRun = false;

const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml"
};

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function notFound(response) { return json(response, 404, { error: "Vi kunne ikke finde det, du bad om." }); }

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

function parseBody(raw) {
  try { return JSON.parse(raw); }
  catch { throw new Error("Beskeden kunne ikke læses."); }
}

function makeId(prefix) { return `${prefix}-${randomUUID().slice(0, 8)}`; }
function roleName(role) { return ({ manager: "Manageren", designer: "Designeren", researcher: "Researcheren", developer: "Udvikleren", reviewer: "Revieweren" })[role] || role; }

function officeView(state) {
  return { ...state, projects: state.projects.map(project => projectSummary(state, project)), decisions: state.decisions.filter(decision => decision.status === "open") };
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

function managerPrompt(message, project, projectTasks, projectReferences, preferences, previousDecision) {
  const projectContext = project ? `Aktivt projekt: ${project.name}. ${project.description}` : "Intet projekt er valgt endnu; afgør om beskeden peger på et nyt projekt eller næste spor.";
  const taskContext = projectTasks.length
    ? `Eksisterende arbejdskø (den er kun planlagt eller klar; intet er startet automatisk):\n${projectTasks.map(task => `- [${task.state}] ${roleName(task.role)}: ${task.title}${task.acceptance ? ` (accept: ${task.acceptance})` : ""}`).join("\n")}`
    : "Arbejdskø: ingen konkrete opgaver endnu.";
  const referenceContext = projectReferences.length
    ? `Fælles bibliotek (Mads har gemt disse noter eller links; links er ikke hentet eller læst):\n${projectReferences.map(item => `- [${item.type}] ${item.title}: ${item.content}`).join("\n")}`
    : "Fælles bibliotek: intet projektmateriale er gemt endnu.";
  const profile = preferences.map(preference => `- ${preference.value}`).join("\n");
  const decisionContext = previousDecision ? `\nMads svarer på dit tidligere spørgsmål: "${previousDecision.title}". Det tidligere oplæg var: "${previousDecision.text}". Brug hans nye besked som svaret og lav et opdateret spor.` : "";
  return `Du er Manageren i Mads' AI-kontor. Du skal hjælpe Mads med at omsætte en idé til et lille, sikkert arbejdsspor.

Mads skrev: "${message}"
${projectContext}
${taskContext}
${referenceContext}

Kendte præferencer (bløde signaler, ikke forbud):
${profile}
${decisionContext}

Returnér KUN et JSON-objekt, der overholder det givne schema. Vælg højst tre roller. Stil kun et spørgsmål, hvis noget vigtigt reelt blokerer næste trin; ellers er question null.

Vigtige regler: Du må ikke påstå, at medarbejdere allerede er startet, at du har set en vedhæftning, læst en ekstern konto, ændret filer eller lavet deploy. Du er kun i læse- og rådgivningstilstand. Lav ikke skjult ræsonnement eller værktøjslog i svaret.`;
}

function parsePlan(message) {
  try {
    const parsed = JSON.parse(message);
    if (!parsed.summary || !Array.isArray(parsed.roles) || !parsed.nextAction) throw new Error("mangler felter");
    return { summary: parsed.summary, roles: parsed.roles, nextAction: parsed.nextAction, question: parsed.question || null };
  } catch {
    return { summary: message.trim(), roles: ["researcher", "designer"], nextAction: "Saml et kort oplæg, før holdet går videre.", question: null };
  }
}

function runManager(message, project, projectTasks, projectReferences, preferences, previousDecision) {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", [
      "exec", "--json", "--sandbox", "read-only", "--ephemeral", "--cd", root,
      "--output-schema", join(root, "schemas", "manager-plan.schema.json"),
      managerPrompt(message, project, projectTasks, projectReferences, preferences, previousDecision)
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
      finish(null, { plan: parsePlan(agentMessage), usage });
    });
  });
}

async function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const safePath = normalize(requested).replace(/^\.\.([/\\]|$)+/, "");
  if (safePath.startsWith("data/") || safePath.startsWith("schemas/")) return notFound(response);
  const filePath = join(root, safePath);
  if (!filePath.startsWith(root)) return json(response, 403, { error: "Ikke tilladt." });
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { "Content-Type": types[extname(filePath)] || "application/octet-stream" });
    response.end(content);
  } catch { notFound(response); }
}

function openEventStream(request, response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no"
  });
  response.write("retry: 3000\n\n");
  eventClients.add(response);
  request.on("close", () => eventClients.delete(response));
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

  if (request.method === "GET" && url.pathname === "/api/events") return openEventStream(request, response);
  if (request.method === "GET" && url.pathname === "/api/health") return json(response, 200, { ok: true, busy: activeRun, worker: "Codex · read-only", localOnly: true });
  if (request.method === "GET" && url.pathname === "/api/bootstrap") return json(response, 200, { ok: true, office: officeView(await store.snapshot()) });

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

  if (request.method === "POST" && segments[0] === "api" && segments[1] === "tasks" && segments[3] === "ready") {
    const taskId = segments[2];
    try {
      const outcome = await mutate(state => {
        const task = state.tasks.find(item => item.id === taskId);
        if (!task) throw new Error("Opgaven findes ikke længere.");
        if (task.state !== "planned") throw new Error("Kun planlagte opgaver kan klargøres.");
        task.state = "ready";
        task.updatedAt = new Date().toISOString();
        const agent = state.agents[task.role];
        if (agent && agent.availability !== "active") {
          agent.availability = "ready";
          agent.status = "Har en opgave klar";
        }
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
        if (choice === "primary" && decision.planTaskIds?.length) {
          for (const taskId of decision.planTaskIds) {
            const task = state.tasks.find(item => item.id === taskId);
            if (task && task.state === "planned") task.state = "ready";
          }
          for (const role of decision.roles || []) {
            const agent = state.agents[role];
            if (agent) { agent.availability = "ready"; agent.status = "Har en opgave klar"; }
          }
        }
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
    try {
      const body = parseBody(await readBody(request));
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) return json(response, 400, { error: "Skriv først en besked til manageren." });
      if (message.length > maxMessageLength) return json(response, 400, { error: "Hold beskeden under 2.500 tegn." });
      const before = await store.snapshot();
      const project = before.projects.find(item => item.id === body.projectId) || before.projects.find(item => item.id === before.activeProjectId) || null;
      const projectTasks = before.tasks.filter(task => task.projectId === project?.id).slice(0, 12);
      const projectReferences = (before.libraryItems || []).filter(item => item.projectId === project?.id).slice(0, 12);
      const previousDecision = before.decisions.find(item => item.id === body.decisionId && item.status === "open") || null;
      activeRun = true;
      if (typeof body.decisionId === "string") {
        await mutate(state => {
          const previous = state.decisions.find(item => item.id === body.decisionId && item.status === "open");
          if (!previous) return;
          previous.status = "resolved";
          previous.choice = "reply";
          previous.resolvedAt = new Date().toISOString();
          addActivity(state, "manager", "Mads svarede på managerens spørgsmål; den nye plan tager svaret med videre.", previous.projectId, "decision");
        });
      }
      await mutate(state => {
        state.agents.manager.availability = "active";
        state.agents.manager.status = "Tænker over din idé";
        state.agents.manager.task = { title: "Samler et arbejdsspor", description: "Manageren vurderer mål, roller og om noget reelt behøver Mads' beslutning.", progress: 35 };
        addActivity(state, "manager", "Tog imod en ny besked fra Mads og samler et forslag.", project?.id || null, "manager");
      });
      const result = await runManager(message, project, projectTasks, projectReferences, before.preferences, previousDecision);
      const outcome = await mutate(state => {
        const planTaskIds = result.plan.roles.map(role => {
          const task = { id: makeId("task"), projectId: project?.id || state.activeProjectId, role, state: "planned", progress: 0, title: `${roleName(role)}: ${roleTaskAction(role, result.plan.nextAction)}`, description: result.plan.summary, acceptance: "Aflever et konkret artefakt, forklar valget og peg på eventuelle beslutninger til Mads.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          state.tasks.unshift(task);
          return task.id;
        });
        const decision = { id: makeId("decision"), projectId: project?.id || state.activeProjectId, type: "Managerens oplæg", status: "open", title: result.plan.question || "Godkend næste arbejdsspor", text: result.plan.summary, primary: result.plan.question ? "Svar manageren" : "Godkend arbejdsspor", secondary: "Bed om ny runde", roles: result.plan.roles, planTaskIds, createdAt: new Date().toISOString(), plan: result.plan };
        state.decisions.unshift(decision);
        const mutableProject = state.projects.find(item => item.id === decision.projectId);
        if (mutableProject) mutableProject.updatedAt = new Date().toISOString();
        const manager = state.agents.manager;
        manager.availability = "ready";
        manager.status = "Har et oplæg klar til Mads";
        manager.task = { title: "Har afleveret et arbejdsspor", description: result.plan.nextAction, progress: 100 };
        manager.message = result.plan.summary;
        manager.artifacts.unshift({ name: "Managerens oplæg", state: "netop nu" });
        manager.artifacts = manager.artifacts.slice(0, 6);
        addActivity(state, "manager", `Afleverede et oplæg og klargjorde ${result.plan.roles.length} opgave${result.plan.roles.length === 1 ? "" : "r"}.`, decision.projectId, "manager");
        return { plan: result.plan, decision };
      });
      return json(response, 200, { ok: true, ...outcome.result, usage: result.usage, office: officeView(outcome.state) });
    } catch (error) {
      const message = error.message || "Noget gik galt hos manageren.";
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

  if (request.method === "GET") return serveStatic(url.pathname, response);
  return json(response, 405, { error: "Metoden er ikke tilladt." });
});

function roleTaskAction(role, nextAction) {
  const prefix = { designer: "formgiv", researcher: "undersøg", developer: "gør klar til at bygge", reviewer: "forbered kvalitetstjek af" }[role] || "bearbejd";
  return `${prefix} — ${nextAction}`;
}

store.load().then(() => server.listen(port, host, () => console.log(`AI-kontoret kører på http://${host}:${port}`)));
