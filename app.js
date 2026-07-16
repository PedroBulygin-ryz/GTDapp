const BUBBLES = [
  { id: "inbox", title: "Recopiladas", hint: "Aun no fueron procesadas." },
  { id: "next", title: "Proximas acciones", hint: "Acciones concretas para hacer." },
  { id: "projects", title: "Proyectos", hint: "Requieren mas de una accion." },
  { id: "waiting", title: "En espera", hint: "Delegadas o bloqueadas por terceros." },
  { id: "someday", title: "Algun dia / Quizas", hint: "No son para ahora." },
  { id: "reference", title: "Referencia", hint: "No requieren accion." },
  { id: "done", title: "Hecho", hint: "Verificado, comunicado y cerrado." },
];

const STORAGE_KEY = "bubbles-gtd-v2";
const DATA_FILE_DB = "bubbles-gtd-file";
const DATA_FILE_STORE = "handles";
const DATA_FILE_KEY = "primary";
const DATA_FILE_VERSION = 1;

const defaultState = {
  tasks: [],
  points: 0,
  streak: 0,
  currentView: "collect",
  selectedTaskId: "",
  selectedOrganizeTaskId: "",
  expandedHistoryTaskIds: [],
  historyPage: 0,
  donePage: 0,
  reviewDoneOpen: false,
  showShortcutHelp: false,
};

let state = loadState();
let dataFile = {
  handle: null,
  name: "",
  status: "Usando guardado del navegador.",
  connected: false,
  autoSave: false,
  supported: "showOpenFilePicker" in window && "showSaveFilePicker" in window,
};
let dataFileWriteQueue = Promise.resolve();
let quickInbox = {
  fileName: "",
  lines: [],
  status: "Sin revisar",
};

const els = {
  focus: document.querySelector("#focus-view"),
  grid: document.querySelector("#bubble-grid"),
  indicator: document.querySelector("#stage-indicator"),
  flowButtons: [...document.querySelectorAll(".flow-step")],
};

function loadState() {
  try {
    const v2 = localStorage.getItem(STORAGE_KEY);
    const v1 = localStorage.getItem("bubbles-gtd-v1");
    return { ...defaultState, ...JSON.parse(v2 || v1 || "{}") };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Si el navegador bloquea localStorage, la sesion actual sigue funcionando.
  }
  queueDataFileWrite();
}

function exportData() {
  return {
    app: "Bubbles GTD",
    version: DATA_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    state,
  };
}

function normalizeImportedState(data) {
  const importedState = data?.state || data;
  if (!importedState || !Array.isArray(importedState.tasks)) {
    throw new Error("Archivo invalido");
  }
  return { ...defaultState, ...importedState };
}

function openDataFileDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATA_FILE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DATA_FILE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getStoredDataFileHandle() {
  const db = await openDataFileDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_FILE_STORE, "readonly");
    const request = tx.objectStore(DATA_FILE_STORE).get(DATA_FILE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function storeDataFileHandle(handle) {
  const db = await openDataFileDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_FILE_STORE, "readwrite");
    tx.objectStore(DATA_FILE_STORE).put(handle, DATA_FILE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function hasDataFilePermission(handle, request = false) {
  const options = { mode: "readwrite" };
  if ((await handle.queryPermission(options)) === "granted") return true;
  return request && (await handle.requestPermission(options)) === "granted";
}

async function initStoredDataFile() {
  if (!dataFile.supported) {
    dataFile.status = "Tu navegador no permite guardar en un archivo local desde esta vista.";
    render();
    return;
  }
  try {
    const handle = await getStoredDataFileHandle();
    if (!handle) return;
    dataFile.handle = handle;
    dataFile.name = handle.name;
    dataFile.connected = await hasDataFilePermission(handle);
    dataFile.autoSave = dataFile.connected;
    dataFile.status = dataFile.connected
      ? `Archivo conectado: ${handle.name}`
      : `Archivo recordado: ${handle.name}. Falta dar permiso.`;
    render();
  } catch {
    dataFile.status = "No pude recuperar el archivo de datos anterior.";
    render();
  }
}

async function writeDataFile() {
  if (!dataFile.handle || !dataFile.connected || !dataFile.autoSave) return;
  const writable = await dataFile.handle.createWritable();
  await writable.write(JSON.stringify(exportData(), null, 2));
  await writable.close();
  dataFile.status = `Guardado en ${dataFile.name || dataFile.handle.name}`;
}

function queueDataFileWrite() {
  if (!dataFile.handle || !dataFile.connected || !dataFile.autoSave) return;
  dataFileWriteQueue = dataFileWriteQueue
    .then(() => writeDataFile())
    .catch(() => {
      dataFile.status = "No pude guardar en el archivo. Volve a conectarlo.";
      dataFile.connected = false;
      dataFile.autoSave = false;
      render();
    });
}

function uid() {
  return globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createTask(title) {
  const now = new Date().toISOString();
  state.tasks.unshift({
    id: uid(),
    title,
    notes: "",
    bubble: "inbox",
    createdAt: now,
    updatedAt: now,
    dueDate: "",
    completedAt: "",
    nextAction: "",
    owner: "",
    status: "unprocessed",
    doneChecklist: {
      verified: false,
      communicated: false,
      closed: false,
    },
    history: [
      {
        id: uid(),
        at: now,
        text: "Ingresada en Recopilar",
      },
    ],
  });
  saveAndRender();
}

function createTasks(titles, sourceText = "Importada desde capturas rapidas") {
  const now = new Date().toISOString();
  const newTasks = titles.map((title) => ({
    id: uid(),
    title,
    notes: "",
    bubble: "inbox",
    createdAt: now,
    updatedAt: now,
    dueDate: "",
    completedAt: "",
    nextAction: "",
    owner: "",
    status: "unprocessed",
    doneChecklist: {
      verified: false,
      communicated: false,
      closed: false,
    },
    history: [
      {
        id: uid(),
        at: now,
        text: sourceText,
      },
    ],
  }));
  state.tasks = [...newTasks, ...state.tasks];
  saveAndRender();
}

function addHistory(task, text) {
  return [
    ...(task.history || []),
    {
      id: uid(),
      at: new Date().toISOString(),
      text,
    },
  ];
}

function updateTask(id, patch, historyText = "") {
  state.tasks = state.tasks.map((task) =>
    task.id === id
      ? {
          ...task,
          ...patch,
          history: historyText ? addHistory(task, historyText) : patch.history || task.history || [],
          updatedAt: new Date().toISOString(),
        }
      : task,
  );
  saveAndRender();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((task) => task.id !== id);
  if (state.selectedTaskId === id) state.selectedTaskId = "";
  saveAndRender();
}

function processTask(id, patch) {
  state.selectedTaskId = "";
  const task = state.tasks.find((item) => item.id === id);
  const targetBubble = patch.bubble || task?.bubble;
  const targetTitle = BUBBLES.find((bubble) => bubble.id === targetBubble)?.title;
  const historyText =
    targetTitle && targetBubble !== task?.bubble ? `Movida a ${targetTitle}` : "";
  updateTask(id, { status: "processed", ...patch }, historyText);
}

function getTasks(bubble) {
  return state.tasks.filter((task) => task.bubble === bubble);
}

function saveAndRender() {
  saveState();
  render();
}

function setView(view) {
  state.currentView = view;
  state.selectedTaskId = "";
  state.selectedOrganizeTaskId = "";
  state.historyPage = 0;
  saveAndRender();
  els.focus.scrollIntoView({ behavior: "smooth", block: "start" });
}

function render() {
  renderFlow();
  renderFocus();
  renderBubbles();
}

function renderFlow() {
  els.flowButtons.forEach((button) => {
    const active = button.dataset.view === state.currentView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "step" : "false");
  });
  const activeLabel =
    els.flowButtons.find((button) => button.dataset.view === state.currentView)?.textContent ||
    "Recopilar";
  els.indicator.textContent = `Estas en: ${activeLabel}`;
}

function renderFocus() {
  const views = {
    collect: renderCollectView,
    process: renderProcessView,
    organize: renderOrganizeView,
    review: renderReviewView,
    do: renderDoView,
  };
  els.focus.innerHTML = "";
  views[state.currentView]();
}

function renderCollectView() {
  const inbox = getTasks("inbox");
  els.focus.innerHTML = `
    <header class="stage-header">
      <span class="stage-number">1</span>
      <div>
        <p class="stage-label">Etapa actual</p>
        <h2>Recopilar</h2>
        <p>Escribi todo lo que aparezca. No decidas todavia: esta etapa solo vacia la cabeza.</p>
      </div>
    </header>

    <form class="capture-form" data-form="capture">
      <input
        name="title"
        type="text"
        maxlength="120"
        autocomplete="off"
        placeholder="Nueva tarea, idea, promesa, seguimiento..."
        aria-label="Nueva tarea"
        required
      />
      <button type="submit">Agregar</button>
    </form>

    ${renderDataFilePanel()}

    <section class="quick-inbox" aria-label="Capturas rapidas">
      <div>
        <h3>Capturas rapidas</h3>
        <p>${escapeHtml(quickInbox.status)}</p>
      </div>
      <span class="quick-status ${quickInbox.lines.length ? "has-items" : ""}" title="Capturas pendientes">${quickInbox.lines.length}</span>
      <div class="quick-actions">
        <button class="secondary-button" data-refresh-quick-inbox>Revisar inbox.txt</button>
        <button class="primary-button" data-import-quick-inbox ${quickInbox.lines.length ? "" : "disabled"}>Importar</button>
        <button class="help-button" data-toggle-shortcut-help title="Como usar capturas rapidas">?</button>
      </div>
      <input class="hidden-file" type="file" accept=".txt,text/plain" data-quick-inbox-file />
    </section>
    ${state.showShortcutHelp ? renderShortcutHelp() : ""}

    <section class="stage-list" aria-label="Tareas recopiladas">
      <div class="section-title">
        <h3>Recopiladas sin procesar</h3>
        <span>${inbox.length}</span>
      </div>
      ${renderSimpleTaskList(inbox, "Todavia no recopilaste nada.")}
    </section>
  `;
  els.focus.querySelector("input")?.focus();
}

function renderDataFilePanel() {
  const disabled = dataFile.supported ? "" : "disabled";
  const connected = dataFile.connected && dataFile.handle;
  return `
    <section class="data-file-panel" aria-label="Archivo de datos local">
      <div>
        <h3>Archivo de datos local</h3>
        <p>${escapeHtml(dataFile.status)}</p>
      </div>
      <span class="quick-status ${connected ? "has-items" : ""}" title="Estado del archivo">${connected ? "OK" : "?"}</span>
      <div class="quick-actions">
        <button class="secondary-button" data-open-data-file ${disabled}>Elegir archivo</button>
        <button class="secondary-button" data-create-data-file ${disabled}>Crear archivo</button>
        <button class="secondary-button" data-load-data-file ${connected ? "" : "disabled"}>Cargar</button>
        <button class="primary-button" data-save-data-file ${connected ? "" : "disabled"}>Guardar ahora</button>
      </div>
    </section>
  `;
}

function renderShortcutHelp() {
  return `
    <aside class="shortcut-help">
      <button class="close-details" data-toggle-shortcut-help title="Cerrar ayuda">×</button>
      <h3>Capturas rapidas con atajos</h3>
      <p><strong>Control + Option + B</strong>: abre una ventanita para escribir una captura y guardarla en <code>inbox.txt</code>.</p>
      <p><strong>Control + Option + Delete</strong>: vacia <code>inbox.txt</code> despues de confirmar.</p>
      <p>En esta pestaña, toca <strong>Revisar inbox.txt</strong>, selecciona el archivo y luego <strong>Importar</strong> para traer esas capturas a Recopilar.</p>
    </aside>
  `;
}

function renderProcessView() {
  const inbox = getTasks("inbox");
  const selected = inbox.find((task) => task.id === state.selectedTaskId) || inbox[0];

  els.focus.innerHTML = `
    <header class="stage-header">
      <span class="stage-number">2</span>
      <div>
        <p class="stage-label">Etapa actual</p>
        <h2>Procesar</h2>
        <p>Procesa de a una. Decidi que significa cada item y no lo devuelvas al cubo.</p>
      </div>
    </header>

    <section class="process-layout">
      <div class="stage-list">
        <div class="section-title">
          <h3>Recopiladas para procesar</h3>
          <span>${inbox.length}</span>
        </div>
        ${renderSelectableTaskList(inbox, selected?.id)}
      </div>
      <div class="decision-panel">
        ${selected ? renderDecisionMenu(selected) : renderEmptyProcessing()}
      </div>
    </section>
  `;
}

function renderOrganizeView() {
  const organizedBubbles = BUBBLES.filter((bubble) => bubble.id !== "inbox" && bubble.id !== "done");
  els.focus.innerHTML = `
    <header class="stage-header">
      <span class="stage-number">3</span>
      <div>
        <p class="stage-label">Etapa actual</p>
        <h2>Organizar</h2>
        <p>Cada pendiente procesado tiene que vivir en la burbuja correcta y, si es un proyecto, tener una proxima accion.</p>
      </div>
    </header>

    <section class="organize-grid">
      ${organizedBubbles
        .map((bubble) => {
          const tasks = getTasks(bubble.id);
          return `
            <article class="bubble compact-bubble">
              <header>
                <div>
                  <h2>${bubble.title}</h2>
                  <small>${bubble.hint}</small>
                </div>
                <span class="bubble-count">${tasks.length}</span>
              </header>
              ${renderOrganizeTaskList(tasks)}
            </article>
          `;
        })
        .join("")}
    </section>
  `;
}

function renderReviewView() {
  const inbox = getTasks("inbox");
  const projects = getTasks("projects");
  const waiting = getTasks("waiting");
  const next = getTasks("next");
  const projectsWithoutAction = projects.filter((task) => !task.nextAction.trim());
  const waitingWithoutOwner = waiting.filter((task) => !task.owner.trim());
  const waitingWithoutDate = waiting.filter((task) => !task.dueDate);
  const done = getTasks("done");
  const donePageSize = 5;
  const donePageCount = Math.max(1, Math.ceil(done.length / donePageSize));
  if (state.donePage >= donePageCount) state.donePage = donePageCount - 1;
  const visibleDone = done.slice(
    state.donePage * donePageSize,
    state.donePage * donePageSize + donePageSize,
  );
  const recentHistory = getRecentHistory();
  const historyPageSize = 5;
  const historyPageCount = Math.max(1, Math.ceil(recentHistory.length / historyPageSize));
  if (state.historyPage >= historyPageCount) state.historyPage = historyPageCount - 1;
  const visibleHistory = recentHistory.slice(
    state.historyPage * historyPageSize,
    state.historyPage * historyPageSize + historyPageSize,
  );

  els.focus.innerHTML = `
    <header class="stage-header">
      <span class="stage-number">4</span>
      <div>
        <p class="stage-label">Etapa actual</p>
        <h2>Revisar</h2>
        <p>Chequea que nada quede huerfano: Inbox vacio, proyectos con proxima accion y esperas con responsable.</p>
      </div>
    </header>

    <section class="review-grid">
      ${renderReviewCard("Inbox por procesar", inbox.length, inbox.length === 0, "Procesar todo lo recopilado.")}
      ${renderReviewCard("Proyectos sin proxima accion", projectsWithoutAction.length, projectsWithoutAction.length === 0, "Todo proyecto necesita un siguiente paso concreto.")}
      ${renderReviewCard("Esperas sin responsable", waitingWithoutOwner.length, waitingWithoutOwner.length === 0, "Toda espera necesita saber de quien depende.")}
      ${renderReviewCard("Esperas sin fecha", waitingWithoutDate.length, waitingWithoutDate.length === 0, "Si no hay plazo, conviene revisar o hacer follow up diario.")}
      ${renderReviewCard("Proximas acciones listas", next.length, next.length > 0, "Estas son las opciones para pasar a Hacer.")}
    </section>

    <section class="stage-list">
      <div class="section-title">
        <h3>Items que conviene revisar</h3>
        <span>${inbox.length + projectsWithoutAction.length + waitingWithoutOwner.length + waitingWithoutDate.length}</span>
      </div>
      ${renderReviewIssueList([...inbox, ...projectsWithoutAction, ...waitingWithoutOwner, ...waitingWithoutDate])}
    </section>

    <section class="stage-list">
      <button class="section-title section-title-button" data-toggle-done-list>
        <h3>Tareas cerradas</h3>
        <div class="section-title-meta">
          <small>${state.reviewDoneOpen ? "Ocultar" : "Abrir"}</small>
          <span>${done.length}</span>
        </div>
      </button>
      ${
        state.reviewDoneOpen
          ? `${renderDoneList(visibleDone)}${renderDonePagination(done.length, donePageCount)}`
          : ""
      }
    </section>

    <section class="stage-list">
      <div class="section-title">
        <h3>Historial reciente</h3>
        <span>${recentHistory.length}</span>
      </div>
      ${renderRecentHistory(visibleHistory)}
      ${renderHistoryPagination(recentHistory.length, historyPageCount)}
    </section>
  `;
}

function renderDoView() {
  const next = getTasks("next");
  const selected = next.find((task) => task.id === state.selectedTaskId) || next[0];

  els.focus.innerHTML = `
    <header class="stage-header">
      <span class="stage-number">5</span>
      <div>
        <p class="stage-label">Etapa actual</p>
        <h2>Hacer</h2>
        <p>Elegis una proxima accion y la cerras solo cuando este verificada, comunicada y cerrada.</p>
      </div>
    </header>

    <section class="process-layout">
      <div class="stage-list">
        <div class="section-title">
          <h3>Proximas acciones</h3>
          <span>${next.length}</span>
        </div>
        ${renderSelectableTaskList(next, selected?.id)}
      </div>
      <div class="decision-panel">
        ${selected ? renderDoPanel(selected) : renderEmptyDo()}
      </div>
    </section>

    <section class="stage-list">
      <div class="section-title">
        <h3>Historial de avance</h3>
        <span>${selected ? (selected.history || []).length : 0}</span>
      </div>
      ${selected ? renderTaskHistory(selected) : `<div class="empty">Elegí una próxima acción para ver su historial.</div>`}
    </section>
  `;
}

function renderSimpleTaskList(tasks, emptyText) {
  if (!tasks.length) return `<div class="empty">${emptyText}</div>`;
  return `
    <div class="task-list">
      ${tasks
        .map(
          (task) => `
            <article class="task-card compact-card">
              <div>
                <h3>${escapeHtml(task.title)}</h3>
                <p>Ingresada: ${formatDate(task.createdAt)}</p>
              </div>
              <button class="icon-button" data-delete="${task.id}" title="Eliminar">x</button>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderSelectableTaskList(tasks, selectedId) {
  if (!tasks.length) return `<div class="empty">No hay tareas recopiladas para procesar.</div>`;
  return `
    <div class="task-list">
      ${tasks
        .map(
          (task) => `
            <button class="task-select ${task.id === selectedId ? "selected" : ""}" data-select="${task.id}">
              <strong>${escapeHtml(task.title)}</strong>
              <span>${formatDate(task.createdAt)}</span>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderDecisionMenu(task) {
  return `
    <article class="decision-card" data-task-id="${task.id}">
      <p class="stage-label">Item seleccionado</p>
      <h3>${escapeHtml(task.title)}</h3>

      <label>
        Aclaracion rapida
        <textarea data-field="notes" placeholder="Que es, contexto, link mental...">${escapeHtml(task.notes)}</textarea>
      </label>

      <div class="decision-group">
        <h4>¿Requiere accion?</h4>
        <button class="secondary-button" data-process="${task.id}" data-target="reference">
          No: archivar como referencia
        </button>
        <button class="secondary-button" data-process="${task.id}" data-target="someday">
          No ahora: algun dia / quizas
        </button>
        <button class="danger-button" data-delete="${task.id}">
          No sirve: desechar
        </button>
      </div>

      <div class="decision-group">
        <h4>Si requiere accion</h4>
        <label>
          Proxima accion concreta
          <input data-field="nextAction" value="${escapeAttr(task.nextAction)}" placeholder="Ej: responder mail a Ana" />
        </label>
        <label>
          Responsable o persona esperada
          <input data-field="owner" value="${escapeAttr(task.owner)}" placeholder="Yo, nombre, equipo..." />
        </label>
        <label>
          Fecha limite si corresponde
          <input data-field="dueDate" type="date" value="${escapeAttr(task.dueDate)}" />
        </label>
        <button class="primary-button" data-process="${task.id}" data-target="done">
          Se hace en 2 minutos: marcar hecho
        </button>
        <button class="secondary-button" data-process="${task.id}" data-target="next">
          Es mia: enviar a proximas acciones
        </button>
        <button class="secondary-button" data-process="${task.id}" data-target="waiting">
          No es mia o depende de alguien: en espera
        </button>
        <button class="secondary-button" data-process="${task.id}" data-target="projects">
          Tiene varios pasos: proyecto
        </button>
      </div>
    </article>
  `;
}

function renderEmptyProcessing() {
  return `
    <article class="decision-card empty-decision">
      <h3>Inbox procesado</h3>
      <p>No queda nada para decidir. Ese es el objetivo de esta etapa.</p>
    </article>
  `;
}

function renderOrganizeTaskList(tasks) {
  if (!tasks.length) return `<div class="empty">Sin pendientes</div>`;
  return `
    <div class="task-list">
      ${tasks
        .map(
          (task) => `
            <article class="task-card organize-card ${state.selectedOrganizeTaskId === task.id ? "expanded" : ""}" data-task-id="${task.id}">
              <div class="organize-summary" data-open-organize-task="${task.id}">
                <h3>${escapeHtml(task.title)}</h3>
                <p>${escapeHtml(task.nextAction || task.owner || task.dueDate || "Sin detalle")}</p>
                <p class="task-meta">Ingresada: ${formatDate(task.createdAt)}</p>
              </div>
              <div class="mini-actions">
                <button class="icon-button" data-move-task="${task.id}" data-target="next" title="Mover a proximas acciones">A</button>
                <button class="icon-button" data-move-task="${task.id}" data-target="projects" title="Mover a proyectos">P</button>
                <button class="icon-button" data-move-task="${task.id}" data-target="waiting" title="Mover a en espera">E</button>
                <button class="icon-button" data-delete="${task.id}" title="Eliminar">x</button>
              </div>
              ${state.selectedOrganizeTaskId === task.id ? renderOrganizeDetails(task) : ""}
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderOrganizeDetails(task) {
  return `
    <div class="task-details">
      <button class="close-details" data-close-organize-task="${task.id}" title="Contraer tarea">×</button>
      <div class="detail-editor">
        <label>
          Titulo
          <input data-field="title" value="${escapeAttr(task.title)}" maxlength="120" />
        </label>
        <label>
          Proxima accion
          <input data-field="nextAction" value="${escapeAttr(task.nextAction)}" placeholder="Siguiente accion concreta" />
        </label>
        <label>
          Responsable / espera
          <input data-field="owner" value="${escapeAttr(task.owner)}" placeholder="Yo, nombre, equipo..." />
        </label>
        <label>
          Fecha limite
          <input data-field="dueDate" type="date" value="${escapeAttr(task.dueDate)}" />
        </label>
        <label class="wide">
          Notas
          <textarea data-field="notes" placeholder="Contexto, avances, links, decisiones...">${escapeHtml(task.notes)}</textarea>
        </label>
      </div>

      <div class="detail-history">
        <h4>Historial de esta tarea</h4>
        ${renderTaskHistory(task)}
      </div>
    </div>
  `;
}

function renderReviewCard(title, count, ok, hint) {
  return `
    <article class="review-card ${ok ? "ok" : "needs-work"}">
      <span>${count}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(hint)}</p>
    </article>
  `;
}

function renderReviewIssueList(tasks) {
  const uniqueTasks = [...new Map(tasks.map((task) => [task.id, task])).values()];
  if (!uniqueTasks.length) return `<div class="empty">Todo lo critico esta revisado.</div>`;
  return renderSimpleTaskList(uniqueTasks, "Todo lo critico esta revisado.");
}

function renderDoneList(tasks) {
  if (!tasks.length) return `<div class="empty">Todavia no cerraste tareas.</div>`;
  return `
    <div class="task-list">
      ${tasks
        .map(
          (task) => `
            <article class="task-card compact-card done-card">
              <div>
                <h3>${escapeHtml(task.title)}</h3>
                <p>Cerrada: ${formatDate(task.completedAt || task.updatedAt)}</p>
                <p class="task-meta">Ingresada: ${formatDate(task.createdAt)}</p>
                <p class="task-meta">${(task.history || []).length} movimientos registrados</p>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderDonePagination(total, pageCount) {
  if (total <= 5) return "";
  return `
    <div class="pagination">
      <button class="secondary-button" data-done-page="prev" ${state.donePage === 0 ? "disabled" : ""}>Anterior</button>
      <span>Pagina ${state.donePage + 1} de ${pageCount}</span>
      <button class="secondary-button" data-done-page="next" ${state.donePage >= pageCount - 1 ? "disabled" : ""}>Siguiente</button>
    </div>
  `;
}

function renderDoPanel(task) {
  const checklist = task.doneChecklist || {};
  return `
    <article class="decision-card" data-task-id="${task.id}">
      <p class="stage-label">Accion seleccionada</p>
      <h3>${escapeHtml(task.title)}</h3>
      <p>${escapeHtml(task.nextAction || "Defini la accion concreta antes de cerrar.")}</p>

      <label>
        Proxima accion concreta
        <input data-field="nextAction" value="${escapeAttr(task.nextAction)}" placeholder="Que accion concreta vas a hacer" />
      </label>
      <label>
        Nota de cierre
        <textarea data-field="notes" placeholder="Que paso, donde quedo, que se comunico...">${escapeHtml(task.notes)}</textarea>
      </label>

      <div class="decision-group">
        <h4>Done and Done</h4>
        <div class="checklist">
          <label><input type="checkbox" data-done-check="verified" ${checklist.verified ? "checked" : ""}> Verificada</label>
          <label><input type="checkbox" data-done-check="communicated" ${checklist.communicated ? "checked" : ""}> Comunicada</label>
          <label><input type="checkbox" data-done-check="closed" ${checklist.closed ? "checked" : ""}> Cerrada</label>
        </div>
        <button class="primary-button" data-complete-task="${task.id}">Cerrar tarea</button>
        <button class="secondary-button" data-log-action="${task.id}">Registrar avance realizado</button>
        <button class="secondary-button" data-move-task="${task.id}" data-target="waiting">Estoy esperando algo</button>
        <button class="secondary-button" data-move-task="${task.id}" data-target="projects">Convertir en proyecto</button>
      </div>
    </article>
  `;
}

function renderTaskHistory(task) {
  const history = task.history || [];
  if (!history.length) return `<div class="empty">Sin historial todavia.</div>`;
  const showAll = (state.expandedHistoryTaskIds || []).includes(task.id);
  const visibleHistory = showAll ? history : history.slice(-3);
  return `
    <ol class="history-list">
      ${visibleHistory
        .slice()
        .reverse()
        .map(
          (entry) => `
            <li>
              <strong>${escapeHtml(entry.text)}</strong>
              <span>${formatDate(entry.at)}</span>
            </li>
          `,
        )
        .join("")}
    </ol>
    ${
      history.length > 3
        ? `<button class="secondary-button history-toggle" data-toggle-task-history="${task.id}">${showAll ? "Ver menos" : `Ver historial completo (${history.length})`}</button>`
        : ""
    }
  `;
}

function getRecentHistory() {
  return state.tasks
    .flatMap((task) =>
      (task.history || []).map((entry) => ({
        ...entry,
        taskId: task.id,
        taskTitle: task.title,
      })),
    )
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 12);
}

function renderRecentHistory(entries) {
  if (!entries.length) return `<div class="empty">Todavia no hay movimientos registrados.</div>`;
  return `
    <ol class="history-list">
      ${entries
        .map(
          (entry) => `
            <li class="history-entry">
              <div>
                <strong>${escapeHtml(entry.taskTitle)}</strong>
                <p>${escapeHtml(entry.text)}</p>
                <span>${formatDate(entry.at)}</span>
              </div>
              <button class="icon-button" data-delete-history="${entry.id}" data-task-id="${entry.taskId}" title="Eliminar entrada">x</button>
            </li>
          `,
        )
        .join("")}
    </ol>
  `;
}

function renderHistoryPagination(total, pageCount) {
  if (total <= 5) return "";
  return `
    <div class="pagination">
      <button class="secondary-button" data-history-page="prev" ${state.historyPage === 0 ? "disabled" : ""}>Anterior</button>
      <span>Pagina ${state.historyPage + 1} de ${pageCount}</span>
      <button class="secondary-button" data-history-page="next" ${state.historyPage >= pageCount - 1 ? "disabled" : ""}>Siguiente</button>
    </div>
  `;
}

function renderEmptyDo() {
  return `
    <article class="decision-card empty-decision">
      <h3>No hay proximas acciones</h3>
      <p>Procesa el Inbox o revisa proyectos para elegir el siguiente avance.</p>
    </article>
  `;
}

function renderBubbles() {
  els.grid.innerHTML = "";
  els.grid.hidden = true;
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}

function escapeAttr(value = "") {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

document.addEventListener("click", (event) => {
  const closeOrganizeTask = event.target.closest("[data-close-organize-task]");
  if (closeOrganizeTask) {
    state.selectedOrganizeTaskId = "";
    saveAndRender();
    return;
  }

  if (
    state.selectedOrganizeTaskId &&
    state.currentView === "organize" &&
    !event.target.closest(".organize-card.expanded")
  ) {
    state.selectedOrganizeTaskId = "";
    saveAndRender();
    return;
  }

  const flowButton = event.target.closest("[data-view]");
  if (flowButton) {
    event.preventDefault();
    setView(flowButton.dataset.view);
    return;
  }

  if (event.target.closest("[data-open-data-file]")) {
    connectDataFile();
    return;
  }

  if (event.target.closest("[data-create-data-file]")) {
    createDataFile();
    return;
  }

  if (event.target.closest("[data-load-data-file]")) {
    loadFromDataFile();
    return;
  }

  if (event.target.closest("[data-save-data-file]")) {
    saveDataFileNow();
    return;
  }

  if (event.target.closest("[data-refresh-quick-inbox]")) {
    refreshQuickInbox();
    return;
  }

  if (event.target.closest("[data-import-quick-inbox]")) {
    importQuickInbox();
    return;
  }

  if (event.target.closest("[data-toggle-shortcut-help]")) {
    state.showShortcutHelp = !state.showShortcutHelp;
    saveAndRender();
    return;
  }

  const selectedId = event.target.closest("[data-select]")?.dataset.select;
  if (selectedId) {
    state.selectedTaskId = selectedId;
    saveAndRender();
    return;
  }

  const organizeTaskId = event.target.closest("[data-open-organize-task]")?.dataset.openOrganizeTask;
  if (organizeTaskId) {
    state.selectedOrganizeTaskId = state.selectedOrganizeTaskId === organizeTaskId ? "" : organizeTaskId;
    saveAndRender();
    return;
  }

  const deleteId = event.target.closest("[data-delete]")?.dataset.delete;
  if (deleteId) {
    deleteTask(deleteId);
    return;
  }

  const historyDeleteButton = event.target.closest("[data-delete-history]");
  if (historyDeleteButton) {
    deleteHistoryEntry(historyDeleteButton.dataset.taskId, historyDeleteButton.dataset.deleteHistory);
    return;
  }

  const taskHistoryToggle = event.target.closest("[data-toggle-task-history]");
  if (taskHistoryToggle) {
    toggleTaskHistory(taskHistoryToggle.dataset.toggleTaskHistory);
    return;
  }

  if (event.target.closest("[data-toggle-done-list]")) {
    state.reviewDoneOpen = !state.reviewDoneOpen;
    state.donePage = 0;
    saveAndRender();
    return;
  }

  const donePageButton = event.target.closest("[data-done-page]");
  if (donePageButton && !donePageButton.disabled) {
    state.donePage += donePageButton.dataset.donePage === "next" ? 1 : -1;
    if (state.donePage < 0) state.donePage = 0;
    saveAndRender();
    return;
  }

  const historyPageButton = event.target.closest("[data-history-page]");
  if (historyPageButton && !historyPageButton.disabled) {
    state.historyPage += historyPageButton.dataset.historyPage === "next" ? 1 : -1;
    if (state.historyPage < 0) state.historyPage = 0;
    saveAndRender();
    return;
  }

  const moveButton = event.target.closest("[data-move-task]");
  if (moveButton) {
    processTask(moveButton.dataset.moveTask, { bubble: moveButton.dataset.target });
    return;
  }

  const logActionId = event.target.closest("[data-log-action]")?.dataset.logAction;
  if (logActionId) {
    logActionDone(logActionId);
    return;
  }

  const completeId = event.target.closest("[data-complete-task]")?.dataset.completeTask;
  if (completeId) {
    completeTask(completeId);
    return;
  }

  const processButton = event.target.closest("[data-process]");
  if (!processButton) return;

  const task = state.tasks.find((item) => item.id === processButton.dataset.process);
  if (!task) return;

  const target = processButton.dataset.target;
  const patch = collectDecisionFields(task.id);

  if (target === "done") {
    processTask(task.id, {
      ...patch,
      bubble: "done",
      status: "done",
      doneChecklist: { verified: true, communicated: true, closed: true },
      completedAt: new Date().toISOString(),
    });
    return;
  }

  processTask(task.id, { ...patch, bubble: target });
});

document.addEventListener("submit", (event) => {
  const form = event.target.closest('[data-form="capture"]');
  if (!form) return;
  event.preventDefault();
  const title = String(new FormData(form).get("title") || "").trim();
  if (!title) return;
  createTask(title);
});

document.addEventListener("change", (event) => {
  const quickFileInput = event.target.closest("[data-quick-inbox-file]");
  if (quickFileInput) {
    const file = quickFileInput.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      setQuickInboxFromText(text, file.name);
      saveAndRender();
    });
    return;
  }

  const doneCheck = event.target.closest("[data-done-check]");
  if (doneCheck) {
    const taskId = doneCheck.closest("[data-task-id]")?.dataset.taskId;
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;
    updateTask(task.id, {
      doneChecklist: {
        ...(task.doneChecklist || {}),
        [doneCheck.dataset.doneCheck]: doneCheck.checked,
      },
    });
    return;
  }

  const field = event.target.closest("[data-field]");
  if (!field) return;
  const taskId = field.closest("[data-task-id]")?.dataset.taskId;
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const fieldName = field.dataset.field;
  let historyText = "";
  if (fieldName === "nextAction" && field.value.trim() && field.value !== task.nextAction) {
    historyText = `Proxima accion definida: ${field.value.trim()}`;
  }
  if (fieldName === "owner" && field.value.trim() && field.value !== task.owner) {
    historyText = `Responsable / espera: ${field.value.trim()}`;
  }
  updateTask(task.id, { [fieldName]: field.value }, historyText);
});

function collectDecisionFields(taskId) {
  const panel = document.querySelector(`[data-task-id="${taskId}"]`);
  if (!panel) return {};
  const fields = [...panel.querySelectorAll("[data-field]")];
  return fields.reduce((patch, field) => {
    patch[field.dataset.field] = field.value;
    return patch;
  }, {});
}

function parseQuickInbox(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(" | ");
      return separator >= 0 ? line.slice(separator + 3).trim() : line;
    })
    .filter(Boolean);
}

function setQuickInboxFromText(text, fileName = "inbox.txt") {
  quickInbox.fileName = fileName;
  quickInbox.lines = parseQuickInbox(text);
  quickInbox.status = quickInbox.lines.length
    ? `${quickInbox.lines.length} captura${quickInbox.lines.length === 1 ? "" : "s"} pendiente${quickInbox.lines.length === 1 ? "" : "s"} en ${fileName}`
    : `${fileName} no tiene capturas pendientes`;
}

function refreshQuickInbox() {
  if (location.protocol === "file:") {
    quickInbox.status = "Selecciona el archivo inbox.txt";
    const input = document.querySelector("[data-quick-inbox-file]");
    input?.click();
    saveAndRender();
    return;
  }

  fetch("inbox.txt", { cache: "no-store" })
    .then((response) => (response.ok ? response.text() : ""))
    .then((text) => {
      setQuickInboxFromText(text, "inbox.txt");
      saveAndRender();
    })
    .catch(() => {
      quickInbox.status = "No pude leer inbox.txt. Seleccionalo manualmente.";
      const input = document.querySelector("[data-quick-inbox-file]");
      input?.click();
      saveAndRender();
    });
}

function importQuickInbox() {
  if (!quickInbox.lines.length) return;
  createTasks(quickInbox.lines);
  quickInbox.lines = [];
  quickInbox.status = "Capturas importadas. Usa el atajo de vaciar para limpiar inbox.txt.";
  saveAndRender();
}

async function connectDataFile() {
  if (!dataFile.supported) {
    alert("Este navegador no permite elegir un archivo local de datos desde aca.");
    return;
  }
  try {
    const [handle] = await showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "Datos de Bubbles",
          accept: { "application/json": [".json"] },
        },
      ],
    });
    if (!(await hasDataFilePermission(handle, true))) {
      dataFile.status = "No se dio permiso para escribir en el archivo.";
      render();
      return;
    }
    dataFile.handle = handle;
    dataFile.name = handle.name;
    dataFile.connected = true;
    dataFile.autoSave = false;
    dataFile.status = `Archivo conectado: ${handle.name}. Carga sus datos o guarda los actuales.`;
    try {
      await storeDataFileHandle(handle);
    } catch {
      dataFile.status = `Archivo conectado: ${handle.name}. Chrome puede pedir elegirlo de nuevo mas adelante.`;
    }
    render();
  } catch (error) {
    if (error?.name === "AbortError") return;
    dataFile.status = "No pude conectar el archivo.";
    render();
  }
}

