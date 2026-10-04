let office = null;
let serverOnline = false;
let managerAvailable = false;
let selectedProjectId = null;
let pendingDecisionId = null;
let focusMode = readSetting("ai-kontoret:focus") === "1";
const defaultPlaceholder = "Hvad skal holdet arbejde på?";
const coreTeam = ["manager", "designer", "researcher", "developer", "reviewer"];

const drawer = document.querySelector("#detail-drawer");
const drawerContent = document.querySelector("#drawer-content");
const scrim = document.querySelector("#scrim");
const toast = document.querySelector("#toast");
const managerInput = document.querySelector("#manager-input");
let toastTimer;

// Fokus og lys er personlige visningsvalg. De gemmes kun i denne browser og må gerne forsvinde.
function readSetting(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeSetting(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Privat vindue eller blokeret lager: valget gælder bare denne visning. */ }
}

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
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
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
  return ({ active: "Arbejder", ready: "Klar", waiting: "Venter", blocked: "Blokeret", bench: "Talentbank" })[agent.availability] || "Klar";
}

// Skrivebordet viser det, opgavekøen faktisk siger. Et gammelt statusfelt får kun lov at stå, når køen er tom.
function deskStatus(agent) {
  const work = agent.workload || {};
  if (agent.availability === "active") return { label: "Arbejder", line: agent.task?.title || agent.status, waiting: false };
  if (work.ready) return { label: `${work.ready} klar`, line: work.next?.title || "Opgave klar", waiting: false };
  if (work.planned) return { label: `${work.planned} planlagt`, line: work.next?.title || "Afventer din beslutning", waiting: true };
  if (agent.availability === "bench") return { label: "Talentbank", line: "Ikke på en opgave", waiting: true };
  return { label: "Ledig", line: agent.id === "manager" ? (agent.task?.title || "Klar til næste idé") : "Ingen opgave i køen", waiting: true };
}

function workloadText(agent) {
  const work = agent.workload || {};
  const parts = [work.active && `${work.active} i gang`, work.ready && `${work.ready} klar`, work.planned && `${work.planned} planlagt`].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Ingen åbne opgaver";
}

function formatTime(iso) {
  if (!iso) return "nu";
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  const options = sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
  return new Intl.DateTimeFormat("da-DK", options).format(date);
}

function renderToday() {
  const now = new Date();
  const hour = now.getHours();
  const date = new Intl.DateTimeFormat("da-DK", { weekday: "long", day: "numeric", month: "long" }).format(now);
  document.querySelector("#today-date").textContent = date.charAt(0).toUpperCase() + date.slice(1);
  document.querySelector("#greeting").textContent = hour < 5 ? "God nat" : hour < 10 ? "Godmorgen" : hour < 18 ? "God dag" : "God aften";
}

function render() {
  if (!office) return;
  selectedProjectId = selectedProjectId || office.activeProjectId;
  if (!office.projects.some(project => project.id === selectedProjectId)) selectedProjectId = office.activeProjectId;
  renderOffice();
  renderCrew();
  renderProjects();
  renderDecisions();
}

function renderOffice() {
  const project = currentProject();
  const agents = Object.values(office.agents);
  const active = agents.filter(agent => agent.availability === "active" || agent.workload?.active).length;
  const ready = agents.filter(agent => agent.workload?.ready).length;
  const todayTitle = document.querySelector(".today-card strong");
  const todaySubtitle = document.querySelector(".today-card span");
  const todayProgress = document.querySelector(".tiny-progress i");
  const navCount = document.querySelector("[data-nav='projects'] b");
  const footer = document.querySelector(".office-footer > span");

  todayTitle.textContent = project?.name || "Ingen aktiv opgave";
  todaySubtitle.textContent = project ? `${project.activeCount} aktiv · ${project.readyCount} klar` : "Vælg et projekt";
  todayProgress.style.width = `${project?.progress || 0}%`;
  navCount.textContent = office.projects.length;
  footer.innerHTML = `<i class="status-dot"></i> ${active ? `${active} arbejder` : "Ingen arbejder lige nu"} · ${ready} med en opgave klar`;
  document.querySelector(".stage-header .eyebrow").textContent = serverOnline ? "Stueetage · synkroniseret" : "Stueetage · forbindelsen er tabt";

  agents.forEach(agent => {
    const desk = document.querySelector(`[data-agent="${agent.id}"]`);
    if (!desk) return;
    const status = deskStatus(agent);
    desk.querySelector("strong").textContent = agent.name;
    desk.querySelector("small").textContent = status.line;
    desk.classList.toggle("is-working", agent.availability === "active" || Boolean(agent.workload?.active));
    const presence = desk.querySelector(".presence");
    presence.classList.toggle("waiting", status.waiting);
    presence.innerHTML = `<i></i> ${escapeHtml(status.label)}`;
  });

  const managerStatus = document.querySelector(".office-status");
  const managerLabel = !serverOnline ? "Serveren svarer ikke" : !managerAvailable ? "Manageren er ikke forbundet" : office.agents.manager.availability === "active" ? "Manageren arbejder" : "Manageren er klar";
  managerStatus.querySelector("span").textContent = managerLabel;
  managerStatus.classList.toggle("offline", !serverOnline || !managerAvailable);
  managerStatus.title = !managerAvailable && serverOnline ? "Codex blev ikke fundet på denne Mac. Resten af kontoret virker." : "";
}

