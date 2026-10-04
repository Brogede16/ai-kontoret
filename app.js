const agents = {
  manager: {
    initial: "M", face: "manager-face", name: "Manageren", role: "Producer & retning",
    status: "Planlægger dagens arbejde", task: "Samle dagens opgaver i en plan, så holdet kan arbejde videre uden at miste retning.", progress: 72,
    artifacts: [["Dagens plan", "opdateret nu"], ["Beslutningslog", "2 nye punkter"], ["Koncert-app brief", "klar"]],
    message: "Jeg har lagt design og research i parallelle spor. Udvikleren får først et fælles oplæg, så vi undgår at bygge i den forkerte retning."
  },
  designer: {
    initial: "D", face: "designer-face", name: "Designeren", role: "Produkt & UI",
    status: "Skitserer UI-retning B", task: "Lave to direkte kodbare retninger til onboarding, med udgangspunkt i Mads' reference og koncert-appens målgruppe.", progress: 58,
    artifacts: [["Retning A · varm", "preview"], ["Retning B · rytmisk", "i gang"], ["Komponent-noter", "6 idéer"]],
    message: "Jeg holder B mere levende end det tidligere flow, men uden at det bliver tungt. Jeg vil vise dig en sammenligning, før vi låser noget."
  },
  researcher: {
    initial: "R", face: "researcher-face", name: "Researcheren", role: "Indhold & indsigt",
    status: "Undersøger koncertpublikum", task: "Finde, hvad brugere skal vide før, under og efter en koncert — og hvilke mønstre andre apps bruger godt eller dårligt.", progress: 81,
    artifacts: [["6 kilder", "verificeret"], ["Målgruppe-noter", "klar"], ["App-eksempler", "4 fund"]],
    message: "Et mønster går igen: folk vil have færre valg lige før koncerten. Det støtter designerens enkle onboarding-retning."
  },
  developer: {
    initial: "U", face: "developer-face", name: "Udvikleren", role: "Bygger & integrerer",
    status: "Bygger onboarding-flow", task: "Sætte det nuværende onboarding-flow op i en isoleret branch med testbare komponenter og preview.", progress: 44,
    artifacts: [["feature/onboarding", "branch"], ["Build", "grøn"], ["Preview", "kommer snart"]],
    message: "Strukturen er klar. Jeg venter kun på, at UI-retningen bliver låst, før jeg gør det visuelle færdigt."
  },
  reviewer: {
    initial: "Q", face: "reviewer-face", name: "Revieweren", role: "Kvalitet & modspil",
    status: "Klar til næste review", task: "Vurdere om afleveringerne både virker teknisk, matcher briefen og er forståelige for Mads at godkende.", progress: 15,
    artifacts: [["Review-tjekliste", "klar"], ["Seneste review", "godkendt"], ["Test-scenarier", "8 klar"]],
    message: "Jeg går i gang, så snart udvikleren har et preview. Jeg tjekker både funktion, mobil-layout og om designet matcher den valgte retning."
  }
};

const projects = [
  { name: "Koncert-app", state: "I gang", description: "En levende hjælper før, under og efter koncerten.", progress: "62% fremdrift", dot: "#f36d4c", people: ["manager", "designer", "researcher", "developer"] },
  { name: "Spillet", state: "I review", description: "Mere karakter, bedre onboarding og en tydelig første session.", progress: "1 beslutning", dot: "#a7a2ed", people: ["manager", "developer", "reviewer"] },
  { name: "Ny idé", state: "Udforsker", description: "Et roligt sted til idéer, der ikke skal bygges i dag.", progress: "3 noter", dot: "#6fc8e7", people: ["manager", "researcher"] }
];

let decisions = [
  { id: "ui", type: "Designretning", title: "Vælg retning for onboarding", text: "A er varm og rolig. B er mere levende og matcher dit referencebillede.", primary: "Se B", secondary: "Bed om ny runde" },
  { id: "scope", type: "Projektvalg", title: "Skal holdet fortsætte efter frokost?", text: "Manageren anbefaler, at vi bygger B videre, mens research afslutter indholdet.", primary: "Fortsæt", secondary: "Læs oplæg" }
];

let managerWorkerOnline = false;

