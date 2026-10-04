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
    version: 5,
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
        availability: "ready", status: "Har afleveret projektkommandocenteret", task: { title: "Klar til review", description: "Projekt-, opgave- og biblioteksflowet er samlet lokalt med tests. Næste skridt er et konkret review eller en ny godkendt worker-forbindelse.", progress: 100 },
        artifacts: [{ name: "Feature-branch", state: "klar til review" }, { name: "Lokal API-test", state: "grøn" }],
        message: "Projektkommandocenteret er afleveret i en feature-branch. Jeg starter ikke en ny opgave, før manageren eller Mads har givet et tydeligt spor."
      },
      reviewer: {
        id: "reviewer", initial: "Q", face: "reviewer-face", name: "Revieweren", role: "Kvalitet & modspil",
        availability: "waiting", status: "Venter på en aflevering", task: { title: "Klar til næste review", description: "Tjekker funktion, sprog, mobil-layout og om afleveringen matcher briefen.", progress: 0 },
        artifacts: [{ name: "Review-tjekliste", state: "klar" }, { name: "Test-scenarier", state: "klar" }],
        message: "Jeg går først i gang, når der er noget konkret at teste eller sammenligne med briefen."
      },
      game_designer: {
        id: "game_designer", initial: "S", face: "game-designer-face", name: "Spildesigneren", role: "Gameplay & systemer",
        availability: "bench", status: "I talentbanken · ikke forbundet", task: { title: "Klar til et spilbrief", description: "Definerer core loop, progression, regler og en spilbar første afgrænsning, når et projekt har brug for det.", progress: 0 },
        artifacts: [{ name: "Gameplay-loop", state: "kompetencepakke" }, { name: "Systembrief", state: "kompetencepakke" }],
        competencies: ["Core loop", "Progression", "Spilsystemer", "Spilbar vertikal slice"],
        handoff: "Afleverer et systembrief og testbare regler til designeren og udvikleren.",
        message: "Jeg bliver kun sat på, når spilstruktur eller gameplay kan gøre afleveringen væsentligt bedre. Jeg er en rolleprofil, ikke en aktiv model endnu."
      },
      graphic_designer: {
        id: "graphic_designer", initial: "G", face: "graphic-designer-face", name: "Grafikeren", role: "Visuel identitet & assets",
        availability: "bench", status: "I talentbanken · ikke forbundet", task: { title: "Klar til visuelt brief", description: "Afklarer art direction, asset-briefs og visuelle referencer til direkte kode eller senere billedværktøjer.", progress: 0 },
        artifacts: [{ name: "Art-direction", state: "kompetencepakke" }, { name: "Asset-brief", state: "kompetencepakke" }],
        competencies: ["Art direction", "UI-illustration", "Asset-briefs", "Visuelle referencer"],
        handoff: "Afleverer referencer, et afgrænset asset-brief og kriterier til designeren eller en senere billed-worker.",
        message: "Jeg kan styrke den visuelle retning, men jeg må ikke udgive, købe assets eller foregive, at et billede er genereret, før en godkendt worker faktisk har leveret det."
      },
      copywriter: {
        id: "copywriter", initial: "T", face: "copywriter-face", name: "Tekstforfatteren", role: "UX-tekst & fortælling",
        availability: "bench", status: "I talentbanken · ikke forbundet", task: { title: "Klar til tekstbrief", description: "Skriver produkttekst, mikrocopy og tone-of-voice med klare varianter, når det konkrete projekt har brug for det.", progress: 0 },
        artifacts: [{ name: "Tone-of-voice", state: "kompetencepakke" }, { name: "UX-tekstvarianter", state: "kompetencepakke" }],
        competencies: ["UX-mikrocopy", "Produktfortælling", "Tone-of-voice", "Tekstvarianter"],
        handoff: "Afleverer tekstvarianter med formål, målgruppe og anbefaling til designer eller udvikler.",
        message: "Jeg er her ikke for at fylde skærmen med ord. Jeg bliver hentet ind, når tekst er en del af brugeroplevelsen eller projektets retning."
      },
      marketer: {
        id: "marketer", initial: "K", face: "marketer-face", name: "Marketingpersonen", role: "Positionering & lancering",
        availability: "bench", status: "I talentbanken · ikke forbundet", task: { title: "Klar til positioneringsbrief", description: "Afklarer målgruppe, værditilbud, launch-hypoteser og hvad der bør testes, før der kommunikeres offentligt.", progress: 0 },
        artifacts: [{ name: "Positioneringsnotat", state: "kompetencepakke" }, { name: "Launch-hypoteser", state: "kompetencepakke" }],
        competencies: ["Målgruppe", "Positionering", "Værditilbud", "Launch-hypoteser"],
        handoff: "Afleverer en målgruppe- og positioneringsnote. Udfører aldrig køb, annoncering eller publicering.",
        message: "Jeg kan skærpe, hvem produktet er til, og hvordan det forklares. Jeg må aldrig selv udgive, købe annoncer eller starte en kampagne."
      }
    },
    connectors: {
      codex: {
        id: "codex", name: "Codex", provider: "OpenAI · ChatGPT", state: "configured", mode: "Lokal Codex-manager",
        status: "Konfigureret lokalt · read-only", scope: "Kan kun formulere managerens oplæg gennem den eksisterende lokale Codex-login. Ingen fil-, GitHub-, Render-, Xcode- eller deployadgang.",
        roles: ["Manager", "senere kode/review"], note: "Ingen API-nøgle eller separat API-regning er lagt ind i kontoret."
      },
      claude_code: {
        id: "claude_code", name: "Claude Code", provider: "Anthropic", state: "unconfigured", mode: "Lokal CLI-worker",
        status: "Ikke forbundet", scope: "Ingen login, kommando eller rettighed er konfigureret fra kontoret.",
        roles: ["Research", "design", "kode", "review"], note: "Kan senere tilkobles med en eksplicit lokal login- og tilladelsesprofil."
      },
      gemini_cli: {
        id: "gemini_cli", name: "Gemini CLI", provider: "Google", state: "unconfigured", mode: "Lokal CLI-worker",
        status: "Ikke forbundet", scope: "Ingen login, kommando eller rettighed er konfigureret fra kontoret.",
        roles: ["Research", "indhold", "modspil"], note: "Den konkrete Google-plan og CLI-adgang skal først valideres lokalt, før den kan sættes på arbejde."
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
        id: "task-command-center", projectId: "ai-office", role: "developer", state: "done", progress: 100,
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
    conversations: [
      {
        id: "conversation-welcome", projectId: "ai-office", role: "manager", kind: "note",
        text: "Jeg gemmer projektets samtale, oplæg og beslutninger her. Det er en læsbar historik — ikke en skjult model-log.",
        createdAt: now()
      }
    ],
    presentations: [],
    attachments: [],
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
      activity("developer", "Afleverede den vedvarende projekt- og opgavekerne i en separat feature-branch.", "ai-office", "build"),
      activity("manager", "Kontoret er klar til at samle næste idé til et arbejdsspor.", "ai-office", "status")
    ]
  };
}

