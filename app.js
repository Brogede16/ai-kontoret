let office = null;
let managerWorkerOnline = false;
let selectedProjectId = null;
let pendingDecisionId = null;

const drawer = document.querySelector("#detail-drawer");
const drawerContent = document.querySelector("#drawer-content");
const scrim = document.querySelector("#scrim");
const toast = document.querySelector("#toast");
const managerInput = document.querySelector("#manager-input");
let toastTimer;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Noget gik galt. Prøv igen.");
  return result;
}

function currentProject() {
  return office?.projects.find(project => project.id === selectedProjectId) || office?.projects.find(project => project.id === office.activeProjectId) || null;
}

function getAgent(id) { return office?.agents?.[id]; }

function face(agent, compact = false) {
  if (!agent) return "";
  return `<span class="agent-face ${escapeHtml(agent.face)} ${compact ? "compact-face" : ""}">${escapeHtml(agent.initial)}</span>`;
}

function availabilityLabel(agent) {
  return ({ active: "Arbejder", ready: "Klar", waiting: "Venter", blocked: "Blokeret" })[agent.availability] || "Klar";
}

function formatTime(iso) {
  if (!iso) return "nu";
  return new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function render() {
  if (!office) return;
  selectedProjectId = selectedProjectId || office.activeProjectId;
  if (!office.projects.some(project => project.id === selectedProjectId)) selectedProjectId = office.activeProjectId;
  renderOffice();
  renderProjects();
  renderDecisions();
}

function renderOffice() {
  const project = currentProject();
  const active = Object.values(office.agents).filter(agent => agent.availability === "active").length;
  const ready = Object.values(office.agents).filter(agent => agent.availability === "ready").length;
  const todayTitle = document.querySelector(".today-card strong");
  const todaySubtitle = document.querySelector(".today-card span");
  const todayProgress = document.querySelector(".tiny-progress i");
  const navCount = document.querySelector("[data-nav='projects'] b");
  const footer = document.querySelector(".office-footer > span");

  todayTitle.textContent = project?.name || "Ingen aktiv opgave";
  todaySubtitle.textContent = project ? `${project.activeCount} aktiv · ${project.readyCount} klar` : "Vælg et projekt";
  todayProgress.style.width = `${project?.progress || 0}%`;
  navCount.textContent = office.projects.length;
  footer.innerHTML = `<i class="status-dot"></i> ${active} arbejder · ${ready} klar`;
  document.querySelector(".stage-header .eyebrow").textContent = managerWorkerOnline ? "Stueetage · synkroniseret" : "Stueetage · lokal prototype";

  Object.values(office.agents).forEach(agent => {
    const desk = document.querySelector(`[data-agent="${agent.id}"]`);
    if (!desk) return;
    desk.querySelector("strong").textContent = agent.name;
    desk.querySelector("small").textContent = agent.task?.title || agent.status;
    const presence = desk.querySelector(".presence");
    presence.classList.toggle("waiting", agent.availability === "waiting" || agent.availability === "blocked");
    presence.innerHTML = `<i></i> ${availabilityLabel(agent)}`;
  });

  const managerStatus = document.querySelector(".office-status span");
  managerStatus.textContent = managerWorkerOnline ? (office.agents.manager.availability === "active" ? "Manageren arbejder" : "Manageren er online") : "Lokalt kontor";
}

function renderProjects() {
  const grid = document.querySelector("#project-grid");
  grid.innerHTML = office.projects.map(project => `
    <button class="project-card ${project.id === selectedProjectId ? "active" : ""}" data-project="${escapeHtml(project.id)}">
      <div class="project-top"><span class="project-dot" style="background:${escapeHtml(project.color)}"></span><span class="project-state">${escapeHtml(project.state)}</span></div>
      <h3>${escapeHtml(project.name)}</h3><p>${escapeHtml(project.description)}</p>
      <div class="project-meta"><span class="project-avatars">${project.people.map(id => face(getAgent(id), true)).join("")}</span><span>${project.taskCount ? `${project.progress}% fremdrift` : "Klar til brief"}</span></div>
    </button>`).join("");
}

function renderDecisions() {
  const list = document.querySelector("#decision-list");
  const decisions = office.decisions || [];
  list.innerHTML = decisions.length ? decisions.map(item => `
    <article class="decision-card" data-decision="${escapeHtml(item.id)}">
      <span class="decision-type">${escapeHtml(item.type)}</span>
      <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p>
      <div class="decision-actions"><button data-action="primary" data-id="${escapeHtml(item.id)}">${escapeHtml(item.primary)}</button><button data-action="secondary" data-id="${escapeHtml(item.id)}">${escapeHtml(item.secondary)}</button></div>
    </article>`).join("") : `<div class="empty-state">Alt er afklaret lige nu. Manageren kan fortsætte med det, der er klart.</div>`;
  document.querySelector("#inbox-count").textContent = decisions.length;
  document.querySelector("#panel-count").textContent = decisions.length;
}

function openDrawer(content) {
  drawerContent.innerHTML = content;
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  scrim.classList.add("open");
}

function closeDrawer() {
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  scrim.classList.remove("open");
}

function openAgent(id) {
  const agent = getAgent(id);
  if (!agent) return;
  openDrawer(`
    <div class="drawer-agent-head">
      ${face(agent)}
      <div><p class="eyebrow">${escapeHtml(agent.role)}</p><h2>${escapeHtml(agent.name)}</h2><p>${escapeHtml(agent.status)}</p></div>
    </div>
    <section class="drawer-section">
      <p class="eyebrow">Aktuel opgave</p>
      <div class="task-card"><strong>${escapeHtml(agent.task?.title || "Klar til næste opgave")}</strong><p>${escapeHtml(agent.task?.description || "")}</p><div class="task-progress"><i style="width:${Number(agent.task?.progress || 0)}%"></i></div></div>
    </section>
    <section class="drawer-section"><p class="eyebrow">Arbejdsbord</p><h3>Seneste materiale</h3><ul class="artifact-list">${agent.artifacts.map(artifact => `<li><span>${escapeHtml(artifact.name)}</span><small>${escapeHtml(artifact.state)}</small></li>`).join("")}</ul></section>
    <section class="drawer-section"><p class="eyebrow">Besked til dig</p><div class="drawer-message"><strong>${escapeHtml(agent.name)} siger</strong>${escapeHtml(agent.message)}</div></section>
    <button class="drawer-action" data-compose="${escapeHtml(id)}">Skriv til manageren om ${escapeHtml(agent.name.toLowerCase())} <span>→</span></button>`);
}

function stateLabel(task) {
  return ({ active: "Arbejder", ready: "Klar", planned: "Planlagt", done: "Færdig", blocked: "Blokeret" })[task.state] || "Planlagt";
}

function openProject(id) {
  const project = office.projects.find(item => item.id === id);
  if (!project) return;
  const tasks = office.tasks.filter(task => task.projectId === id);
  const references = (office.libraryItems || []).filter(item => item.projectId === id);
  openDrawer(`
    <div class="project-drawer-head"><span class="project-dot" style="background:${escapeHtml(project.color)}"></span><p class="eyebrow">${escapeHtml(project.state)}</p><h2>${escapeHtml(project.name)}</h2><p>${escapeHtml(project.description)}</p></div>
    <section class="drawer-section"><p class="eyebrow">Fremdrift</p><div class="task-card"><strong>${project.progress}% samlet</strong><p>${project.activeCount} arbejder nu · ${project.readyCount} opgaver er klar · ${project.taskCount} i alt</p><div class="task-progress"><i style="width:${project.progress}%"></i></div></div></section>
    <section class="drawer-section"><p class="eyebrow">Fælles kontekst</p><div class="library-summary"><strong>${references.length} ${references.length === 1 ? "materiale" : "materialer"}</strong><p>Noter, briefs og links, der følger projektet.</p><button class="task-ready" data-open-library="${escapeHtml(project.id)}">Åbn bibliotek</button></div></section>
    <section class="drawer-section"><p class="eyebrow">Arbejdskø</p><h3>Opgaver</h3><ul class="task-list">${tasks.length ? tasks.map(task => `<li><span class="task-state ${escapeHtml(task.state)}">${escapeHtml(stateLabel(task))}</span><strong>${escapeHtml(task.title)}</strong><p>${escapeHtml(task.description || "Ingen ekstra beskrivelse.")}</p>${task.acceptance ? `<p class="task-acceptance"><b>Tjek:</b> ${escapeHtml(task.acceptance)}</p>` : ""}<small>${escapeHtml(getAgent(task.role)?.name || task.role)} · ${task.progress}%</small>${task.state === "planned" ? `<button class="task-ready" data-ready-task="${escapeHtml(task.id)}">Klargør til worker</button>` : ""}</li>`).join("") : "<li><p>Der er ingen opgaver endnu. Skriv til manageren for at lave det første spor.</p></li>"}</ul></section>
    <div class="drawer-actions"><button class="drawer-secondary" data-new-task="${escapeHtml(project.id)}">+ Ny opgave</button><button class="drawer-action" data-focus-project="${escapeHtml(project.id)}">Gør til dagens fokus <span>→</span></button></div>`);
}

function referenceTypeLabel(type) {
  return ({ brief: "Brief", note: "Note", link: "Link" })[type] || "Materiale";
}

function openLibrary(projectId = selectedProjectId) {
  const project = office.projects.find(item => item.id === projectId);
  if (!project) return;
  const items = (office.libraryItems || []).filter(item => item.projectId === project.id);
  openDrawer(`<div class="drawer-agent-head"><span class="activity-mark">▣</span><div><p class="eyebrow">${escapeHtml(project.name)}</p><h2>Fælles bibliotek</h2><p>Den kontekst, holdet faktisk kan se i dette projekt.</p></div></div><section class="drawer-section"><p class="eyebrow">Projektmateriale</p><ul class="task-list library-list">${items.length ? items.map(item => `<li><span class="task-state ${escapeHtml(item.type)}">${escapeHtml(referenceTypeLabel(item.type))}</span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.content)}</p><small>Gemt ${formatTime(item.createdAt)}</small></li>`).join("") : "<li><p>Ingen fælles kontekst endnu. Gem et brief, en note eller et link til manageren.</p></li>"}</ul></section><div class="drawer-actions"><button class="drawer-action" data-new-reference="${escapeHtml(project.id)}">+ Gem materiale <span>→</span></button></div>`);
}