// Specialister fra talentbanken får ikke et fast skrivebord. De sidder kun i kontoret, når manageren har sat dem på det aktive projekt.
function renderCrew() {
  const crew = document.querySelector("#project-crew");
  const project = currentProject();
  const specialists = (project?.people || []).filter(id => !coreTeam.includes(id)).map(getAgent).filter(Boolean);
  crew.hidden = !specialists.length;
  if (!specialists.length) { crew.innerHTML = ""; return; }
  crew.innerHTML = `<span class="crew-label">Hentet ind på ${escapeHtml(project.name)}</span>${specialists.map(agent => `<button class="crew-member" data-agent-open="${escapeHtml(agent.id)}" aria-label="Åbn ${escapeHtml(agent.name)}">${face(agent, true)}<span><strong>${escapeHtml(agent.name)}</strong><small>${escapeHtml(workloadText(agent))} · ikke forbundet</small></span></button>`).join("")}`;
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
  const executive = decisions.filter(item => item.level === "executive");
  const team = decisions.filter(item => item.level !== "executive");
  const visibleTeam = focusMode ? [] : team;
  const hiddenNote = focusMode && team.length ? `<div class="empty-state focus-note">Fokus-tilstand skjuler ${team.length} team-afgørelse${team.length === 1 ? "" : "r"}. De ligger stadig i “Se hele indbakken”.</div>` : "";
  const groups = `${decisionGroup("Direktion", "Retning, smag og valg med stor effekt.", executive)}${decisionGroup("Team-afgørelser", "Mindre, reversibelt arbejde du kan tage, når det passer.", visibleTeam)}`;
  list.innerHTML = decisions.length ? `${groups}${hiddenNote}` : `<div class="empty-state">Alt er afklaret lige nu. Manageren kan fortsætte med det, der er klart.</div>`;
  const badge = focusMode ? executive.length : decisions.length;
  document.querySelector("#inbox-count").textContent = badge;
  document.querySelector("#inbox-count").hidden = !badge;
  document.querySelector("#panel-count").textContent = badge;
  document.querySelector("#decision-intro").textContent = !decisions.length
    ? "Manageren har ikke noget, der kræver din retning lige nu."
    : executive.length ? `${executive.length} direktionsvalg venter.${focusMode ? "" : " Team-afgørelser kan tages, når du har tid."}` : focusMode ? "Ingen direktionsvalg venter. Du kan arbejde uforstyrret." : "Ingen store valg venter. De mindre team-afgørelser er samlet nedenfor.";
}

function urgencyLabel(urgency) {
  return ({ now: "nu", today: "i dag", when_ready: "kan vente" })[urgency] || "kan vente";
}