async function createDataFile() {
  if (!dataFile.supported) {
    alert("Este navegador no permite crear un archivo local de datos desde aca.");
    return;
  }
  try {
    const handle = await showSaveFilePicker({
      suggestedName: "bubbles-data.json",
      types: [
        {
          description: "Datos de Bubbles",
          accept: { "application/json": [".json"] },
        },
      ],
    });
    if (!(await hasDataFilePermission(handle, true))) {
      dataFile.status = "No se dio permiso para escribir en el archivo.";
      render();
      return;
    }
    dataFile.handle = handle;
    dataFile.name = handle.name;
    dataFile.connected = true;
    dataFile.autoSave = true;
    try {
      await storeDataFileHandle(handle);
    } catch {
      dataFile.status = `Archivo creado: ${handle.name}. Chrome puede pedir elegirlo de nuevo mas adelante.`;
    }
    await writeDataFile();
    render();
  } catch (error) {
    if (error?.name === "AbortError") return;
    dataFile.status = "No pude crear el archivo de datos.";
    render();
  }
}

async function loadFromDataFile() {
  if (!dataFile.handle) return;
  try {
    if (!(await hasDataFilePermission(dataFile.handle, true))) {
      dataFile.status = "No se dio permiso para leer el archivo.";
      render();
      return;
    }
    const file = await dataFile.handle.getFile();
    const text = await file.text();
    state = normalizeImportedState(JSON.parse(text));
    dataFile.connected = true;
    dataFile.autoSave = true;
    dataFile.status = `Datos cargados desde ${dataFile.name || dataFile.handle.name}`;
    saveAndRender();
  } catch {
    dataFile.status = "No pude cargar ese archivo de datos.";
    render();
  }
}