function openActivity() {
  const rows = office.activity.map(item => {
    const agent = getAgent(item.actorId);
    return `<li>${face(agent, true)}<div><strong>${escapeHtml(agent?.name || "Kontoret")}</strong><p>${escapeHtml(item.text)}</p><small>${formatTime(item.at)}</small></div></li>`;
  }).join("");
  openDrawer(`<div class="drawer-agent-head"><span class="activity-mark">◷</span><div><p class="eyebrow">Revision af rigtige hændelser</p><h2>Dagens aktivitet</h2><p>Ingen skjulte tanker. Kun handlinger, status og afleveringer.</p></div></div><section class="drawer-section"><ul class="activity-list">${rows}</ul></section>`);
}

function openProfile() {
  const preferences = office.preferences.map(pref => `<li><span>${escapeHtml(pref.label)}</span><p>${escapeHtml(pref.value)}</p><small>${escapeHtml(pref.confidence)} · ${escapeHtml(pref.source)}</small></li>`).join("");
  openDrawer(`<div class="drawer-agent-head"><span class="avatar large-avatar">M</span><div><p class="eyebrow">Redigerbar hukommelse</p><h2>Mads-profilen</h2><p>Præferencer er signaler med kilde, ikke automatiske forbud.</p></div></div><section class="drawer-section"><p class="eyebrow">Kendte præferencer</p><ul class="task-list preference-list">${preferences}</ul></section><div class="drawer-message"><strong>Sådan bruges det</strong>Manageren må gerne udfordre en præference, når den nye situation er anderledes — men skal vise dig hvorfor.</div>`);
}