function decisionCard(item, drawer = false) {
  const primaryData = drawer ? `data-drawer-decision="${escapeHtml(item.id)}" data-choice="primary"` : `data-action="primary" data-id="${escapeHtml(item.id)}"`;
  const secondaryData = drawer ? `data-drawer-decision="${escapeHtml(item.id)}" data-choice="secondary"` : `data-action="secondary" data-id="${escapeHtml(item.id)}"`;
  return `<article class="decision-card ${item.level === "executive" ? "executive-decision" : "team-decision"}" data-decision="${escapeHtml(item.id)}">
    <div class="decision-meta"><span class="decision-type">${item.level === "executive" ? "Direktion" : "Team"}</span><span class="decision-urgency">${escapeHtml(urgencyLabel(item.urgency))}</span></div>
    <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p>
    <div class="decision-detail"><b>Managerens anbefaling</b><span>${escapeHtml(item.recommendation)}</span></div>
    <div class="decision-detail tradeoff"><b>Afvejning</b><span>${escapeHtml(item.tradeoff)}</span></div>
    <div class="decision-actions"><button ${primaryData}>${escapeHtml(item.primary)}</button><button ${secondaryData}>${escapeHtml(item.secondary)}</button></div>
  </article>`;
}

function decisionGroup(title, intro, items, drawer = false) {
  if (!items.length) return "";
  return `<section class="decision-group"><div class="decision-group-head"><strong>${title}</strong><span>${intro}</span></div>${items.map(item => decisionCard(item, drawer)).join("")}</section>`;
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
  document.querySelectorAll("[data-nav]").forEach(item => item.classList.toggle("active", item.dataset.nav === "office"));
}

function openAgent(id) {
  const agent = getAgent(id);
  if (!agent) return;
  const competencies = Array.isArray(agent.competencies) && agent.competencies.length
    ? `<section class="drawer-section"><p class="eyebrow">Kompetencepakke</p><div class="competency-chips">${agent.competencies.map(item => `<span>${escapeHtml(item)}</span>`).join("")}</div>${agent.handoff ? `<p class="handoff-note"><b>Afleverer til holdet:</b> ${escapeHtml(agent.handoff)}</p>` : ""}</section>`
    : "";
  openDrawer(`
    <div class="drawer-agent-head">
      ${face(agent)}
      <div><p class="eyebrow">${escapeHtml(agent.role)}</p><h2>${escapeHtml(agent.name)}</h2><p>${escapeHtml(agent.status)}</p></div>
    </div>
    <section class="drawer-section">
      <p class="eyebrow">Opgavekø · ${escapeHtml(workloadText(agent))}</p>
      ${agent.workload?.next
        ? `<div class="task-card"><strong>${escapeHtml(agent.workload.next.title)}</strong><p>${escapeHtml(stateLabel(agent.workload.next))} i ${escapeHtml(office.projects.find(item => item.id === agent.workload.next.projectId)?.name || "et projekt")}.</p><button class="task-ready" data-open-project="${escapeHtml(agent.workload.next.projectId)}">Åbn projektet</button></div>`
        : `<div class="task-card"><strong>${escapeHtml(agent.task?.title || "Klar til næste opgave")}</strong><p>${escapeHtml(agent.task?.description || "")}</p></div>`}
    </section>
    <section class="drawer-section"><p class="eyebrow">Arbejdsbord</p><h3>Seneste materiale</h3><ul class="artifact-list">${agent.artifacts.map(artifact => `<li><span>${escapeHtml(artifact.name)}</span><small>${escapeHtml(artifact.state)}</small></li>`).join("")}</ul></section>
    ${competencies}
    <section class="drawer-section"><p class="eyebrow">Besked til dig</p><div class="drawer-message"><strong>${escapeHtml(agent.name)} siger</strong>${escapeHtml(agent.message)}</div></section>
    <div class="drawer-actions">${id === "manager" ? `<button class="drawer-secondary" data-open-conversation>Se projektsamtalen</button>` : ""}<button class="drawer-action" data-compose="${escapeHtml(id)}">Skriv til manageren om ${escapeHtml(agent.name.toLowerCase())} <span>→</span></button></div>`);
}

function openTalentPool() {
  const talentIds = ["game_designer", "graphic_designer", "copywriter", "marketer"];
  const talents = talentIds.map(getAgent).filter(Boolean);
  openDrawer(`<div class="drawer-agent-head"><span class="activity-mark">✦</span><div><p class="eyebrow">Godkendte kompetencepakker</p><h2>Talentbanken</h2><p>Manageren kan sætte en specialist på et projekt, når rollen giver en bedre aflevering.</p></div></div><div class="talent-grid">${talents.map(agent => `<article class="talent-card"><div class="talent-card-head">${face(agent)}<div><span>${escapeHtml(availabilityLabel(agent))}</span><h3>${escapeHtml(agent.name)}</h3><p>${escapeHtml(agent.role)}</p></div></div><p>${escapeHtml(agent.task?.description || agent.message)}</p><div class="competency-chips">${(agent.competencies || []).map(item => `<span>${escapeHtml(item)}</span>`).join("")}</div><div class="talent-card-actions"><button data-open-agent="${escapeHtml(agent.id)}">Se profil</button><button data-compose="${escapeHtml(agent.id)}">Bed manageren vurdere</button></div></article>`).join("")}</div><div class="drawer-message"><strong>Vigtigt lige nu</strong>Disse er projektroller, ikke aktive LLM-forbindelser. En opgave kan planlægges og blive klar, men ingen ekstern model eller adgang bliver startet herfra.</div>`);
}

