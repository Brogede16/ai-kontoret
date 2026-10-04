import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createOfficeStore, projectSummary } from "../store.mjs";

test("kontorets lokale tilstand overlever en genstart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ai-kontoret-store-"));
  const statePath = join(directory, "office-state.json");

  try {
    const store = createOfficeStore(statePath);
    const seeded = await store.load();
    assert.equal(seeded.activeProjectId, "ai-office");
    assert.equal(seeded.agents.graphic_designer.availability, "bench");
    assert.equal(seeded.agents.game_designer.competencies.includes("Core loop"), true);
    assert.equal(seeded.connectors.codex.state, "configured");
    assert.equal(seeded.connectors.claude_code.state, "unconfigured");

    await store.mutate(state => {
      state.projects.unshift({
        id: "test-project", name: "Testprojekt", description: "Et vedvarende projekt.", state: "Udforsker", color: "#fff", people: ["manager"], createdAt: "2026-10-04T10:00:00.000Z", updatedAt: "2026-10-04T10:00:00.000Z"
      });
      state.tasks.unshift({
        id: "test-task", projectId: "test-project", role: "researcher", state: "ready", progress: 40, title: "Undersøg retningen", description: "", acceptance: "Tre kilder", createdAt: "2026-10-04T10:00:00.000Z", updatedAt: "2026-10-04T10:00:00.000Z"
      });
      state.libraryItems.unshift({ id: "test-reference", projectId: "test-project", type: "brief", title: "Testbrief", content: "Delt kontekst.", createdAt: "2026-10-04T10:00:00.000Z", updatedAt: "2026-10-04T10:00:00.000Z" });
      state.conversations.unshift({ id: "test-conversation", projectId: "test-project", role: "mads", kind: "message", text: "Hvad er næste trin?", createdAt: "2026-10-04T10:00:00.000Z" });
      state.presentations.unshift({ id: "test-presentation", projectId: "test-project", type: "design", title: "Testretninger", directionA: "A", directionB: "B", criteria: "Tydelighed", recommendation: "A", level: "executive", createdAt: "2026-10-04T10:00:00.000Z" });
      state.activeProjectId = "test-project";
    });

    const restartedStore = createOfficeStore(statePath);
    const restarted = await restartedStore.load();
    assert.equal(restarted.activeProjectId, "test-project");
    assert.equal(restarted.tasks.find(task => task.id === "test-task")?.acceptance, "Tre kilder");
    assert.equal(restarted.libraryItems.find(item => item.id === "test-reference")?.content, "Delt kontekst.");
    assert.equal(restarted.conversations.find(item => item.id === "test-conversation")?.role, "mads");
    assert.equal(restarted.presentations.find(item => item.id === "test-presentation")?.level, "executive");
    assert.equal(JSON.parse(await readFile(statePath, "utf8")).projects[0].name, "Testprojekt");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("projektoversigten tæller status og gennemsnitlig fremdrift", () => {
  const state = {
    tasks: [
      { projectId: "project-a", state: "active", progress: 60 },
      { projectId: "project-a", state: "ready", progress: 30 },
      { projectId: "project-a", state: "done", progress: 100 },
      { projectId: "project-b", state: "active", progress: 90 }
    ]
  };
  const summary = projectSummary(state, { id: "project-a", name: "A" });
  assert.deepEqual(
    { taskCount: summary.taskCount, activeCount: summary.activeCount, readyCount: summary.readyCount, doneCount: summary.doneCount, progress: summary.progress },
    { taskCount: 3, activeCount: 1, readyCount: 1, doneCount: 1, progress: 63 }
  );
});