async function saveDataFileNow() {
  if (!dataFile.handle) return;
  try {
    if (!(await hasDataFilePermission(dataFile.handle, true))) {
      dataFile.status = "No se dio permiso para escribir en el archivo.";
      render();
      return;
    }
    dataFile.connected = true;
    dataFile.autoSave = true;
    await writeDataFile();
    render();
  } catch {
    dataFile.status = "No pude guardar en el archivo.";
    render();
  }
}

function completeTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  const checklist = task.doneChecklist || {};
  if (!checklist.verified || !checklist.communicated || !checklist.closed) {
    alert("Para cerrar: marca verificada, comunicada y cerrada.");
    return;
  }
  updateTask(
    id,
    { bubble: "done", status: "done", completedAt: new Date().toISOString() },
    "Cerrada Done and Done",
  );
}

function logActionDone(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  const action = task.nextAction.trim();
  if (!action) {
    alert("Defini una proxima accion antes de registrarla como realizada.");
    return;
  }
  updateTask(id, {}, `Accion realizada: ${action}`);
}

function deleteHistoryEntry(taskId, historyId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  updateTask(task.id, {
    history: (task.history || []).filter((entry) => entry.id !== historyId),
  });
}

function toggleTaskHistory(taskId) {
  const expanded = new Set(state.expandedHistoryTaskIds || []);
  if (expanded.has(taskId)) {
    expanded.delete(taskId);
  } else {
    expanded.add(taskId);
  }
  state.expandedHistoryTaskIds = [...expanded];
  saveAndRender();
}

render();
initStoredDataFile();