function connectorStateLabel(connector) {
  return connector.state === "configured" ? "Konfigureret" : "Ikke forbundet";
}

function openConnections() {
  const connectors = Object.values(office?.connectors || {});
  openDrawer(`<div class="drawer-agent-head"><span class="activity-mark">⌁</span><div><p class="eyebrow">Lokale worker-forbindelser</p><h2>Forbindelser</h2><p>En rolle og dens underliggende model er to forskellige ting. Kun faktiske forbindelser står her.</p></div></div><div class="connection-list">${connectors.length ? connectors.map(connector => `<article class="connection-card ${escapeHtml(connector.state)}"><div><span>${escapeHtml(connector.provider)}</span><h3>${escapeHtml(connector.name)}</h3><p>${escapeHtml(connector.mode)}</p></div><b>${escapeHtml(connectorStateLabel(connector))}</b><p>${escapeHtml(connector.status)}</p><div class="connection-scope"><strong>Grænse lige nu</strong>${escapeHtml(connector.scope)}</div><div class="connection-roles">${(connector.roles || []).map(role => `<span>${escapeHtml(role)}</span>`).join("")}</div><small>${escapeHtml(connector.note)}</small></article>`).join("") : "<div class='empty-state'>Ingen forbindelser er registreret endnu.</div>"}</div><div class="drawer-message"><strong>Næste sikre skridt</strong>At tilkoble Claude Code eller Gemini CLI kræver en særskilt lokal login- og tilladelsesbeslutning. Dette kontrolrum må ikke gøre det automatisk.</div>`);
}

function stateLabel(task) {
  return ({ active: "Arbejder", ready: "Klar", planned: "Planlagt", done: "Færdig", blocked: "Blokeret", dropped: "Fravalgt" })[task.state] || "Planlagt";
}

function openProject(id) {
  const project = office.projects.find(item => item.id === id);
  if (!project) return;
  const allTasks = office.tasks.filter(task => task.projectId === id);
  const tasks = allTasks.filter(task => task.state !== "dropped");
  const dropped = allTasks.length - tasks.length;
  const references = (office.libraryItems || []).filter(item => item.projectId === id);
  const presentations = (office.presentations || []).filter(item => item.projectId === id);
  openDrawer(`
    <div class="project-drawer-head"><span class="project-dot" style="background:${escapeHtml(project.color)}"></span><p class="eyebrow">${escapeHtml(project.state)}</p><h2>${escapeHtml(project.name)}</h2><p>${escapeHtml(project.description)}</p></div>
    <section class="drawer-section"><p class="eyebrow">Fremdrift</p><div class="task-card"><strong>${project.progress}% samlet</strong><p>${project.activeCount} arbejder nu · ${project.readyCount} opgaver er klar · ${project.taskCount} i alt</p><div class="task-progress"><i style="width:${project.progress}%"></i></div></div></section>
    <section class="drawer-section"><p class="eyebrow">Fælles kontekst</p><div class="library-summary"><strong>${references.length} ${references.length === 1 ? "materiale" : "materialer"}</strong><p>Noter, briefs og links, der følger projektet.</p><button class="task-ready" data-open-library="${escapeHtml(project.id)}">Åbn bibliotek</button></div></section>
    <section class="drawer-section"><p class="eyebrow">Designvalg</p><div class="library-summary"><strong>${presentations.length} ${presentations.length === 1 ? "gennemgang" : "gennemgange"}</strong><p>Konkrete sammenligninger til Mads — aldrig opdigtede previews.</p><button class="task-ready" data-open-presentations="${escapeHtml(project.id)}">Se designgennemgange</button></div></section>
    <section class="drawer-section"><p class="eyebrow">Arbejdskø</p><h3>Opgaver</h3><ul class="task-list">${tasks.length ? tasks.map(task => `<li><span class="task-state ${escapeHtml(task.state)}">${escapeHtml(stateLabel(task))}</span><strong>${escapeHtml(task.title)}</strong><p>${escapeHtml(task.description || "Ingen ekstra beskrivelse.")}</p>${task.acceptance ? `<p class="task-acceptance"><b>Tjek:</b> ${escapeHtml(task.acceptance)}</p>` : ""}<small>${escapeHtml(getAgent(task.role)?.name || task.role)} · ${task.progress}%</small>${task.state === "planned" ? `<button class="task-ready" data-ready-task="${escapeHtml(task.id)}">Klargør til worker</button>` : ""}</li>`).join("") : "<li><p>Der er ingen opgaver endnu. Skriv til manageren for at lave det første spor.</p></li>"}</ul>${dropped ? `<p class="dropped-note">${dropped} opgave${dropped === 1 ? "" : "r"} fra fravalgte oplæg er skjult.</p>` : ""}</section>
    <div class="drawer-actions"><button class="drawer-secondary" data-new-presentation="${escapeHtml(project.id)}">+ Designgennemgang</button><button class="drawer-secondary" data-new-task="${escapeHtml(project.id)}">+ Ny opgave</button><button class="drawer-action" data-focus-project="${escapeHtml(project.id)}">Gør til dagens fokus <span>→</span></button></div>`);
}