async function askManager(message) {
  if (!managerWorkerOnline) return showToast("Manageren er offline. Start den lokale server og prøv igen.");
  const managerDesk = document.querySelector("[data-agent='manager'] small");
  managerDesk.textContent = "Tænker over din idé";
  showToast("Manageren tænker med Codex…");
  try {
    const result = await api("/api/manager", { method: "POST", body: JSON.stringify({ message, projectId: selectedProjectId, decisionId: pendingDecisionId }) });
    office = result.office;
    pendingDecisionId = null;
    render();
    showToast("Manageren har lagt et oplæg i din indbakke.");
  } catch (error) {
    showToast(error.message);
  }
}

async function respondToDecision(id, choice) {
  const decision = office.decisions.find(item => item.id === id);
  if (!decision) return;
  if (choice === "primary" && decision.plan?.question) {
    pendingDecisionId = id;
    managerInput.focus();
    managerInput.placeholder = decision.plan.question;
    showToast("Svar manageren i chatfeltet — den samler dit svar med den eksisterende plan.");
    return;
  }
  try {
    const result = await api(`/api/decisions/${encodeURIComponent(id)}/respond`, { method: "POST", body: JSON.stringify({ choice }) });
    office = result.office;
    render();
    showToast(choice === "primary" ? "Manageren har klargjort holdets næste opgaver." : "Manageren forbereder en ny runde.");
  } catch (error) { showToast(error.message); }
}