export function addActivity(state, actorId, text, projectId = null, kind = "status") {
  state.activity.unshift(activity(actorId, text, projectId, kind));
  state.activity = state.activity.slice(0, 60);
}

export function addConversation(state, projectId, role, text, kind = "message", relatedId = null) {
  state.conversations.unshift({ id: id("conversation"), projectId, role, text, kind, relatedId, createdAt: now() });
  state.conversations = state.conversations.slice(0, 240);
}

export function tasksForProject(state, projectId) {
  return state.tasks.filter(task => task.projectId === projectId);
}

export function projectSummary(state, project) {
  // Fravalgte opgaver er historik, ikke arbejde. De tæller hverken i antal eller fremdrift.
  const tasks = tasksForProject(state, project.id).filter(task => task.state !== "dropped");
  const active = tasks.filter(task => task.state === "active").length;
  const ready = tasks.filter(task => task.state === "ready").length;
  const done = tasks.filter(task => task.state === "done").length;
  // Fremdrift er andelen af afleverede opgaver. Procenter, som ingen har målt, bliver ikke gennemsnitsberegnet.
  const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
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
      if (!state.agents || typeof state.agents !== "object") state.agents = {};
      const seedAgents = createSeedState().agents;
      for (const [agentId, profile] of Object.entries(seedAgents)) {
        if (!state.agents[agentId]) state.agents[agentId] = profile;
      }
      if (!state.connectors || typeof state.connectors !== "object") state.connectors = {};
      const seedConnectors = createSeedState().connectors;
      for (const [connectorId, profile] of Object.entries(seedConnectors)) {
        if (!state.connectors[connectorId]) state.connectors[connectorId] = profile;
      }
      if (!Array.isArray(state.libraryItems)) state.libraryItems = [];
      if (!Array.isArray(state.conversations)) state.conversations = [];
      if (!Array.isArray(state.presentations)) state.presentations = [];
      if (!Array.isArray(state.attachments)) state.attachments = [];
      state.version = Math.max(Number(state.version) || 1, 5);
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