function referenceTypeLabel(type) {
  return ({ brief: "Brief", note: "Note", link: "Link", attachment: "Billede" })[type] || "Materiale";
}

function openLibrary(projectId = selectedProjectId) {
  const project = office.projects.find(item => item.id === projectId);
  if (!project) return;
  const items = (office.libraryItems || []).filter(item => item.projectId === project.id);
  openDrawer(`<div class="drawer-agent-head"><span class="activity-mark">▣</span><div><p class="eyebrow">${escapeHtml(project.name)}</p><h2>Fælles bibliotek</h2><p>Projektets registrerede kontekst. Billeder ligger lokalt, men er ikke læst af manageren endnu.</p></div></div><section class="drawer-section"><p class="eyebrow">Projektmateriale</p><ul class="task-list library-list">${items.length ? items.map(item => `<li><span class="task-state ${escapeHtml(item.type)}">${escapeHtml(referenceTypeLabel(item.type))}</span><strong>${escapeHtml(item.title)}</strong>${item.type === "attachment" && item.attachmentId ? `<img class="attachment-preview" src="/api/attachments/${encodeURIComponent(item.attachmentId)}" alt="${escapeHtml(item.title)}" />` : ""}<p>${escapeHtml(item.content)}</p><small>Gemt ${formatTime(item.createdAt)}</small></li>`).join("") : "<li><p>Ingen fælles kontekst endnu. Gem et brief, en note, et link eller et referencebillede til projektet.</p></li>"}</ul></section><div class="drawer-actions"><button class="drawer-action" data-new-reference="${escapeHtml(project.id)}">+ Gem materiale <span>→</span></button></div>`);
}

function openActivity() {
  const rows = office.activity.map(item => {
    const agent = getAgent(item.actorId);
    return `<li>${face(agent, true)}<div><strong>${escapeHtml(agent?.name || "Kontoret")}</strong><p>${escapeHtml(item.text)}</p><small>${formatTime(item.at)}</small></div></li>`;
  }).join("");
  openDrawer(`<div class="drawer-agent-head"><span class="activity-mark">◷</span><div><p class="eyebrow">Revision af rigtige hændelser</p><h2>Dagens aktivitet</h2><p>Ingen skjulte tanker. Kun handlinger, status og afleveringer.</p></div></div><section class="drawer-section"><ul class="activity-list">${rows}</ul></section>`);
}

