import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function startTestServer(port, statePath) {
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(port), OFFICE_STATE_PATH: statePath }
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

    const task = await request(port, "/api/tasks", "POST", { projectId, role: "developer", title: "Byg første flow", description: "Et lille preview.", acceptance: "Kan gennemgås i browseren." });
    assert.equal(task.status, 201);
    assert.equal(task.body.task.state, "planned");

    const ready = await request(port, `/api/tasks/${task.body.task.id}/ready`, "POST", {});
    assert.equal(ready.status, 200);
    assert.equal(ready.body.task.state, "ready");

    const office = await request(port, "/api/bootstrap");
    assert.equal(office.body.office.projects[0].id, projectId);
    assert.equal(office.body.office.libraryItems.some(item => item.id === reference.body.item.id), true);
    assert.equal(office.body.office.tasks.find(item => item.id === task.body.task.id)?.state, "ready");
  } finally {
    if (server?.kill("SIGTERM")) await once(server, "exit");
    await rm(directory, { recursive: true, force: true });
  }
});
