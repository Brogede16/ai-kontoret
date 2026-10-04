import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

const now = () => new Date().toISOString();
const clone = value => JSON.parse(JSON.stringify(value));

function id(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function activity(actorId, text, projectId = null, kind = "status") {
  return { id: id("activity"), actorId, text, projectId, kind, at: now() };
}

export function createSeedState() {
  return {
    version: 1,
    updatedAt: now(),
    activeProjectId: "ai-office",
    agents: {
      manager: {
        id: "manager", initial: "M", face: "manager-face", name: "Manageren", role: "Producer & retning",
        availability: "ready", status: "Klar til at samle næste idé", task: { title: "Venter på din retning", description: "Omsætter din besked til en tydelig opgavepakke og samler de relevante roller.", progress: 0 },
        artifacts: [{ name: "Arbejdsaftale", state: "klar" }, { name: "Produktretning", state: "klar" }],
        message: "Jeg er klar. Giv mig et projekt, en idé eller feedback — så samler jeg et første arbejdsspor."
      },
      designer: {
        id: "designer", initial: "D", face: "designer-face", name: "Designeren", role: "Produkt & UI",
        availability: "ready", status: "Klar til næste brief", task: { title: "Afventer et designspor", description: "Laver UI-retninger og kodbare komponentforslag, når manageren har afgrænset opgaven.", progress: 0 },
        artifacts: [{ name: "UI-principper", state: "klar" }, { name: "Mobil-layout", state: "klar" }],
        message: "Jeg arbejder direkte mod et kodet preview, ikke kun en løs skitse."
      },
      researcher: {
        id: "researcher", initial: "R", face: "researcher-face", name: "Researcheren", role: "Indhold & indsigt",
        availability: "ready", status: "Klar til at undersøge", task: { title: "Afventer et spørgsmål", description: "Indsamler kilder, GitHub-eksempler og produktindsigt som konkrete noter til holdet.", progress: 0 },
        artifacts: [{ name: "Kildetjekliste", state: "klar" }, { name: "Research-format", state: "klar" }],
        message: "Jeg afleverer kilder og anbefalinger, så andre kan efterprøve det — ikke bare en påstand."
      },
      developer: {
        id: "developer", initial: "U", face: "developer-face", name: "Udvikleren", role: "Bygger & integrerer",
        availability: "active", status: "Bygger projektkommandocenter", task: { title: "Gør projekter og opgaver vedvarende", description: "Den aktuelle vertikale slice i AI-kontoret: lokal database, API'er og levende projektstatus.", progress: 62 },
        artifacts: [{ name: "Feature-branch", state: "aktiv" }, { name: "Server-API", state: "under bygning" }],
        message: "Jeg arbejder i en separat branch. Det bliver først klar til review, når backend og UI hænger sammen."
      },
      reviewer: {
        id: "reviewer", initial: "Q", face: "reviewer-face", name: "Revieweren", role: "Kvalitet & modspil",
        availability: "waiting", status: "Venter på en aflevering", task: { title: "Klar til næste review", description: "Tjekker funktion, sprog, mobil-layout og om afleveringen matcher briefen.", progress: 0 },
        artifacts: [{ name: "Review-tjekliste", state: "klar" }, { name: "Test-scenarier", state: "klar" }],
        message: "Jeg går først i gang, når der er noget konkret at teste eller sammenligne med briefen."
      }
    },
    projects: [
      {
        id: "ai-office", name: "AI-kontoret", state: "Bygger", color: "#f36d4c",
        description: "Et levende, personligt AI-studio med manager, medarbejdere, projekter og beslutninger.",
        people: ["manager", "designer", "researcher", "developer", "reviewer"], createdAt: now(), updatedAt: now()
      },
      {
        id: "idea-bank", name: "Idébanken", state: "Udforsker", color: "#6fc8e7",
        description: "Roligt sted til idéer, der skal undersøges, før de bliver til rigtige projekter.",
        people: ["manager", "researcher"], createdAt: now(), updatedAt: now()
      }
    ],
    tasks: [
      {
        id: "task-command-center", projectId: "ai-office", role: "developer", state: "active", progress: 62,
        title: "Gør projekter og opgaver vedvarende", description: "Gem projektstatus, opgaver, beslutninger og aktivitet lokalt og vis dem levende i kontoret.",
        acceptance: "Data overlever genstart; UI synkroniserer med API'et; ingen nye eksterne rettigheder.", createdAt: now(), updatedAt: now()
      },
      {
        id: "task-review-command-center", projectId: "ai-office", role: "reviewer", state: "planned", progress: 0,
        title: "Review projektkommandocenter", description: "Tjek API-kontrakt, lokal sikkerhed, mobillayout og at ingen status bliver opdigtet.",
        acceptance: "Syntakstjek er grønt og review kan forklare de vigtige ændringer.", createdAt: now(), updatedAt: now()
      }
    ],
    decisions: [],
    libraryItems: [
      {
        id: "reference-office-direction", projectId: "ai-office", type: "brief", title: "Produktretning for AI-kontoret",
        content: "Et kreativt, levende AI-studio med manager, medarbejdere, konkrete artefakter og Mads som beslutningstager. Arbejdsstatus skal være reel — ikke skjulte tanker.",
        createdAt: now(), updatedAt: now()
      }
    ],
    preferences: [
      { id: "pref-direct-code", label: "Direkte kode", value: "Mads foretrækker, at UI bliver bygget og vist i kode fremfor at Figma er den eneste sandhed.", confidence: "bekræftet", source: "Samtale om AI-kontoret" },
      { id: "pref-challenge", label: "Må gerne udfordre", value: "Tidligere fravalg er præferencer med kontekst, ikke forbud. Holdet må anbefale en undtagelse og forklare hvorfor.", confidence: "bekræftet", source: "Samtale om AI-kontoret" }
    ],
    activity: [
      activity("developer", "Bygger den vedvarende projekt- og opgavekerne i en separat feature-branch.", "ai-office", "build"),
      activity("manager", "Kontoret er klar til at samle næste idé til et arbejdsspor.", "ai-office", "status")
    ]
  };
}

export function addActivity(state, actorId, text, projectId = null, kind = "status") {
  state.activity.unshift(activity(actorId, text, projectId, kind));
  state.activity = state.activity.slice(0, 60);
}

export function tasksForProject(state, projectId) {
  return state.tasks.filter(task => task.projectId === projectId);
}

export function projectSummary(state, project) {
  const tasks = tasksForProject(state, project.id);
  const active = tasks.filter(task => task.state === "active").length;
  const ready = tasks.filter(task => task.state === "ready").length;
  const done = tasks.filter(task => task.state === "done").length;
  const progress = tasks.length ? Math.round(tasks.reduce((total, task) => total + task.progress, 0) / tasks.length) : 0;
  return { ...project, taskCount: tasks.length, activeCount: active, readyCount: ready, doneCount: done, progress };
}

export function createOfficeStore(filePath) {
  let state;
  let pending = Promise.resolve();

  async function persist(nextState) {
    await mkdir(dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(nextState, null, 2), "utf8");
    await rename(tempPath, filePath);
  }

  async function load() {
    try {
      state = JSON.parse(await readFile(filePath, "utf8"));
      if (!Array.isArray(state.libraryItems)) state.libraryItems = [];
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      state = createSeedState();
      await persist(state);
    }
    return clone(state);
  }

  async function snapshot() {
    if (!state) await load();
    return clone(state);
  }

  function mutate(mutator) {
    const operation = pending.then(async () => {
      if (!state) await load();
      const draft = clone(state);
      const result = await mutator(draft);
      draft.updatedAt = now();
      state = draft;
      await persist(state);
      return { state: clone(state), result };
    });
    pending = operation.catch(() => undefined);
    return operation;
  }

  return { load, snapshot, mutate };
}