function openConversation(projectId = selectedProjectId) {
  const project = office.projects.find(item => item.id === projectId);
  if (!project) return;
  const messages = (office.conversations || []).filter(item => item.projectId === project.id).slice().reverse();
  openDrawer(`<div class="drawer-agent-head"><span class="activity-mark">☷</span><div><p class="eyebrow">${escapeHtml(project.name)}</p><h2>Projektsamtalen</h2><p>Kun dine beskeder, managerens oplæg og registrerede beslutninger.</p></div></div><section class="drawer-section"><div class="conversation-list">${messages.length ? messages.map(item => `<article class="conversation-message ${escapeHtml(item.role)}"><span>${item.role === "mads" ? "Mads" : "Manageren"} · ${escapeHtml(item.kind === "plan" ? "oplæg" : item.kind === "decision" ? "beslutning" : item.kind === "presentation" ? "design" : "besked")}</span><p>${escapeHtml(item.text)}</p><small>${formatTime(item.createdAt)}</small></article>`).join("") : "<div class='empty-state'>Ingen beskeder endnu. Start med at skrive til manageren.</div>"}</div></section><div class="drawer-actions"><button class="drawer-action" data-compose="manager">Skriv til manageren <span>→</span></button></div>`);
}

function openPresentations(projectId = selectedProjectId) {
  const project = office.projects.find(item => item.id === projectId);
  if (!project) return;
  const presentations = (office.presentations || []).filter(item => item.projectId === project.id);
  openDrawer(`<div class="drawer-agent-head"><span class="activity-mark">◫</span><div><p class="eyebrow">${escapeHtml(project.name)}</p><h2>Designgennemgange</h2><p>To retninger, tydelige kriterier og managerens anbefaling.</p></div></div><section class="drawer-section"><div class="presentation-list">${presentations.length ? presentations.map(item => `<article class="presentation-card"><span class="decision-type">${item.level === "executive" ? "Direktion" : "Team"}</span><h3>${escapeHtml(item.title)}</h3><div class="design-directions"><section><b>Retning A</b><p>${escapeHtml(item.directionA)}</p></section><section><b>Retning B</b><p>${escapeHtml(item.directionB)}</p></section></div><div class="decision-detail"><b>Vurderingskriterier</b><span>${escapeHtml(item.criteria)}</span></div><div class="decision-detail tradeoff"><b>Managerens anbefaling</b><span>${escapeHtml(item.recommendation)}</span></div></article>`).join("") : "<div class='empty-state'>Ingen designgennemgange endnu. Tilføj kun én, når A og B har et reelt grundlag.</div>"}</div></section><div class="drawer-actions"><button class="drawer-action" data-new-presentation="${escapeHtml(project.id)}">+ Klargør designgennemgang <span>→</span></button></div>`);
}

function openProfile() {
  const preferences = office.preferences.map(pref => `<li><span>${escapeHtml(pref.label)}</span><p>${escapeHtml(pref.value)}</p><small>${escapeHtml(pref.confidence)} · ${escapeHtml(pref.source)}</small></li>`).join("");
  openDrawer(`<div class="drawer-agent-head"><span class="avatar large-avatar">M</span><div><p class="eyebrow">Redigerbar hukommelse</p><h2>Mads-profilen</h2><p>Præferencer er signaler med kilde, ikke automatiske forbud.</p></div></div><section class="drawer-section"><p class="eyebrow">Kendte præferencer</p><ul class="task-list preference-list">${preferences}</ul></section><div class="drawer-message"><strong>Sådan bruges det</strong>Manageren må gerne udfordre en præference, når den nye situation er anderledes — men skal vise dig hvorfor.</div>`);
}

function resetComposer() {
  pendingDecisionId = null;
  managerInput.placeholder = defaultPlaceholder;
}

async function askManager(message) {
  if (!serverOnline) return showToast("Kontoret kan ikke nå sin lokale server. Start `node server.mjs` og prøv igen.");
  if (!managerAvailable) return showToast("Manageren er ikke forbundet: Codex blev ikke fundet på denne Mac.");
  const form = document.querySelector("#manager-form");
  form.classList.add("is-busy");
  managerInput.disabled = true;
  showToast("Manageren arbejder på et oplæg. Det tager typisk under et minut.");
  try {
    const result = await api("/api/manager", { method: "POST", body: JSON.stringify({ message, projectId: selectedProjectId, decisionId: pendingDecisionId }) });
    office = result.office;
    resetComposer();
    render();
    showToast("Manageren har lagt et oplæg i din indbakke.");
  } catch (error) {
    managerInput.value = managerInput.value || message;
    showToast(error.message);
  } finally {
    form.classList.remove("is-busy");
    managerInput.disabled = false;
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
    if (choice === "secondary") {
      closeDrawer();
      managerInput.focus();
      managerInput.placeholder = "Hvad skal være anderledes i næste runde?";
      return showToast("Oplægget er fravalgt. Skriv til manageren, hvad næste runde skal gøre bedre.");
    }
    showToast(decision.planTaskIds?.length ? "Opgaverne er klar. De starter først, når en godkendt worker kobles på." : "Beslutningen er registreret.");
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

function openPresentationDialog(projectId) {
  const form = document.querySelector("#presentation-form");
  form.reset();
  form.elements.projectId.value = projectId;
  document.querySelector("#presentation-dialog").showModal();
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

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("Billedet kunne ikke læses i browseren.")));
    reader.readAsDataURL(file);
  });
}

