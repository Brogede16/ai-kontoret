import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSeedState } from "../store.mjs";
import { managerPrompt, parsePlan } from "../server.mjs";

function startTestServer(port, statePath, codexBin = "ai-kontoret-codex-findes-ikke") {
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(port), OFFICE_STATE_PATH: statePath, CODEX_BIN: codexBin }
  });
  return new Promise((resolve, reject) => {
    let output = "";
    let errors = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Testserveren startede ikke."));
    }, 5_000);
    child.stdout.on("data", chunk => {
      output += chunk;
      if (output.includes("AI-kontoret kører")) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.stderr.on("data", chunk => { errors += chunk; });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => {
      if (!output.includes("AI-kontoret kører")) {
        clearTimeout(timer);
        reject(new Error(`Testserveren stoppede uventet (${code}): ${errors.trim()}`));
      }
    });
  });
}

function rawRequest(port, path, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method, headers }, response => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function withServer(run, seed, codexBin) {
  const directory = await mkdtemp(join(tmpdir(), "ai-kontoret-api-"));
  const statePath = join(directory, "office-state.json");
  const port = 44000 + Math.floor(Math.random() * 1000);
  let server;
  try {
    if (seed) await writeFile(statePath, JSON.stringify(seed), "utf8");
    server = await startTestServer(port, statePath, typeof codexBin === "function" ? await codexBin(directory) : codexBin);
    await run(port);
  } finally {
    if (server?.kill("SIGTERM")) await once(server, "exit");
    await rm(directory, { recursive: true, force: true });
  }
}

async function request(port, path, method = "GET", body) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, body: await response.json() };
}

test("projekt, bibliotek og opgave flyder gennem den lokale API uden worker-adgang", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-kontoret-api-"));
  const port = 43000 + Math.floor(Math.random() * 1000);
  let server;

  try {
    server = await startTestServer(port, join(directory, "office-state.json"));
    const project = await request(port, "/api/projects", "POST", { name: "API-test", description: "Et isoleret projekt." });
    assert.equal(project.status, 201);
    const projectId = project.body.project.id;

    const reference = await request(port, "/api/library", "POST", { projectId, type: "brief", title: "Testbrief", content: "Byg en tydelig første version." });
    assert.equal(reference.status, 201);
    assert.equal(reference.body.item.type, "brief");

    const attachment = await request(port, "/api/attachments", "POST", {
      projectId, name: "reference.png", dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLdnQAAAABJRU5ErkJggg=="
    });
    assert.equal(attachment.status, 201);
    assert.equal(attachment.body.attachment.mimeType, "image/png");
    const imageResponse = await fetch(`http://127.0.0.1:${port}/api/attachments/${attachment.body.attachment.id}`);
    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get("content-type"), "image/png");

    const presentation = await request(port, "/api/presentations", "POST", {
      projectId, level: "executive", title: "Vælg mobilretning", directionA: "Rolig og tekstbåret.", directionB: "Visuel og hurtig.", criteria: "Mobilforståelse og tempo.", recommendation: "Vælg B til første test."
    });
    assert.equal(presentation.status, 201);
    assert.equal(presentation.body.decision.level, "executive");

    const task = await request(port, "/api/tasks", "POST", { projectId, role: "developer", title: "Byg første flow", description: "Et lille preview.", acceptance: "Kan gennemgås i browseren." });
    assert.equal(task.status, 201);
    assert.equal(task.body.task.state, "planned");

    const specialistTask = await request(port, "/api/tasks", "POST", { projectId, role: "graphic_designer", title: "Lav et asset-brief", description: "Saml visuelle referencer.", acceptance: "Et afgrænset brief med kriterier." });
    assert.equal(specialistTask.status, 201);
    assert.equal(specialistTask.body.task.role, "graphic_designer");

    const ready = await request(port, `/api/tasks/${task.body.task.id}/ready`, "POST", {});
    assert.equal(ready.status, 200);
    assert.equal(ready.body.task.state, "ready");

    const resolved = await request(port, `/api/decisions/${presentation.body.decision.id}/respond`, "POST", { choice: "primary" });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.decision.status, "resolved");

    const office = await request(port, "/api/bootstrap");
    assert.equal(office.body.office.projects[0].id, projectId);
    assert.equal(office.body.office.libraryItems.some(item => item.id === reference.body.item.id), true);
    assert.equal(office.body.office.libraryItems.some(item => item.attachmentId === attachment.body.attachment.id), true);
    assert.equal(office.body.office.presentations.some(item => item.id === presentation.body.presentation.id), true);
    assert.equal(office.body.office.decisions.some(item => item.id === presentation.body.decision.id), false);
    assert.equal(office.body.office.conversations.some(item => item.relatedId === presentation.body.decision.id && item.role === "mads"), true);
    assert.equal(office.body.office.tasks.find(item => item.id === task.body.task.id)?.state, "ready");
    assert.equal(office.body.office.projects.find(item => item.id === projectId)?.people.includes("graphic_designer"), true);
  } finally {
    if (server?.kill("SIGTERM")) await once(server, "exit");
    await rm(directory, { recursive: true, force: true });
  }
});