const drawer = document.querySelector("#detail-drawer");
const drawerContent = document.querySelector("#drawer-content");
const scrim = document.querySelector("#scrim");
const toast = document.querySelector("#toast");
let toastTimer;

function face(agent) {
  return `<span class="agent-face ${agent.face}">${agent.initial}</span>`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3400);
}

function openAgent(id) {
  const agent = agents[id];
  drawerContent.innerHTML = `
    <div class="drawer-agent-head">
      ${face(agent)}
      <div><p class="eyebrow">${agent.role}</p><h2>${agent.name}</h2><p>${agent.status}</p></div>
    </div>
    <section class="drawer-section">
      <p class="eyebrow">Aktuel opgave</p>
      <div class="task-card"><strong>${agent.task}</strong><p>${agent.progress}% klar</p><div class="task-progress"><i style="width:${agent.progress}%"></i></div></div>
    </section>
    <section class="drawer-section"><p class="eyebrow">Arbejdsbord</p><h3>Seneste materiale</h3><ul class="artifact-list">${agent.artifacts.map(([name, state]) => `<li><span>${name}</span><small>${state}</small></li>`).join("")}</ul></section>
    <section class="drawer-section"><p class="eyebrow">Besked til dig</p><div class="drawer-message"><strong>${agent.name} siger</strong>${agent.message}</div></section>
    <button class="drawer-action" data-message="${id}">Skriv til ${agent.name} <span>→</span></button>`;
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  scrim.classList.add("open");
}

function closeDrawer() {
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  scrim.classList.remove("open");
}

function renderDecisions() {
  const list = document.querySelector("#decision-list");
  list.innerHTML = decisions.length ? decisions.map(item => `
    <article class="decision-card" data-decision="${item.id}">
      <span class="decision-type">${item.type}</span>
      <h3>${item.title}</h3><p>${item.text}</p>
      <div class="decision-actions"><button data-action="accept" data-id="${item.id}">${item.primary}</button><button data-action="secondary" data-id="${item.id}">${item.secondary}</button></div>
    </article>`).join("") : `<div class="empty-state">Alt er afklaret. Holdet arbejder videre.</div>`;
  document.querySelector("#inbox-count").textContent = decisions.length;
  document.querySelector("#panel-count").textContent = decisions.length;
}

function renderProjects() {
  const grid = document.querySelector("#project-grid");
  grid.innerHTML = projects.map((project, index) => `
    <button class="project-card ${index === 0 ? "active" : ""}" data-project="${index}">
      <div class="project-top"><span class="project-dot" style="background:${project.dot}"></span><span class="project-state">${project.state}</span></div>
      <h3>${project.name}</h3><p>${project.description}</p>
      <div class="project-meta"><span class="project-avatars">${project.people.map(id => face(agents[id])).join("")}</span><span>${project.progress}</span></div>
    </button>`).join("");
}

document.querySelectorAll("[data-agent]").forEach(button => button.addEventListener("click", () => openAgent(button.dataset.agent)));
document.querySelector("#drawer-close").addEventListener("click", closeDrawer);
scrim.addEventListener("click", closeDrawer);

document.querySelector("#manager-form").addEventListener("submit", event => {
  event.preventDefault();
  const input = document.querySelector("#manager-input");
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  askManager(message);
});

async function askManager(message) {
  const managerDesk = document.querySelector("[data-agent='manager'] small");
  managerDesk.textContent = "Tænker over din idé";
  showToast(managerWorkerOnline ? "Manageren tænker med Codex…" : "Demo-manageren samler et første oplæg…");

  if (!managerWorkerOnline) {
    setTimeout(() => {
      decisions.unshift({ id: `new-${Date.now()}`, type: "Managerens plan", title: "Nyt oplæg er klar", text: `Jeg har forstået: “${message.length > 68 ? `${message.slice(0, 68)}…` : message}”. Jeg samler holdet og vender tilbage med et kort forslag.`, primary: "Se plan", secondary: "Vent" });
      renderDecisions();
      managerDesk.textContent = "Fordeler ny opgave";
    }, 550);
    return;
  }

  try {
    const response = await fetch("/api/manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Manageren kunne ikke svare.");
    agents.manager.message = result.message;
    agents.manager.status = "Har et oplæg klar til Mads";
    agents.manager.artifacts.unshift(["Managerens oplæg", "netop nu"]);
    decisions.unshift({ id: `manager-${Date.now()}`, type: "Managerens oplæg", title: "Et første forslag er klar", text: result.message, primary: "Læs hos manageren", secondary: "Gem til senere" });
    renderDecisions();
    managerDesk.textContent = "Har et oplæg klar";
    showToast("Manageren er klar med et kort oplæg.");
  } catch (error) {
    managerDesk.textContent = "Kan ikke nå manageren";
    showToast(error.message);
  }
}