async function activateProject(id) {
  try {
    const result = await api(`/api/projects/${encodeURIComponent(id)}/activate`, { method: "POST", body: "{}" });
    office = result.office;
    selectedProjectId = id;
    render();
    closeDrawer();
    showToast("Manageren har flyttet dagens fokus.");
  } catch (error) { showToast(error.message); }
}

async function createProject(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.elements.name.value.trim();
  const description = form.elements.description.value.trim();
  try {
    const result = await api("/api/projects", { method: "POST", body: JSON.stringify({ name, description }) });
    office = result.office;
    selectedProjectId = result.project.id;
    render();
    document.querySelector("#project-dialog").close();
    form.reset();
    showToast("Nyt projekt oprettet. Giv manageren det første spor, når du er klar.");
  } catch (error) { showToast(error.message); }
}

function openTaskDialog(projectId) {
  const form = document.querySelector("#task-form");
  form.reset();
  form.elements.projectId.value = projectId;
  document.querySelector("#task-dialog").showModal();
}

function openLibraryDialog(projectId) {
  const form = document.querySelector("#library-form");
  form.reset();
  form.elements.projectId.value = projectId;
  document.querySelector("#library-dialog").showModal();
}

async function createLibraryItem(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const projectId = form.elements.projectId.value;
  try {
    const result = await api("/api/library", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    office = result.office;
    selectedProjectId = projectId;
    render();
    document.querySelector("#library-dialog").close();
    openLibrary(projectId);
    showToast("Materialet er gemt. Links bliver ikke hentet automatisk.");
  } catch (error) { showToast(error.message); }
}

async function createTask(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const projectId = form.elements.projectId.value;
  const payload = Object.fromEntries(new FormData(form));
  try {
    const result = await api("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
    office = result.office;
    selectedProjectId = projectId;
    render();
    document.querySelector("#task-dialog").close();
    openProject(projectId);
    showToast("Opgaven er gemt som planlagt. Den har ikke startet en model.");
  } catch (error) { showToast(error.message); }
}

async function readyTask(id) {
  try {
    const result = await api(`/api/tasks/${encodeURIComponent(id)}/ready`, { method: "POST", body: "{}" });
    office = result.office;
    render();
    openProject(selectedProjectId);
    showToast("Opgaven er klar. Den venter stadig på en bevidst koblet worker.");
  } catch (error) { showToast(error.message); }
}

async function startMeeting() {
  try {
    const result = await api("/api/meetings", { method: "POST", body: JSON.stringify({ projectId: selectedProjectId }) });
    office = result.office;
    render();
    document.querySelector("#meeting-dialog").close();
    showToast("Mødebehovet står nu i den fælles aktivitet. Ingen model er startet.");
  } catch (error) { showToast(error.message); }
}

function subscribe() {
  const stream = new EventSource("/api/events");
  stream.addEventListener("office-state", event => {
    try { office = JSON.parse(event.data); render(); } catch { /* Ignore a malformed live event. */ }
  });
}

async function initialise() {
  try {
    const [health, bootstrap] = await Promise.all([api("/api/health"), api("/api/bootstrap")]);
    managerWorkerOnline = Boolean(health.ok);
    office = bootstrap.office;
    selectedProjectId = office.activeProjectId;
    render();
    subscribe();
  } catch (error) {
    showToast("Kontoret kan ikke nå sin lokale server. Start `node server.mjs` og genindlæs.");
  }
}

document.querySelectorAll("[data-agent]").forEach(button => button.addEventListener("click", () => openAgent(button.dataset.agent)));
document.querySelector("#drawer-close").addEventListener("click", closeDrawer);
scrim.addEventListener("click", closeDrawer);

document.querySelector("#manager-form").addEventListener("submit", event => {
  event.preventDefault();
  const message = managerInput.value.trim();
  if (!message) return;
  managerInput.value = "";
  askManager(message);
});

document.querySelector("#decision-list").addEventListener("click", event => {
  const button = event.target.closest("button[data-id]");
  if (button) respondToDecision(button.dataset.id, button.dataset.action);
});

document.querySelector("#project-grid").addEventListener("click", event => {
  const project = event.target.closest(".project-card");
  if (!project) return;
  selectedProjectId = project.dataset.project;
  render();
  openProject(selectedProjectId);
});

drawer.addEventListener("click", event => {
  const compose = event.target.closest("[data-compose]");
  const focus = event.target.closest("[data-focus-project]");
  const newTask = event.target.closest("[data-new-task]");
  const ready = event.target.closest("[data-ready-task]");
  const library = event.target.closest("[data-open-library]");
  const newReference = event.target.closest("[data-new-reference]");
  if (compose) { closeDrawer(); managerInput.focus(); managerInput.placeholder = `Hvad vil du bede manageren om omkring ${getAgent(compose.dataset.compose)?.name || "denne medarbejder"}?`; }
  if (focus) activateProject(focus.dataset.focusProject);
  if (newTask) openTaskDialog(newTask.dataset.newTask);
  if (ready) readyTask(ready.dataset.readyTask);
  if (library) openLibrary(library.dataset.openLibrary);
  if (newReference) openLibraryDialog(newReference.dataset.newReference);
});

const meetingDialog = document.querySelector("#meeting-dialog");
document.querySelector("#meeting-button").addEventListener("click", () => meetingDialog.showModal());
document.querySelector("#table-button").addEventListener("click", () => meetingDialog.showModal());
document.querySelector("#dialog-close").addEventListener("click", () => meetingDialog.close());
document.querySelector("#start-meeting").addEventListener("click", startMeeting);

document.querySelector("#focus-button").addEventListener("click", event => {
  const enabled = event.currentTarget.classList.toggle("is-focused");
  event.currentTarget.textContent = enabled ? "✓ Fokus i gang" : "✦ Fokus-tilstand";
  showToast(enabled ? "Manageren holder afbrydelser på et minimum den næste time." : "Fokus-tilstand er slået fra.");
});
document.querySelector("#attach-button").addEventListener("click", () => showToast("Filer kommer i næste slice. Manageren må ikke foregive, at den har set en vedhæftning endnu."));
document.querySelector("#view-activity").addEventListener("click", openActivity);
document.querySelector("#open-inbox").addEventListener("click", () => {
  if (window.matchMedia("(max-width: 1080px)").matches) return openInboxDrawer();
  document.querySelector(".decision-panel").scrollIntoView({ behavior: "smooth", block: "center" });
});
document.querySelector("#see-all").addEventListener("click", openInboxDrawer);
document.querySelector("#new-project").addEventListener("click", () => document.querySelector("#project-dialog").showModal());
document.querySelector("#project-dialog-close").addEventListener("click", () => document.querySelector("#project-dialog").close());
document.querySelector("#project-form").addEventListener("submit", createProject);
document.querySelector("#task-dialog-close").addEventListener("click", () => document.querySelector("#task-dialog").close());
document.querySelector("#task-form").addEventListener("submit", createTask);
document.querySelector("#library-dialog-close").addEventListener("click", () => document.querySelector("#library-dialog").close());
document.querySelector("#library-form").addEventListener("submit", createLibraryItem);
document.querySelector("#theme-button").addEventListener("click", () => { document.body.classList.toggle("evening"); showToast(document.body.classList.contains("evening") ? "Aftenstemning slået til." : "Dagslys slået til."); });
document.querySelector("#profile-button").addEventListener("click", openProfile);
document.querySelectorAll("[data-nav]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll("[data-nav]").forEach(item => item.classList.remove("active"));
  button.classList.add("active");
  if (button.dataset.nav === "projects") document.querySelector("#projects").scrollIntoView({ behavior: "smooth" });
  if (button.dataset.nav === "history") openActivity();
  if (button.dataset.nav === "library") openLibrary();
}));

function openInboxDrawer() {
  const decisions = office?.decisions || [];
  openDrawer(`<div class="drawer-agent-head"><span class="activity-mark">⌁</span><div><p class="eyebrow">Dine beslutninger</p><h2>Venter på Mads</h2><p>Kun de ting, hvor din retning gør en reel forskel.</p></div></div><section class="drawer-section"><div class="mobile-decisions">${decisions.length ? decisions.map(item => `<article class="decision-card"><span class="decision-type">${escapeHtml(item.type)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p><div class="decision-actions"><button data-drawer-decision="${escapeHtml(item.id)}" data-choice="primary">${escapeHtml(item.primary)}</button><button data-drawer-decision="${escapeHtml(item.id)}" data-choice="secondary">${escapeHtml(item.secondary)}</button></div></article>`).join("") : "<div class='empty-state'>Alt er afklaret lige nu.</div>"}</div></section>`);
}

drawer.addEventListener("click", event => {
  const decision = event.target.closest("[data-drawer-decision]");
  if (decision) respondToDecision(decision.dataset.drawerDecision, decision.dataset.choice);
});

initialise();