async function uploadAttachment(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) return showToast("Vælg et PNG-, JPEG-, WebP- eller GIF-billede.");
  if (file.size > 2 * 1024 * 1024) return showToast("Billedet skal være under 2 MB.");
  const project = currentProject();
  if (!project) return showToast("Vælg et projekt først.");
  try {
    showToast("Gemmer referencebilledet lokalt…");
    const dataUrl = await readAsDataUrl(file);
    const result = await api("/api/attachments", { method: "POST", body: JSON.stringify({ projectId: project.id, name: file.name, dataUrl }) });
    office = result.office;
    selectedProjectId = project.id;
    render();
    openLibrary(project.id);
    showToast("Referencebilledet er gemt. Ingen model har set det endnu.");
  } catch (error) { showToast(error.message); }
}

async function createPresentation(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const projectId = form.elements.projectId.value;
  try {
    const result = await api("/api/presentations", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    office = result.office;
    selectedProjectId = projectId;
    render();
    document.querySelector("#presentation-dialog").close();
    openPresentations(projectId);
    showToast("Designgennemgangen er lagt i den rigtige beslutningskø.");
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
    try {
      office = JSON.parse(event.data);
      serverOnline = true;
      managerAvailable = Boolean(office.managerAvailable);
      render();
    } catch { /* Ignore a malformed live event. */ }
  });
  // EventSource genopretter selv forbindelsen; imens viser kontoret ærligt, at det ikke er synkroniseret.
  stream.addEventListener("error", () => {
    if (!serverOnline) return;
    serverOnline = false;
    render();
  });
}

async function initialise() {
  renderToday();
  setInterval(renderToday, 60_000);
  applyFocusMode();
  applyTheme(readSetting("ai-kontoret:theme") === "evening");
  try {
    const [health, bootstrap] = await Promise.all([api("/api/health"), api("/api/bootstrap")]);
    serverOnline = Boolean(health.ok);
    managerAvailable = Boolean(health.managerAvailable);
    office = bootstrap.office;
    selectedProjectId = office.activeProjectId;
    render();
    subscribe();
  } catch (error) {
    showToast("Kontoret kan ikke nå sin lokale server. Start `node server.mjs` og genindlæs.");
  }
}

function applyFocusMode() {
  const button = document.querySelector("#focus-button");
  button.classList.toggle("is-focused", focusMode);
  button.setAttribute("aria-pressed", String(focusMode));
  button.textContent = focusMode ? "✓ Fokus til" : "✦ Fokus-tilstand";
  if (office) renderDecisions();
}

function applyTheme(evening) {
  document.body.classList.toggle("evening", evening);
  const button = document.querySelector("#theme-button");
  button.textContent = evening ? "☾" : "☼";
  button.setAttribute("aria-pressed", String(evening));
}