document.querySelector("#decision-list").addEventListener("click", event => {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  const card = button.closest(".decision-card");
  if (button.dataset.action === "accept") {
    const selected = decisions.find(item => item.id === button.dataset.id);
    if (selected?.type === "Managerens oplæg") return openAgent("manager");
    card.classList.add("done");
    showToast("Manageren har fået din retning og sætter holdet i gang.");
    setTimeout(() => { decisions = decisions.filter(item => item.id !== button.dataset.id); renderDecisions(); }, 400);
  } else {
    showToast("Manageren samler mere materiale, før den spørger igen.");
  }
});

const meetingDialog = document.querySelector("#meeting-dialog");
document.querySelector("#meeting-button").addEventListener("click", () => meetingDialog.showModal());
document.querySelector("#table-button").addEventListener("click", () => meetingDialog.showModal());
document.querySelector("#dialog-close").addEventListener("click", () => meetingDialog.close());
document.querySelector("#start-meeting").addEventListener("click", () => {
  meetingDialog.close();
  document.querySelector("[data-agent='manager'] small").textContent = "Leder idé-møde";
  document.querySelector("[data-agent='designer'] small").textContent = "Præsenterer retning B";
  document.querySelector("[data-agent='researcher'] small").textContent = "Deler fund";
  showToast("Mødet er startet. Manageren sender dig et samlet oplæg bagefter.");
});

document.querySelector("#focus-button").addEventListener("click", event => {
  event.currentTarget.textContent = event.currentTarget.textContent.includes("Fokus") ? "✓ Fokus i gang" : "✦ Fokus-tilstand";
  showToast("Manageren holder møder og afbrydelser på et minimum den næste time.");
});
document.querySelector("#attach-button").addEventListener("click", () => showToast("I den næste version kan du slippe billeder og filer direkte ind her."));
document.querySelector("#view-activity").addEventListener("click", () => openAgent("manager"));
document.querySelector("#open-inbox").addEventListener("click", () => document.querySelector(".decision-panel").scrollIntoView({ behavior: "smooth", block: "center" }));
document.querySelector("#see-all").addEventListener("click", () => showToast("I MVP'en er indbakken bevidst kort: kun ting, der behøver din retning."));
document.querySelector("#new-project").addEventListener("click", () => { document.querySelector("#manager-input").focus(); document.querySelector("#manager-input").placeholder = "Fortæl manageren om den nye idé…"; });
document.querySelector("#project-grid").addEventListener("click", event => {
  const project = event.target.closest(".project-card");
  if (!project) return;
  document.querySelectorAll(".project-card").forEach(card => card.classList.remove("active"));
  project.classList.add("active");
  showToast(`${projects[project.dataset.project].name} er nu dit aktive projekt.`);
});
document.querySelector("#theme-button").addEventListener("click", () => { document.body.classList.toggle("evening"); showToast(document.body.classList.contains("evening") ? "Aftenstemning slået til." : "Dagslys slået til."); });
document.querySelector("#profile-button").addEventListener("click", () => showToast("Mads-profilen bliver stedet, hvor du kan se og rette holdets præferencer om dig."));

async function checkWorker() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const result = await response.json();
    managerWorkerOnline = Boolean(result.ok);
    if (managerWorkerOnline) {
      document.querySelector(".office-status span").textContent = "Manageren er online";
      document.querySelector(".office-status").setAttribute("title", "Codex-manageren kører lokalt og skrivebeskyttet på din Mac.");
    }
  } catch {
    managerWorkerOnline = false;
  }
}

renderDecisions();
renderProjects();
checkWorker();