test("fremmede sider kan ikke skrive til det lokale kontor", () => withServer(async port => {
  const body = JSON.stringify({ name: "Snigprojekt" });
  assert.equal(await rawRequest(port, "/api/projects", { method: "POST", headers: { "Content-Type": "text/plain" }, body }), 403);
  assert.equal(await rawRequest(port, "/api/projects", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://eksempel.dk" }, body }), 403);
  assert.equal(await rawRequest(port, "/api/bootstrap", { headers: { Host: "angriber.dk:80" } }), 403);
  assert.equal(await rawRequest(port, "/api/projects", { method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body }), 201);
}));

test("kun browserens egne filer serveres", () => withServer(async port => {
  assert.equal(await rawRequest(port, "/"), 200);
  assert.equal(await rawRequest(port, "/app.js"), 200);
  for (const path of ["/server.mjs", "/store.mjs", "/.git/config", "/data/office-state.json", "/Data/office-state.json", "/AGENTS.md", "/../server.mjs"]) {
    assert.equal(await rawRequest(port, path), 404, path);
  }
}));

test("manageren siger ærligt fra, når Codex ikke findes", () => withServer(async port => {
  const health = await request(port, "/api/health");
  assert.equal(health.body.managerAvailable, false);
  const reply = await request(port, "/api/manager", "POST", { message: "Lav en plan." });
  assert.equal(reply.status, 503);
  const office = await request(port, "/api/bootstrap");
  assert.equal(office.body.office.conversations.some(item => item.text === "Lav en plan."), false);
  assert.equal(office.body.office.agents.manager.availability, "ready");
}));

test("en ny runde fravælger oplæggets opgaver i stedet for at efterlade dem", async () => {
  const seed = createSeedState();
  const at = "2026-10-04T10:00:00.000Z";
  seed.tasks.unshift(
    { id: "task-plan-a", projectId: "ai-office", role: "designer", state: "planned", progress: 0, title: "Designeren: formgiv", description: "", acceptance: "", createdAt: at, updatedAt: at },
    { id: "task-plan-b", projectId: "ai-office", role: "copywriter", state: "planned", progress: 0, title: "Tekstforfatteren: formulér", description: "", acceptance: "", createdAt: at, updatedAt: at }
  );
  seed.decisions.unshift({ id: "decision-plan", projectId: "ai-office", status: "open", level: "team", urgency: "when_ready", title: "Godkend spor", text: "Et oplæg.", recommendation: "Godkend.", tradeoff: "Tid.", primary: "Godkend", secondary: "Bed om ny runde", roles: ["designer", "copywriter"], planTaskIds: ["task-plan-a", "task-plan-b"], createdAt: at });

  await withServer(async port => {
    const before = await request(port, "/api/bootstrap");
    assert.equal(before.body.office.agents.designer.workload.planned, 1);
    const reply = await request(port, "/api/decisions/decision-plan/respond", "POST", { choice: "secondary" });
    assert.equal(reply.status, 200);
    const tasks = reply.body.office.tasks.filter(task => task.id.startsWith("task-plan-"));
    assert.deepEqual(tasks.map(task => task.state), ["dropped", "dropped"]);
    assert.equal(reply.body.office.agents.designer.workload.planned, 0);
    assert.equal(reply.body.office.agents.copywriter.availability, "bench");
  }, seed);
});

test("en specialist forbliver i talentbanken, selv når dens opgave er klar", async () => {
  const seed = createSeedState();
  const at = "2026-10-04T10:00:00.000Z";
  seed.tasks.unshift({ id: "task-copy", projectId: "ai-office", role: "copywriter", state: "planned", progress: 0, title: "Skriv mikrocopy", description: "", acceptance: "", createdAt: at, updatedAt: at });
  await withServer(async port => {
    const reply = await request(port, "/api/tasks/task-copy/ready", "POST", {});
    assert.equal(reply.status, 200);
    assert.equal(reply.body.office.agents.copywriter.availability, "bench");
    assert.equal(reply.body.office.agents.copywriter.workload.ready, 1);
  }, seed);
});

test("et svar uden for schemaet bliver afvist i stedet for at blive gættet", () => {
  assert.throws(() => parsePlan("Jeg synes, vi skal starte med research."), /aftalte format/);
  assert.throws(() => parsePlan(JSON.stringify({ summary: "x", roles: ["hacker"], nextAction: "y", decision: { title: "t", recommendation: "r" } })), /aftalte format/);
  const plan = parsePlan(JSON.stringify({ summary: "Kort plan", roles: ["designer", "designer", "copywriter"], nextAction: "Lav to retninger", question: null, decision: { level: "executive", title: "Vælg", recommendation: "A", tradeoff: "Tid", urgency: "snart" } }));
  assert.deepEqual(plan.roles, ["designer", "copywriter"]);
  assert.equal(plan.decision.urgency, "when_ready");
});

// En falsk Codex, der svarer med et gyldigt oplæg. Den kører aldrig en model.
async function fakeCodex(directory) {
  const plan = { summary: "Start med en mobilskitse.", roles: ["designer", "copywriter"], nextAction: "Lav to retninger", question: null, decision: { level: "team", title: "Godkend skitsespor", recommendation: "Kør designer først.", tradeoff: "Langsommere kode.", urgency: "today" } };
  const script = join(directory, "fake-codex.mjs");
  await writeFile(script, `#!${process.execPath}
if (process.argv.includes("--version")) process.exit(0);
console.log("advarsel uden JSON");
console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: ${JSON.stringify(JSON.stringify(plan))} } }));
console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1 } }));
`, "utf8");
  await chmod(script, 0o755);
  return script;
}

test("managerens oplæg bliver til planlagte opgaver og erstatter et besvaret spørgsmål", async () => {
  const seed = createSeedState();
  const at = "2026-10-04T10:00:00.000Z";
  seed.tasks.unshift({ id: "task-old", projectId: "ai-office", role: "researcher", state: "planned", progress: 0, title: "Gammelt spor", description: "", acceptance: "", createdAt: at, updatedAt: at });
  seed.decisions.unshift({ id: "decision-question", projectId: "ai-office", status: "open", level: "team", urgency: "now", title: "Til hvem?", text: "Oplæg", recommendation: "Svar", tradeoff: "-", primary: "Svar manageren", secondary: "Bed om ny runde", roles: ["researcher"], planTaskIds: ["task-old"], createdAt: at, plan: { question: "Til hvem?" } });

  await withServer(async port => {
    assert.equal((await request(port, "/api/health")).body.managerAvailable, true);
    const reply = await request(port, "/api/manager", "POST", { message: "Til koncertgæster.", projectId: "ai-office", decisionId: "decision-question" });
    assert.equal(reply.status, 200);
    const office = reply.body.office;
    assert.equal(office.decisions.some(item => item.id === "decision-question"), false);
    assert.equal(office.decisions[0].title, "Godkend skitsespor");
    assert.equal(office.tasks.find(item => item.id === "task-old").state, "dropped");
    assert.deepEqual(office.decisions[0].planTaskIds.map(id => office.tasks.find(task => task.id === id).state), ["planned", "planned"]);
    assert.equal(office.projects.find(item => item.id === "ai-office").people.includes("copywriter"), true);
    assert.equal(office.agents.manager.availability, "ready");
  }, seed, fakeCodex);
});

test("en opgave går fra klar til i gang til afleveret med et artefakt", async () => {
  const seed = createSeedState();
  const at = "2026-10-04T10:00:00.000Z";
  seed.tasks.unshift({ id: "task-flow", projectId: "ai-office", role: "designer", state: "ready", progress: 0, title: "To UI-retninger", description: "", acceptance: "", createdAt: at, updatedAt: at });
  await withServer(async port => {
    const early = await request(port, "/api/tasks/task-flow/deliver", "POST", { title: "Uden indhold" });
    assert.equal(early.status, 400);

    const started = await request(port, "/api/tasks/task-flow/start", "POST", { executor: "Claude Code" });
    assert.equal(started.status, 200);
    assert.equal(started.body.task.state, "active");
    assert.equal(started.body.task.executor, "Claude Code");
    assert.equal(started.body.office.agents.designer.workload.active, 1);
    assert.equal((await request(port, "/api/tasks/task-flow/start", "POST", {})).status, 400);

    const delivered = await request(port, "/api/tasks/task-flow/deliver", "POST", { title: "Retning A og B", location: "https://github.com/eksempel/pr/1", check: "Set på mobil.", forMads: "Vælg mellem A og B." });
    assert.equal(delivered.status, 200);
    assert.equal(delivered.body.task.state, "done");
    assert.equal(delivered.body.item.type, "artifact");
    assert.equal(delivered.body.item.url, "https://github.com/eksempel/pr/1");
    assert.equal(delivered.body.office.decisions[0].deliveryTaskId, "task-flow");
    assert.equal(delivered.body.office.projects.find(item => item.id === "ai-office").doneCount >= 1, true);

    const sentBack = await request(port, `/api/decisions/${delivered.body.decision.id}/respond`, "POST", { choice: "secondary" });
    assert.equal(sentBack.status, 200);
    assert.equal(sentBack.body.office.tasks.find(item => item.id === "task-flow").state, "active");
    assert.equal(sentBack.body.office.libraryItems.some(item => item.id === delivered.body.item.id), true);
  }, seed);
});

test("en åben opgave kan fravælges, men en afleveret kan ikke", async () => {
  const seed = createSeedState();
  await withServer(async port => {
    const dropped = await request(port, "/api/tasks/task-review-command-center/drop", "POST", {});
    assert.equal(dropped.status, 200);
    assert.equal(dropped.body.task.state, "dropped");
    assert.equal((await request(port, "/api/tasks/task-command-center/drop", "POST", {})).status, 400);
  }, seed);
});

test("Mads kan tilføje, redigere og fjerne præferencer", () => withServer(async port => {
  assert.equal((await request(port, "/api/preferences", "POST", { label: "", value: "x" })).status, 400);
  const created = await request(port, "/api/preferences", "POST", { label: "Mobil først", value: "Jeg tjekker ind fra telefonen.", confidence: "antagelse" });
  assert.equal(created.status, 201);
  assert.equal(created.body.preference.confidence, "antagelse");
  const id = created.body.preference.id;
  const edited = await request(port, `/api/preferences/${id}`, "PATCH", { label: "Mobil først", value: "Telefonen er primær.", confidence: "bekræftet" });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.office.preferences.find(item => item.id === id).value, "Telefonen er primær.");
  const removed = await request(port, `/api/preferences/${id}`, "DELETE");
  assert.equal(removed.status, 200);
  assert.equal(removed.body.office.preferences.some(item => item.id === id), false);
  assert.equal((await request(port, `/api/preferences/${id}`, "DELETE")).status, 400);
}));

test("et projekt kan omdøbes og sættes på pause, og materiale kan fjernes", () => withServer(async port => {
  const patched = await request(port, "/api/projects/idea-bank", "PATCH", { name: "Idébank 2", description: "Ny tekst.", state: "Pause" });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.project.state, "Pause");
  assert.equal((await request(port, "/api/projects/idea-bank", "PATCH", { name: "" })).status, 400);
  const invalid = await request(port, "/api/projects/idea-bank", "PATCH", { name: "Idébank 2", state: "Slettet" });
  assert.equal(invalid.body.project.state, "Pause");

  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLdnQAAAABJRU5ErkJggg==";
  const uploaded = await request(port, "/api/attachments", "POST", { projectId: "ai-office", name: "ref.png", dataUrl: png });
  assert.equal(uploaded.status, 201);
  const removed = await request(port, `/api/library/${uploaded.body.item.id}`, "DELETE");
  assert.equal(removed.status, 200);
  assert.equal(removed.body.office.attachments.some(item => item.id === uploaded.body.attachment.id), false);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/attachments/${uploaded.body.attachment.id}`)).status, 404);
}));

test("managerens kontekst skelner mellem planlagt, i gang og afleveret arbejde", () => {
  const tasks = [
    { state: "active", role: "developer", title: "Byg flow", executor: "Claude Code" },
    { state: "done", role: "designer", title: "To retninger", artifactId: "ref-1" }
  ];
  const references = [{ id: "ref-1", type: "artifact", title: "Retning A og B", content: "Tjekket: set på mobil" }];
  const prompt = managerPrompt("Hvad nu?", { name: "Test", description: "" }, tasks, references, [], [], null);
  assert.match(prompt, /Byg flow · udføres af Claude Code/);
  assert.match(prompt, /To retninger → afleveret: Retning A og B/);
});