document.querySelectorAll("[data-agent]").forEach(button => button.addEventListener("click", () => openAgent(button.dataset.agent)));
document.querySelector("#project-crew").addEventListener("click", event => {
  const member = event.target.closest("[data-agent-open]");
  if (member) openAgent(member.dataset.agentOpen);
});
document.querySelector("#drawer-close").addEventListener("click", closeDrawer);
scrim.addEventListener("click", closeDrawer);
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && drawer.classList.contains("open")) closeDrawer();
});

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
  const conversation = event.target.closest("[data-open-conversation]");
  const presentations = event.target.closest("[data-open-presentations]");
  const newPresentation = event.target.closest("[data-new-presentation]");
  const openAgentButton = event.target.closest("[data-open-agent]");
  const openProjectButton = event.target.closest("[data-open-project]");
  if (compose) {
    closeDrawer();
    managerInput.focus();
    managerInput.placeholder = compose.dataset.compose === "manager" ? defaultPlaceholder : `Hvad vil du bede manageren om omkring ${getAgent(compose.dataset.compose)?.name.toLowerCase() || "denne medarbejder"}?`;
  }
  if (openProjectButton) openProject(openProjectButton.dataset.openProject);
  if (focus) activateProject(focus.dataset.focusProject);
  if (newTask) openTaskDialog(newTask.dataset.newTask);
  if (ready) readyTask(ready.dataset.readyTask);
  if (library) openLibrary(library.dataset.openLibrary);
  if (newReference) openLibraryDialog(newReference.dataset.newReference);
  if (conversation) openConversation();
  if (presentations) openPresentations(presentations.dataset.openPresentations);
  if (newPresentation) openPresentationDialog(newPresentation.dataset.newPresentation);
  if (openAgentButton) openAgent(openAgentButton.dataset.openAgent);
});

const meetingDialog = document.querySelector("#meeting-dialog");
document.querySelector("#meeting-button").addEventListener("click", () => meetingDialog.showModal());
document.querySelector("#table-button").addEventListener("click", () => meetingDialog.showModal());
document.querySelector("#dialog-close").addEventListener("click", () => meetingDialog.close());
document.querySelector("#start-meeting").addEventListener("click", startMeeting);

document.querySelector("#focus-button").addEventListener("click", () => {
  focusMode = !focusMode;
  writeSetting("ai-kontoret:focus", focusMode ? "1" : "0");
  applyFocusMode();
  showToast(focusMode ? "Fokus: indbakken viser kun direktionsvalg. Team-afgørelser venter i den fulde indbakke." : "Fokus-tilstand er slået fra.");
});
const attachmentInput = document.querySelector("#attachment-input");
document.querySelector("#attach-button").addEventListener("click", () => attachmentInput.click());
attachmentInput.addEventListener("change", event => {
  const [file] = event.target.files;
  uploadAttachment(file);
  event.target.value = "";
});
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
document.querySelector("#presentation-dialog-close").addEventListener("click", () => document.querySelector("#presentation-dialog").close());
document.querySelector("#presentation-form").addEventListener("submit", createPresentation);
document.querySelector("#theme-button").addEventListener("click", () => {
  const evening = !document.body.classList.contains("evening");
  applyTheme(evening);
  writeSetting("ai-kontoret:theme", evening ? "evening" : "day");
});
document.querySelector("#profile-button").addEventListener("click", openProfile);
document.querySelector("#chat-history").addEventListener("click", () => openConversation());
document.querySelectorAll("[data-nav]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll("[data-nav]").forEach(item => item.classList.remove("active"));
  button.classList.add("active");
  if (button.dataset.nav === "office") { closeDrawer(); document.querySelector("#office").scrollIntoView({ behavior: "smooth", block: "start" }); }
  if (button.dataset.nav === "projects") document.querySelector("#projects").scrollIntoView({ behavior: "smooth" });
  if (button.dataset.nav === "history") openActivity();
  if (button.dataset.nav === "library") openLibrary();
  if (button.dataset.nav === "talent") openTalentPool();
  if (button.dataset.nav === "connections") openConnections();
}));

function openInboxDrawer() {
  const decisions = office?.decisions || [];
  const executive = decisions.filter(item => item.level === "executive");
  const team = decisions.filter(item => item.level !== "executive");
  openDrawer(`<div class="drawer-agent-head"><span class="activity-mark">⌁</span><div><p class="eyebrow">Dine beslutninger</p><h2>Venter på Mads</h2><p>Direktionsvalg først; team-afgørelser kan vente, hvis de ikke blokerer.</p></div></div><section class="drawer-section"><div class="mobile-decisions">${decisions.length ? `${decisionGroup("Direktion", "Retning og valg med stor effekt.", executive, true)}${decisionGroup("Team-afgørelser", "Reversible valg, du kan tage senere.", team, true)}` : "<div class='empty-state'>Alt er afklaret lige nu.</div>"}</div></section>`);
}

drawer.addEventListener("click", event => {
  const decision = event.target.closest("[data-drawer-decision]");
  if (decision) respondToDecision(decision.dataset.drawerDecision, decision.dataset.choice);
});

initialise();
