const app = document.getElementById("app");

const ENTITY_KEYS = [
  "campaigns",
  "coteries",
  "characters",
  "factions",
  "locations",
  "events",
  "facts",
  "clues",
  "storylines",
  "theories",
  "notes",
  "memoirs",
  "investigationBoards",
];

const RELATION_ENTITY_KEYS = ENTITY_KEYS.filter((key) => key !== "investigationBoards");
const GRAPH_ENTITY_KEYS = ENTITY_KEYS.filter((key) => !["campaigns", "investigationBoards"].includes(key));
const BOARD_ENTITY_KEYS = [
  "storylines",
  "events",
  "facts",
  "clues",
  "theories",
  "notes",
  "characters",
  "factions",
  "locations",
  "memoirs",
];
const DEFAULT_EDGE_COLOR = "#c8a85a";
const DEFAULT_NODE_COLOR = "#171a21";
const DEFAULT_COTERIE_NODE_COLOR = "#441923";
const DEFAULT_NODE_TEXT_COLOR = "#eee8dc";
const UNKNOWN_OPTION = "Не известно";
const BOARD_CANVAS_WIDTH = 2100;
const BOARD_CANVAS_HEIGHT = 1360;
const BOARD_CARD_DEFAULT_WIDTH = 280;
const BOARD_CARD_DEFAULT_HEIGHT = 170;
const BOARD_CARD_MIN_WIDTH = 220;
const BOARD_CARD_MIN_HEIGHT = 130;
const GRAPH_WIDTH = 1100;
const GRAPH_HEIGHT = 640;

const OPTIONS = {
  characterType: ["Игровой персонаж", "NPC"],
  characterStatus: ["Активен", "Пропал", "Мертв", "Вне сцены", "Неизвестно"],
  characterSpecies: [UNKNOWN_OPTION, "Вампир", "Человек", "Гару", "Маг", "Фея", "Демон"],
  vampireClan: [
    UNKNOWN_OPTION,
    "Бруха",
    "Вентру",
    "Тореадор",
    "Малкавиан",
    "Носферату",
    "Тремер",
    "Гангрел",
    "Ласомбра",
    "Цимисхи",
    "Ассамиты",
    "Равнос",
    "Салюбри",
    "Каитифф",
    "Тонкокровный",
  ],
  garouTribe: [
    UNKNOWN_OPTION,
    "Черные Фурии",
    "Костегрызы",
    "Дети Геи",
    "Фианна",
    "Потомки Фенрира",
    "Стеклоходы",
    "Красные Когти",
    "Повелители Тени",
    "Молчаливые Странники",
    "Серебряные Клыки",
    "Звездочеты",
    "Уктена",
    "Вендиго",
  ],
  locationLevel: ["Город", "Место в городе"],
  reliability: ["Подтверждено", "Вероятно", "Сомнительно", "Ложь", "Неизвестно"],
  storylineStatus: ["Активна", "Пауза", "Закрыта", "Провалена"],
  theoryStatus: ["Черновик", "Обсуждается", "Подтверждена", "Опровергнута"],
  relationshipLabels: [
    "связано",
    "подозревает",
    "союзник",
    "враг",
    "член",
    "участник",
    "источник",
    "доказательство",
    "опровергает",
    "подтверждает",
    "произошло в",
    "обнаружил",
    "знает",
    "упоминает",
  ],
};

const CONFIG = {
  campaigns: {
    label: "Кампания",
    singular: "Кампания",
    description: "Название, описание и сеттинг общей хроники.",
    title: (record) => record.title || "Без названия",
    summary: (record) => record.description || record.setting || "",
    fields: [
      { key: "title", label: "Название", kind: "text", required: true },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
      { key: "setting", label: "Сеттинг", kind: "text", wide: true },
    ],
  },
  coteries: {
    label: "Котерия",
    singular: "Котерия",
    description: "Общий центр игровых персонажей, их целей, убежища и внутренних заметок.",
    title: (record) => record.name || "Котерия",
    summary: (record) => record.description || record.goals || record.notes || "",
    fields: [
      { key: "name", label: "Название", kind: "text", required: true },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
      { key: "goals", label: "Общие цели", kind: "textarea", wide: true },
      { key: "haven", label: "Убежище / база", kind: "text", wide: true },
      {
        key: "memberIds",
        label: "Персонажи игроков",
        kind: "multiRef",
        entity: "characters",
        filter: (item) => isPlayerCharacter(item),
        wide: true,
      },
      { key: "notes", label: "Заметки", kind: "textarea", wide: true },
    ],
  },
  characters: {
    label: "Персонажи",
    singular: "Персонаж",
    description: "Игровые персонажи и NPC, их статус, связи и заметки.",
    title: (record) => record.name || "Без имени",
    summary: (record) => record.description || record.notes || "",
    fields: [
      { key: "name", label: "Имя", kind: "text", required: true },
      { key: "characterType", label: "Тип", kind: "select", options: OPTIONS.characterType },
      { key: "species", label: "Вид", kind: "select", options: OPTIONS.characterSpecies },
      {
        key: "vampireClan",
        label: "Клан",
        kind: "select",
        options: OPTIONS.vampireClan,
        visibleWhen: { field: "species", values: ["Вампир"] },
      },
      {
        key: "garouTribe",
        label: "Племя",
        kind: "select",
        options: OPTIONS.garouTribe,
        visibleWhen: { field: "species", values: ["Гару"] },
      },
      { key: "status", label: "Статус", kind: "select", options: OPTIONS.characterStatus },
      { key: "coterieId", label: "Котерия", kind: "ref", entity: "coteries" },
      { key: "factionId", label: "Фракция", kind: "ref", entity: "factions" },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
      { key: "notes", label: "Заметки", kind: "textarea", wide: true },
    ],
  },
  factions: {
    label: "Фракции",
    singular: "Фракция",
    description: "Организации, их цели, участники, союзники и враги.",
    title: (record) => record.name || "Без названия",
    summary: (record) => record.description || record.goals || record.notes || "",
    fields: [
      { key: "name", label: "Название", kind: "text", required: true },
      { key: "factionType", label: "Тип", kind: "text", placeholder: "клан, котерия, культ, корпорация..." },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
      { key: "goals", label: "Цели", kind: "textarea", wide: true },
      { key: "memberIds", label: "Участники", kind: "multiRef", entity: "characters", wide: true },
      { key: "allyIds", label: "Союзники", kind: "multiRef", entity: "factions" },
      { key: "enemyIds", label: "Враги", kind: "multiRef", entity: "factions" },
      { key: "notes", label: "Заметки", kind: "textarea", wide: true },
    ],
  },
  locations: {
    label: "Локации",
    singular: "Локация",
    description: "Только два уровня: город и место в городе. Мелкие зоны остаются в описаниях событий.",
    title: (record) => record.name || "Без названия",
    summary: (record) => record.description || record.notes || "",
    fields: [
      { key: "name", label: "Название", kind: "text", required: true },
      { key: "level", label: "Уровень", kind: "select", options: OPTIONS.locationLevel },
      {
        key: "parentCityId",
        label: "Город-родитель",
        kind: "ref",
        entity: "locations",
        filter: (item) => item.level === "Город",
        hint: "Заполняется только для места в городе.",
      },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
      { key: "notes", label: "Заметки", kind: "textarea", wide: true },
    ],
  },
  events: {
    label: "События",
    singular: "Событие",
    description: "Что произошло, когда, где, кто участвовал и какие последствия остались.",
    title: (record) => record.title || "Без названия",
    summary: (record) => record.description || record.consequence || record.notes || "",
    fields: [
      { key: "title", label: "Название", kind: "text", required: true },
      { key: "gameDate", label: "Игровая дата", kind: "date" },
      { key: "gameTime", label: "Время", kind: "time" },
      {
        key: "cityId",
        label: "Город",
        kind: "ref",
        entity: "locations",
        filter: (item) => item.level === "Город",
      },
      {
        key: "placeId",
        label: "Место",
        kind: "ref",
        entity: "locations",
        filter: (item) => item.level === "Место в городе",
      },
      { key: "participantIds", label: "Участники", kind: "multiRef", entity: "characters", wide: true },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
      { key: "consequence", label: "Последствия", kind: "textarea", wide: true },
      { key: "notes", label: "Заметки", kind: "textarea", wide: true },
    ],
  },
  facts: {
    label: "Факты",
    singular: "Факт",
    description: "Формулировки знаний с источником, достоверностью и связанным событием.",
    title: (record) => record.statement || "Без формулировки",
    summary: (record) => record.notes || record.source || "",
    fields: [
      { key: "statement", label: "Формулировка", kind: "textarea", required: true, wide: true },
      { key: "source", label: "Источник", kind: "text" },
      { key: "reliability", label: "Достоверность", kind: "select", options: OPTIONS.reliability },
      { key: "eventId", label: "Связанное событие", kind: "ref", entity: "events" },
      { key: "notes", label: "Заметки", kind: "textarea", wide: true },
    ],
  },
  clues: {
    label: "Улики",
    singular: "Улика",
    description: "Материальные, свидетельские и косвенные улики с источником, достоверностью и происхождением.",
    title: (record) => record.title || "Без названия",
    summary: (record) => record.description || record.notes || "",
    fields: [
      { key: "title", label: "Название", kind: "text", required: true },
      { key: "clueType", label: "Тип", kind: "text", placeholder: "улика, свидетельство, документ..." },
      { key: "source", label: "Источник", kind: "text" },
      { key: "reliability", label: "Достоверность", kind: "select", options: OPTIONS.reliability },
      { key: "eventId", label: "Связанное событие", kind: "ref", entity: "events" },
      { key: "discoveredByIds", label: "Кем обнаружена", kind: "multiRef", entity: "characters", wide: true },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
      { key: "notes", label: "Заметки", kind: "textarea", wide: true },
    ],
  },
  storylines: {
    label: "Сюжетные линии",
    singular: "Сюжетная линия",
    description: "Активные и закрытые линии, открытые вопросы и заметки.",
    title: (record) => record.title || "Без названия",
    summary: (record) => record.description || record.openQuestions || record.notes || "",
    fields: [
      { key: "title", label: "Название", kind: "text", required: true },
      { key: "status", label: "Статус", kind: "select", options: OPTIONS.storylineStatus },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
      { key: "openQuestions", label: "Открытые вопросы", kind: "textarea", wide: true },
      { key: "notes", label: "Заметки", kind: "textarea", wide: true },
    ],
  },
  theories: {
    label: "Теории",
    singular: "Теория",
    description: "Только ручные версии игроков, связанные с фактами, уликами и событиями.",
    title: (record) => record.title || "Без названия",
    summary: (record) => record.description || record.notes || "",
    fields: [
      { key: "title", label: "Название", kind: "text", required: true },
      { key: "status", label: "Статус", kind: "select", options: OPTIONS.theoryStatus },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
      { key: "notes", label: "Заметки", kind: "textarea", wide: true },
    ],
  },
  notes: {
    label: "Заметки",
    singular: "Заметка",
    description: "Ручные заметки для доски расследования: краткие наблюдения, вопросы и рабочие пометки.",
    title: (record) => record.title || "Без названия",
    summary: (record) => record.text || record.notes || "",
    fields: [
      { key: "title", label: "Название", kind: "text", required: true },
      { key: "text", label: "Текст", kind: "textarea", wide: true },
      { key: "notes", label: "Заметки", kind: "textarea", wide: true },
    ],
  },
  memoirs: {
    label: "Мемуары",
    singular: "Запись мемуаров",
    description: "Записи от лица персонажей: настроение, планы, подозрения и связи.",
    title: (record) => `${titleOf("characters", record.authorId) || "Без автора"}: ${record.entryDate || "без даты"}`,
    summary: (record) => record.text || record.suspicions || record.plans || "",
    fields: [
      { key: "authorId", label: "Автор", kind: "ref", entity: "characters", required: true, filter: (item) => isPlayerCharacter(item) },
      { key: "entryDate", label: "Дата", kind: "date" },
      { key: "mood", label: "Настроение", kind: "text" },
      { key: "text", label: "Текст", kind: "textarea", required: true, wide: true },
      { key: "plans", label: "Планы", kind: "textarea", wide: true },
      { key: "suspicions", label: "Подозрения", kind: "textarea", wide: true },
      { key: "eventIds", label: "Связанные события", kind: "multiRef", entity: "events", wide: true },
      { key: "characterIds", label: "Связанные персонажи", kind: "multiRef", entity: "characters", wide: true },
    ],
  },
  investigationBoards: {
    label: "Доски расследования",
    singular: "Доска расследования",
    description: "Именованные canvas-доски для активных дел и клубков расследования.",
    title: (record) => record.name || "Без названия",
    summary: (record) => record.description || "",
    fields: [
      { key: "name", label: "Название", kind: "text", required: true },
      { key: "status", label: "Статус", kind: "select", options: ["Активна", "Архив"] },
      { key: "storylineId", label: "Связанная сюжетная линия", kind: "ref", entity: "storylines" },
      { key: "description", label: "Описание", kind: "textarea", wide: true },
    ],
  },
};

const state = {
  auth: false,
  loading: true,
  error: "",
  data: emptyData(),
  relationships: [],
  view: "dashboard",
  editor: null,
  detail: null,
  justCreated: null,
  relationDrafts: {},
  editingRelationshipId: "",
  boardId: "",
  boardSelectedKey: "",
  boardSelectedGroupId: "",
  boardSelectedRelationshipId: "",
  boardSuggestionKey: "",
  boardSuggestionUntil: 0,
  boardContextMenu: null,
  boardAddType: "all",
  boardAddSearch: "",
  boardConnection: null,
  drag: null,
  graphRuntime: null,
  graphViewport: { x: 0, y: 0, zoom: 1 },
  suppressClickUntil: 0,
  search: "",
  filters: {
    investigationStatus: "all",
    investigationReliability: "all",
    timelineCharacter: "all",
    timelineLocation: "all",
    timelineStoryline: "all",
  },
  graphTypes: Object.fromEntries(GRAPH_ENTITY_KEYS.map((key) => [key, true])),
  graphFocusKey: "",
  graphDepth: "all",
  graphCharacterStatuses: Object.fromEntries(OPTIONS.characterStatus.map((status) => [status, true])),
  graphSelectedNodeKey: "",
  graphSelectedEdgeId: "",
};

let boardViewportSaveTimer = 0;
let boardSuggestionTimer = 0;

function emptyData() {
  return Object.fromEntries(ENTITY_KEYS.map((key) => [key, []]));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

async function boot() {
  try {
    const session = await api("/api/session");
    state.auth = Boolean(session.authenticated);
    if (state.auth) {
      await loadData();
    }
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    render();
  }
}

async function loadData() {
  const data = await api("/api/bootstrap");
  state.data = emptyData();
  for (const key of ENTITY_KEYS) {
    state.data[key] = data[key] || [];
  }
  state.relationships = uniqueRelationships(data.relationships || []);
  const boards = getRecords("investigationBoards");
  if (!boards.some((board) => board.id === state.boardId)) {
    state.boardId = boards.find((board) => board.status !== "Архив")?.id || boards[0]?.id || "";
  }
}

function render() {
  const activeId = document.activeElement?.id;
  const activeBoardSearch = document.activeElement?.dataset?.boardAddSearch !== undefined;
  if (state.loading) {
    app.innerHTML = `<div class="boot-screen"><div><div class="brand-mark">VC</div><p>Загрузка хроники...</p></div></div>`;
    return;
  }
  if (!state.auth) {
    app.innerHTML = renderLogin();
    return;
  }
  app.innerHTML = `
    <div class="shell">
      ${renderSidebar()}
      <main class="main">
        ${renderTopbar()}
        <section class="content">
          ${state.error ? `<div class="error">${escapeHtml(state.error)}</div>` : ""}
          ${renderContent()}
        </section>
      </main>
    </div>
    ${renderModal()}
    ${renderBoardContextMenu()}
  `;
  if (activeId === "globalSearch") {
    const search = document.getElementById("globalSearch");
    search?.focus();
    search?.setSelectionRange(state.search.length, state.search.length);
  }
  if (activeBoardSearch) {
    const search = document.querySelector("[data-board-add-search]");
    search?.focus();
    search?.setSelectionRange(state.boardAddSearch.length, state.boardAddSearch.length);
  }
  window.requestAnimationFrame(initInteractiveSurfaces);
}

function renderLogin() {
  return `
    <main class="login-screen">
      <form id="loginForm" class="login-card">
        <div class="brand-mark">VC</div>
        <h1>Veerhau's Companion</h1>
        <p>Закрытая хроника кампании. Введите общий пароль, чтобы открыть данные.</p>
        ${state.error ? `<div class="error">${escapeHtml(state.error)}</div>` : ""}
        <div class="field">
          <label for="password">Пароль</label>
          <input id="password" name="password" type="password" autocomplete="current-password" autofocus />
        </div>
        <div class="actions" style="margin-top: 16px;">
          <button class="btn primary" type="submit">Войти</button>
        </div>
        <p class="tiny">По умолчанию для локального запуска: <strong>veerhau</strong>. Лучше задать свой через CHRONICLE_PASSWORD.</p>
      </form>
    </main>
  `;
}

function renderSidebar() {
  const entityNav = ENTITY_KEYS.filter((key) => !["campaigns", "coteries", "memoirs", "investigationBoards"].includes(key))
    .map((key) => navButton(key, CONFIG[key].label, visibleData(key).length))
    .join("");
  return `
    <aside class="sidebar">
      <div class="sidebar-head">
        <div class="brand-mark">VC</div>
        <div>
          <div class="sidebar-title">Хроника</div>
          <div class="sidebar-subtitle">World of Darkness dossier</div>
        </div>
      </div>
      <div class="nav-section">Кампания</div>
      ${navButton("dashboard", "Главная", "")}
      ${navButton("campaigns", "Кампания", visibleData("campaigns").length)}
      ${navButton("coteries", "Котерия", visibleData("characters").filter(isPlayerCharacter).length)}
      <div class="nav-section">Данные</div>
      ${entityNav}
      <div class="nav-section">Инструменты</div>
      ${navButton("investigation", "Доска расследования", "")}
      ${navButton("graph", "Граф связей", "")}
      ${navButton("timeline", "Таймлайн", "")}
      ${navButton("search", "Поиск", "")}
    </aside>
  `;
}

function navButton(view, label, count) {
  const active = state.view === view ? "active" : "";
  return `
    <button class="nav-button ${active}" type="button" data-action="nav" data-view="${view}">
      <span>${escapeHtml(label)}</span>
      ${count !== "" ? `<span class="count-pill">${count}</span>` : ""}
    </button>
  `;
}

function renderTopbar() {
  return `
    <header class="topbar">
      <input id="globalSearch" class="search-input" type="search" placeholder="Поиск по хронике..." value="${escapeAttr(state.search)}" />
      <button class="btn ghost" type="button" data-action="logout">Выйти</button>
    </header>
  `;
}

function renderContent() {
  if (state.search.trim() && state.view !== "search") {
    return renderSearch();
  }
  if (state.view === "dashboard") return renderDashboard();
  if (state.view === "coteries") return renderCoteriePage();
  if (ENTITY_KEYS.includes(state.view)) return renderEntityPage(state.view);
  if (state.view === "investigation") return renderInvestigation();
  if (state.view === "graph") return renderGraph();
  if (state.view === "timeline") return renderTimeline();
  if (state.view === "search") return renderSearch();
  return renderDashboard();
}

function renderDashboard() {
  const campaign = getRecords("campaigns")[0];
  const recentEvents = visibleData("events").sort(compareEventsDesc).slice(0, 4);
  const activeStorylines = visibleData("storylines").filter((item) => (item.status || "Активна") === "Активна").slice(0, 4);
  const keyClues = visibleData("clues").filter((item) => ["Подтверждено", "Вероятно", ""].includes(item.reliability || "")).slice(0, 4);
  return `
    <div class="view-head">
      <div>
        <h1>${escapeHtml(campaign ? CONFIG.campaigns.title(campaign) : "Хроника")}</h1>
        <p>${escapeHtml(campaign?.description || "Структурированная база знаний кампании.")}</p>
      </div>
      <div class="actions">
        ${campaign ? `<button class="btn" data-action="edit" data-entity="campaigns" data-id="${campaign.id}">Редактировать кампанию</button>` : ""}
        <button class="btn primary" data-action="new" data-entity="events">Новое событие</button>
      </div>
    </div>
    <div class="metric-grid">
      ${metric("Персонажи", visibleData("characters").length)}
      ${metric("События", visibleData("events").length)}
      ${metric("Факты", visibleData("facts").length)}
      ${metric("Улики", visibleData("clues").length)}
      ${metric("Активные линии", activeStorylines.length)}
    </div>
    <div class="grid two">
      <section class="panel">
        <div class="view-head">
          <div><h2>Активные сюжетные линии</h2><p>Открытые вопросы и незакрытые дела.</p></div>
          <button class="btn ghost" data-action="nav" data-view="storylines">Все</button>
        </div>
        ${activeStorylines.length ? activeStorylines.map((item) => renderRecordCard("storylines", item)).join("") : emptyState("Нет активных сюжетных линий.", "storylines")}
      </section>
      <section class="panel">
        <div class="view-head">
          <div><h2>Недавние события</h2><p>Последние записи таймлайна.</p></div>
          <button class="btn ghost" data-action="nav" data-view="timeline">Таймлайн</button>
        </div>
        ${recentEvents.length ? recentEvents.map((item) => renderRecordCard("events", item)).join("") : emptyState("События еще не добавлены.", "events")}
      </section>
      <section class="panel">
        <div class="view-head">
          <div><h2>Важные улики</h2><p>Подтвержденные и вероятные зацепки.</p></div>
          <button class="btn ghost" data-action="nav" data-view="clues">Все</button>
        </div>
        ${keyClues.length ? keyClues.map((item) => renderRecordCard("clues", item)).join("") : emptyState("Улик пока нет.", "clues")}
      </section>
      <section class="panel">
        <h2>Быстрые действия</h2>
        <p>Добавляй структурированные записи прямо во время сессии.</p>
        <div class="actions">
          ${["facts", "clues", "events", "theories"].map((entity) => `
            <button class="btn" data-action="new" data-entity="${entity}">Создать: ${CONFIG[entity].singular}</button>
          `).join("")}
        </div>
      </section>
    </div>
  `;
}

function metric(label, value) {
  return `<div class="metric"><div class="metric-value">${value}</div><div class="metric-label">${escapeHtml(label)}</div></div>`;
}

function renderCoteriePage() {
  const coterie = visibleData("coteries")[0] || getRecords("coteries")[0];
  const members = coterie
    ? coterieMembers(coterie)
    : visibleData("characters").filter(isPlayerCharacter);
  return `
    <div class="view-head">
      <div>
        <h1>Котерия</h1>
        <p>Игровые персонажи, их общая группа и личные мемуары. NPC остаются в общем разделе персонажей.</p>
      </div>
      <div class="actions">
        ${coterie ? `<button class="btn" data-action="edit" data-entity="coteries" data-id="${coterie.id}">Редактировать котерию</button>` : `<button class="btn primary" data-action="new" data-entity="coteries">Создать котерию</button>`}
      </div>
    </div>
    <div class="entity-layout">
      <div class="entity-main">
        <section class="coterie-hero">
          <div class="coterie-core">
            <div class="badge gold">Центр группы</div>
            <h2>${escapeHtml(coterie ? CONFIG.coteries.title(coterie) : "Котерия не создана")}</h2>
            <p>${escapeHtml(coterie?.description || "Здесь живет общее досье игровых персонажей.")}</p>
            ${coterie?.goals ? `<p><strong>Цели:</strong> ${escapeHtml(coterie.goals)}</p>` : ""}
            ${coterie?.haven ? `<p><strong>Убежище:</strong> ${escapeHtml(coterie.haven)}</p>` : ""}
          </div>
          <div class="coterie-members">
            ${members.length ? members.map(renderPlayerCharacterCard).join("") : `<div class="empty-state">Персонажи игроков пока не привязаны к котерии.</div>`}
          </div>
        </section>
      </div>
      ${renderEntityStyleSidebar("coteries", coterie ? [coterie] : [])}
    </div>
  `;
}

function renderPlayerCharacterCard(character) {
  const memoirs = visibleData("memoirs")
    .filter((memoir) => memoir.authorId === character.id)
    .sort((a, b) => (b.entryDate || "").localeCompare(a.entryDate || ""))
    .slice(0, 3);
  return `
    <article class="card player-card">
      <div class="badge-row">
        <span class="badge blue">Персонаж игрока</span>
        ${character.status ? `<span class="badge ${character.status === "Активен" ? "green" : "blood"}">${escapeHtml(character.status)}</span>` : ""}
      </div>
      <h3>${escapeHtml(CONFIG.characters.title(character))}</h3>
      ${character.description ? `<p>${escapeHtml(character.description)}</p>` : `<p class="muted">Описание пока не заполнено.</p>`}
      <div class="memoir-mini-list">
        <div class="tiny muted">Мемуары</div>
        ${memoirs.length ? memoirs.map((memoir) => `
          <button class="memoir-mini" data-action="detail" data-entity="memoirs" data-id="${memoir.id}">
            <span>${escapeHtml(memoir.entryDate || "без даты")}</span>
            <span>${escapeHtml(truncate(memoir.text, 82))}</span>
          </button>
        `).join("") : `<div class="tiny muted">Записей пока нет.</div>`}
      </div>
      <div class="card-footer">
        <button class="btn ghost" data-action="detail" data-entity="characters" data-id="${character.id}">Карточка</button>
        <button class="btn" data-action="new-memoir" data-character-id="${character.id}">Новая запись</button>
      </div>
    </article>
  `;
}

function renderEntityPage(entity) {
  const config = CONFIG[entity];
  const records = visibleData(entity);
  const canCreate = entity !== "campaigns";
  const styleSidebar = renderEntityStyleSidebar(entity, records);
  return `
    <div class="view-head">
      <div>
        <h1>${escapeHtml(config.label)}</h1>
        <p>${escapeHtml(config.description)}</p>
      </div>
      <div class="actions">
        ${canCreate ? `<button class="btn primary" data-action="new" data-entity="${entity}">Создать</button>` : ""}
      </div>
    </div>
    <div class="${styleSidebar ? "entity-layout" : ""}">
      <div class="entity-main">
        ${entity === "theories" ? `<div class="notice">Теории создаются только вручную. В приложении нет автоматических предложений и генерации теорий.</div>` : ""}
        ${entity === "locations" ? `<div class="notice">Локации ограничены двумя уровнями: город и место в городе. Комнаты, коридоры и парковки фиксируются в описании события.</div>` : ""}
        <div class="grid cards">
          ${records.length ? records.map((record) => renderRecordCard(entity, record)).join("") : emptyState(`В разделе "${config.label}" пока пусто.`, entity)}
        </div>
      </div>
      ${styleSidebar}
    </div>
  `;
}

function renderEntityStyleSidebar(entity, records) {
  if (!GRAPH_ENTITY_KEYS.includes(entity)) return "";
  const style = graphTypeStyle(entity);
  const color = style.nodeColor || baseNodeColor(entity);
  const textColor = style.textColor || DEFAULT_NODE_TEXT_COLOR;
  const scale = graphTypeScale(entity);
  const overriddenCount = records.filter((record) => record.graphNodeColor || record.graphNodeScale || record.graphTextColor).length;
  return `
    <aside class="entity-style-panel">
      <h2>Настройка стиля</h2>
      <p class="tiny muted">Дефолтный вид узлов этого типа на графе связей. Индивидуальные настройки конкретных узлов имеют приоритет.</p>
      <div class="node-style-preview">
        <span class="node-style-dot" style="--node-color: ${escapeAttr(color)}; --node-text-color: ${escapeAttr(textColor)}; --node-scale: ${scale};">Aa</span>
        <div>
          <div>${escapeHtml(CONFIG[entity].label)}</div>
          <div class="tiny muted">${records.length} узл.</div>
        </div>
      </div>
      <div class="field">
        <label>Цвет узлов</label>
        <input type="color" value="${escapeAttr(color)}" data-entity-style-color data-entity="${entity}" />
      </div>
      <div class="field">
        <label>Цвет текста</label>
        <input type="color" value="${escapeAttr(textColor)}" data-entity-style-text-color data-entity="${entity}" />
      </div>
      <div class="field">
        <label>Размер узлов: ${Math.round(scale * 100)}%</label>
        <input type="range" min="60" max="190" step="5" value="${Math.round(scale * 100)}" data-entity-style-scale data-entity="${entity}" />
      </div>
      <div class="actions">
        <button class="btn ghost" data-action="reset-entity-style" data-entity="${entity}">Сбросить стиль типа</button>
        <button class="btn ghost" data-action="nav" data-view="graph">Открыть граф</button>
      </div>
      ${overriddenCount ? `<div class="notice tiny">${overriddenCount} узл. имеют индивидуальный стиль и не будут брать этот дефолт.</div>` : ""}
    </aside>
  `;
}

function renderRecordCard(entity, record) {
  const config = CONFIG[entity];
  const title = config.title(record);
  const summary = truncate(config.summary(record), 220);
  return `
    <article class="card">
      <h3>${escapeHtml(title)}</h3>
      ${renderBadges(entity, record)}
      ${summary ? `<p>${escapeHtml(summary)}</p>` : `<p class="muted">Описание пока не заполнено.</p>`}
      <div class="card-footer">
        <span class="tiny muted">${escapeHtml(config.singular)}</span>
        <div class="actions">
          <button class="btn ghost" data-action="detail" data-entity="${entity}" data-id="${record.id}">Открыть</button>
          <button class="btn ghost" data-action="edit" data-entity="${entity}" data-id="${record.id}">Править</button>
          ${entity !== "campaigns" ? `<button class="btn danger" data-action="delete" data-entity="${entity}" data-id="${record.id}">Удалить</button>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderBadges(entity, record) {
  const badges = [];
  if (record.status) badges.push({ text: record.status, tone: record.status === "Активна" || record.status === "Активен" ? "green" : "blood" });
  if (record.reliability) badges.push({ text: record.reliability, tone: reliabilityTone(record.reliability) });
  if (record.characterType) badges.push({ text: record.characterType, tone: "blue" });
  if (entity === "characters" && record.species) badges.push({ text: record.species, tone: "gold" });
  if (entity === "characters" && record.species === "Вампир" && record.vampireClan) badges.push({ text: `Клан: ${record.vampireClan}`, tone: "blood" });
  if (entity === "characters" && record.species === "Гару" && record.garouTribe) badges.push({ text: `Племя: ${record.garouTribe}`, tone: "green" });
  if (record.factionType) badges.push({ text: record.factionType, tone: "blue" });
  if (record.level) badges.push({ text: record.level, tone: "gold" });
  if (record.gameDate || record.entryDate) badges.push({ text: [record.gameDate || record.entryDate, record.gameTime].filter(Boolean).join(" "), tone: "gold" });
  if (record.source) badges.push({ text: `Источник: ${record.source}`, tone: "" });
  if (record.factionId) badges.push({ text: titleOf("factions", record.factionId), tone: "gold" });
  if (!badges.length) return "";
  return `<div class="badge-row">${badges.map((badge) => `<span class="badge ${badge.tone}">${escapeHtml(badge.text)}</span>`).join("")}</div>`;
}

function reliabilityTone(value) {
  if (value === "Подтверждено") return "green";
  if (value === "Вероятно") return "gold";
  if (value === "Ложь") return "blood";
  return "";
}

function renderInvestigation() {
  const boards = getRecords("investigationBoards");
  const board = currentBoard();
  if (!boards.length || !board) {
    return `
      <div class="view-head">
        <div>
          <h1>Доска расследования</h1>
          <p>Именованные canvas-доски для активных дел, улик, версий и связей.</p>
        </div>
        <button class="btn primary" data-action="new" data-entity="investigationBoards">Создать доску</button>
      </div>
      <div class="empty-state">Досок пока нет. Создайте первую доску расследования.</div>
    `;
  }
  const items = boardItems(board);
  const viewport = boardViewport(board);
  const canvasWidth = Math.round(BOARD_CANVAS_WIDTH * viewport.zoom);
  const canvasHeight = Math.round(BOARD_CANVAS_HEIGHT * viewport.zoom);
  return `
    <div class="view-head">
      <div>
        <h1>${escapeHtml(CONFIG.investigationBoards.title(board))}</h1>
        <p>${escapeHtml(board.description || "Рабочий canvas активного расследования: добавляйте элементы вручную, связывайте их и раскладывайте по группам.")}</p>
      </div>
      <div class="actions">
        <button class="btn primary" data-action="new" data-entity="investigationBoards">Новая доска</button>
        <button class="btn ghost" data-action="edit" data-entity="investigationBoards" data-id="${board.id}">Настройки</button>
        <button class="btn ghost" data-action="board-add-group">Новая группа</button>
        <button class="btn ghost" data-action="board-archive" data-board-id="${board.id}">В архив</button>
      </div>
    </div>
    <div class="board-toolbar">
      <div class="field">
        <label>Доска</label>
        <select data-board-select>
          ${boards.map((item) => `<option value="${item.id}" ${board.id === item.id ? "selected" : ""}>${escapeHtml(CONFIG.investigationBoards.title(item))}${item.status === "Архив" ? " · архив" : ""}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Связанная линия</label>
        <select data-board-storyline data-board-id="${board.id}">
          <option value="">Не привязана</option>
          ${getRecords("storylines").map((storyline) => `<option value="${storyline.id}" ${board.storylineId === storyline.id ? "selected" : ""}>${escapeHtml(CONFIG.storylines.title(storyline))}</option>`).join("")}
        </select>
      </div>
      <div class="notice tiny">Тяните элементы из правой панели на доску, двигайте карточки и группы. Угол карточки или группы меняет размер; колесо меняет масштаб.</div>
    </div>
    <div class="investigation-layout">
      <div class="whiteboard-frame" data-board-frame>
        <div class="whiteboard-canvas" id="investigationWhiteboard" data-board-id="${board.id}" data-zoom="${viewport.zoom}" style="width: ${canvasWidth}px; height: ${canvasHeight}px;">
          <div class="whiteboard-world" style="width: ${BOARD_CANVAS_WIDTH}px; height: ${BOARD_CANVAS_HEIGHT}px; transform: scale(${viewport.zoom});">
            ${renderWhiteboardGroups(board)}
            ${items.length ? renderWhiteboardLinks(items) : ""}
            ${items.length ? items.map((item, index) => renderWhiteboardCard(item, index, board)).join("") : `
              <div class="whiteboard-empty">
                <h2>На доске пока пусто</h2>
                <p>Добавьте стартовый элемент через правую панель. После выбора карточки рядом появятся предложения связанных объектов.</p>
              </div>
            `}
            ${renderBoardSuggestionPopover(board)}
            </div>
        </div>
      </div>
      <aside class="board-side-panel">
        ${renderBoardSelectionPanel(board)}
        ${renderBoardConnectionPanel(board)}
        ${renderBoardAddPanel(board)}
      </aside>
    </div>
  `;
}

function renderBoardSelectionPanel(board) {
  const selectedRelationship = state.relationships.find((item) => item.id === state.boardSelectedRelationshipId);
  const selectedItem = boardItems(board).find((item) => nodeKey(item.entity, item.id) === state.boardSelectedKey);
  const selectedGroup = boardGroups(board).find((group) => group.id === state.boardSelectedGroupId);
  if (state.boardSelectedRelationshipId && !selectedRelationship) state.boardSelectedRelationshipId = "";
  if (selectedRelationship) {
    const sourceTitle = titleOf(selectedRelationship.sourceType, selectedRelationship.sourceId);
    const targetTitle = titleOf(selectedRelationship.targetType, selectedRelationship.targetId);
    const currentLabel = selectedRelationship.relationLabel || "связано";
    const labelIsDefault = OPTIONS.relationshipLabels.includes(currentLabel);
    const labelMode = labelIsDefault ? currentLabel : "__custom";
    return `
      <section class="board-panel-section">
        <h2>Связь на доске</h2>
        <form id="boardRelationshipForm" data-relationship-id="${escapeAttr(selectedRelationship.id)}">
          <div class="field">
            <label>От</label>
            <div class="readonly-field">${escapeHtml(sourceTitle)}</div>
          </div>
          <div class="field">
            <label>К</label>
            <div class="readonly-field">${escapeHtml(targetTitle)}</div>
          </div>
          <div class="field">
            <label>Тип связи</label>
            <select name="relationLabelPreset" data-relationship-label-mode>
              ${OPTIONS.relationshipLabels.map((label) => `<option value="${escapeAttr(label)}" ${labelMode === label ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
              <option value="__custom" ${labelMode === "__custom" ? "selected" : ""}>Своё название...</option>
            </select>
          </div>
          <div class="field ${labelMode === "__custom" ? "" : "hidden"}" data-custom-relationship-label>
            <label>Своё название</label>
            <input name="relationLabelCustom" value="${escapeAttr(labelMode === "__custom" ? currentLabel : "")}" />
          </div>
          <div class="board-control-grid compact">
            <div class="field">
              <label>Цвет линии</label>
              <input type="color" name="edgeColor" value="${escapeAttr(selectedRelationship.edgeColor || DEFAULT_EDGE_COLOR)}" />
            </div>
            <div class="field">
              <label>Стрелка</label>
              <select name="arrowDirection">
                <option value="" ${(selectedRelationship.arrowDirection || "") === "" ? "selected" : ""}>Без стрелки</option>
                <option value="source-to-target" ${selectedRelationship.arrowDirection === "source-to-target" ? "selected" : ""}>От первого ко второму</option>
                <option value="target-to-source" ${selectedRelationship.arrowDirection === "target-to-source" ? "selected" : ""}>От второго к первому</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label>Заметки</label>
            <textarea name="notes">${escapeHtml(selectedRelationship.notes || "")}</textarea>
          </div>
          <div class="actions">
            <button class="btn primary" type="submit">Сохранить</button>
            <button class="btn ghost" type="button" data-action="board-cancel-relationship-edit">Отмена</button>
            <button class="btn danger" type="button" data-action="delete-relationship" data-id="${escapeAttr(selectedRelationship.id)}">Удалить связь</button>
          </div>
        </form>
      </section>
    `;
  }
  if (selectedItem) {
    return `
      <section class="board-panel-section">
        <h2>Карточка на доске</h2>
        <div class="tiny muted">${escapeHtml(CONFIG[selectedItem.entity].singular)}</div>
        <strong>${escapeHtml(titleOf(selectedItem.entity, selectedItem.id))}</strong>
        <div class="board-control-grid">
          <div class="field">
            <label>Ширина</label>
            <input type="number" min="${BOARD_CARD_MIN_WIDTH}" max="520" step="10" value="${Math.round(selectedItem.width)}" data-board-card-width data-node-key="${escapeAttr(state.boardSelectedKey)}" />
          </div>
          <div class="field">
            <label>Высота</label>
            <input type="number" min="${BOARD_CARD_MIN_HEIGHT}" max="420" step="10" value="${Math.round(selectedItem.height)}" data-board-card-height data-node-key="${escapeAttr(state.boardSelectedKey)}" />
          </div>
        </div>
        <p class="tiny muted">Размер можно менять здесь или потянуть угол карточки на доске.</p>
      </section>
    `;
  }
  if (selectedGroup) {
    return `
      <section class="board-panel-section">
        <h2>Группа</h2>
        <div class="field">
          <label>Название</label>
          <input value="${escapeAttr(selectedGroup.title)}" data-board-group-title data-group-id="${escapeAttr(selectedGroup.id)}" />
        </div>
        <div class="board-control-grid">
          <div class="field">
            <label>Ширина</label>
            <input type="number" min="240" max="1200" step="10" value="${Math.round(selectedGroup.width)}" data-board-group-width data-group-id="${escapeAttr(selectedGroup.id)}" />
          </div>
          <div class="field">
            <label>Высота</label>
            <input type="number" min="180" max="900" step="10" value="${Math.round(selectedGroup.height)}" data-board-group-height data-group-id="${escapeAttr(selectedGroup.id)}" />
          </div>
        </div>
        <div class="board-control-grid">
          <div class="field">
            <label>Цвет рамки</label>
            <input type="color" value="${escapeAttr(selectedGroup.color)}" data-board-group-color data-group-id="${escapeAttr(selectedGroup.id)}" />
          </div>
          <div class="field">
            <label>Толщина</label>
            <input type="number" min="1" max="8" step="1" value="${Math.round(selectedGroup.borderWidth)}" data-board-group-border-width data-group-id="${escapeAttr(selectedGroup.id)}" />
          </div>
        </div>
        <div class="field">
          <label>Стиль рамки</label>
          <select data-board-group-border-style data-group-id="${escapeAttr(selectedGroup.id)}">
            <option value="dashed" ${selectedGroup.borderStyle === "dashed" ? "selected" : ""}>Пунктир</option>
            <option value="solid" ${selectedGroup.borderStyle === "solid" ? "selected" : ""}>Сплошная</option>
            <option value="dotted" ${selectedGroup.borderStyle === "dotted" ? "selected" : ""}>Точки</option>
          </select>
        </div>
        <p class="tiny muted">Размер группы также меняется перетаскиванием угла рамки.</p>
      </section>
    `;
  }
  return `
    <section class="board-panel-section subtle">
      <h2>Выбор</h2>
      <p class="tiny muted">Выберите карточку или группу на доске, чтобы изменить размер и оформление.</p>
    </section>
  `;
}

function renderWhiteboardGroups(board) {
  return boardGroups(board).map((group) => `
    <section class="whiteboard-group ${state.boardSelectedGroupId === group.id ? "selected" : ""}"
      data-action="board-select-group"
      data-group-id="${escapeAttr(group.id)}"
      data-x="${group.x}"
      data-y="${group.y}"
      data-width="${group.width}"
      data-height="${group.height}"
      data-border-style="${escapeAttr(group.borderStyle)}"
      data-border-width="${group.borderWidth}"
      style="transform: translate(${group.x}px, ${group.y}px); width: ${group.width}px; height: ${group.height}px; --group-color: ${escapeAttr(group.color || "#6f91c4")}; --group-border-style: ${escapeAttr(group.borderStyle)}; --group-border-width: ${group.borderWidth}px;">
      <div class="whiteboard-group-head" data-drag-kind="board-group" data-group-id="${escapeAttr(group.id)}">
        <span>${escapeHtml(group.title || "Группа")}</span>
        <button class="inline-link" data-action="board-remove-group" data-group-id="${escapeAttr(group.id)}">убрать</button>
      </div>
      <div class="board-resize-handle group-resize-handle" data-drag-kind="board-group-resize" data-group-id="${escapeAttr(group.id)}" title="Изменить размер группы"></div>
    </section>
  `).join("");
}

function renderWhiteboardLinks(items) {
  const nodeKeys = new Set(items.map((item) => nodeKey(item.entity, item.id)));
  const edges = uniqueDisplayEdges([
    ...relationshipEdges(),
    ...builtInEdges(),
  ].filter((edge) => nodeKeys.has(edge.source) && nodeKeys.has(edge.target)));
  assignParallelEdgeOffsets(edges);
  return `
    <svg class="whiteboard-links" aria-hidden="true">
      <defs>
        <marker id="whiteboardArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z"></path>
        </marker>
      </defs>
      ${edges.map((edge) => {
        const color = edge.color || DEFAULT_EDGE_COLOR;
        const selectableAttrs = edge.relationshipId
          ? `data-action="board-select-relationship" data-relationship-id="${escapeAttr(edge.relationshipId)}"`
          : "";
        const selectedClass = edge.relationshipId && state.boardSelectedRelationshipId === edge.relationshipId ? "selected" : "";
        const markerStart = edge.arrowDirection === "target-to-source" ? `marker-start="url(#whiteboardArrow)"` : "";
        const markerEnd = edge.arrowDirection === "source-to-target" ? `marker-end="url(#whiteboardArrow)"` : "";
        return `
          <line class="whiteboard-link edge-with-tooltip ${edge.kind === "user" ? "custom-edge" : ""} ${selectedClass}"
            ${selectableAttrs}
            ${markerStart}
            ${markerEnd}
            style="--edge-color: ${escapeAttr(color)};"
            data-parallel-offset="${edge.parallelOffset || 0}"
            data-source-key="${escapeAttr(edge.source)}"
            data-target-key="${escapeAttr(edge.target)}"
            data-edge-label="${escapeAttr(edge.label || "связь")}"
            data-edge-detail="${escapeAttr(edgeDetail(edge))}">
            <title>${escapeHtml(edge.label || "связь")}</title>
          </line>
          <text class="whiteboard-link-label edge-with-tooltip ${edge.kind === "user" ? "custom-edge-label" : ""} ${selectedClass}"
            ${selectableAttrs}
            style="--edge-color: ${escapeAttr(color)};"
            data-parallel-offset="${edge.parallelOffset || 0}"
            data-source-key="${escapeAttr(edge.source)}"
            data-target-key="${escapeAttr(edge.target)}"
            data-edge-label="${escapeAttr(edge.label || "связь")}"
            data-edge-detail="${escapeAttr(edgeDetail(edge))}">${escapeHtml(edge.label || "связь")}</text>
        `;
      }).join("")}
    </svg>
  `;
}

function renderWhiteboardCard(item, index, board) {
  const record = byId(item.entity, item.id);
  if (!record) return "";
  const related = relatedRecords(item.entity, item.id);
  const position = getBoardItemPosition(item, index);
  const key = nodeKey(item.entity, item.id);
  const width = item.width || BOARD_CARD_DEFAULT_WIDTH;
  const height = item.height || BOARD_CARD_DEFAULT_HEIGHT;
  const selected = state.boardSelectedKey === key ? "selected" : "";
  const connectionSource = state.boardConnection?.source === key;
  const connectionWaiting = state.boardConnection?.source && !state.boardConnection?.target && !connectionSource;
  const showConnector = selected || connectionSource || connectionWaiting;
  const connectorClass = connectionSource ? "source" : connectionWaiting ? "target" : "idle";
  const connectorTitle = connectionSource ? "Источник связи" : connectionWaiting ? "Связать с этой карточкой" : "Начать связь";
  const connectors = ["top", "right", "bottom", "left"].map((side) =>
    `<button class="board-connector board-connector-${side} ${connectorClass}" data-action="board-connector" data-node-key="${escapeAttr(key)}" data-side="${side}" title="${escapeAttr(connectorTitle)}"></button>`
  ).join("");
  return `
    <article class="whiteboard-card whiteboard-card-${item.entity} ${selected}"
      data-action="board-select-card"
      data-node-key="${escapeAttr(key)}"
      data-entity="${item.entity}"
      data-id="${item.id}"
      data-x="${position.x}"
      data-y="${position.y}"
      data-width="${width}"
      data-height="${height}"
      style="transform: translate(${position.x}px, ${position.y}px); width: ${width}px; height: ${height}px;">
      <div class="whiteboard-card-handle" data-drag-kind="board" data-node-key="${escapeAttr(key)}">
        <span>${escapeHtml(CONFIG[item.entity].singular)}</span>
        <span class="tiny muted">двигать</span>
      </div>
      ${showConnector ? `<div class="board-connectors">${connectors}</div>` : ""}
      <div class="whiteboard-card-body">
        <h3>${escapeHtml(truncate(CONFIG[item.entity].title(record), 80))}</h3>
        ${renderBadges(item.entity, record)}
        <p>${escapeHtml(truncate(CONFIG[item.entity].summary(record), 140) || "Описание пока не заполнено.")}</p>
        <div class="whiteboard-card-footer">
          <span class="tiny muted">Связей: ${related.length}</span>
          <div class="actions">
            <button class="btn ghost" data-action="detail" data-entity="${item.entity}" data-id="${item.id}">Открыть</button>
            ${connectionWaiting ? `<button class="btn primary" data-action="board-finish-connection" data-node-key="${escapeAttr(key)}">Соединить</button>` : `<button class="btn ghost" data-action="board-start-connection" data-node-key="${escapeAttr(key)}">${connectionSource ? "Источник" : "Связь"}</button>`}
            <button class="btn danger" data-action="board-remove-item" data-node-key="${escapeAttr(key)}">Убрать</button>
          </div>
        </div>
      </div>
      <div class="board-resize-handle card-resize-handle" data-drag-kind="board-card-resize" data-node-key="${escapeAttr(key)}" title="Изменить размер карточки"></div>
    </article>
  `;
}

function renderBoardAddPanel(board) {
  const suggestions = boardSuggestions(board, activeBoardSuggestionKey());
  return `
    <section class="board-panel-section">
      <h2>Добавить на доску</h2>
      <div class="field">
        <label>Поиск</label>
        <input type="search" value="${escapeAttr(state.boardAddSearch)}" placeholder="Название, описание, источник..." data-board-add-search />
      </div>
      <div class="field">
        <label>Тип</label>
        <select data-board-add-type>
          <option value="all" ${state.boardAddType === "all" ? "selected" : ""}>Все типы</option>
          ${BOARD_ENTITY_KEYS.map((entity) => `<option value="${entity}" ${state.boardAddType === entity ? "selected" : ""}>${escapeHtml(CONFIG[entity].label)}</option>`).join("")}
        </select>
      </div>
      <div class="board-suggestion-list">
        ${suggestions.length ? suggestions.map((item) => renderBoardSuggestionItem(item)).join("") : `<div class="empty-state">Нет подходящих элементов вне доски.</div>`}
      </div>
    </section>
  `;
}

function renderBoardSuggestionItem(item) {
  return `
    <article class="board-suggestion" data-board-drag-entity="${item.entity}" data-board-drag-id="${item.id}" title="Перетащить на доску">
      <div>
        <div class="tiny muted">${escapeHtml(CONFIG[item.entity].singular)}${item.reason ? ` · ${escapeHtml(item.reason)}` : ""}</div>
        <strong>${escapeHtml(titleOf(item.entity, item.id))}</strong>
      </div>
      <div class="actions">
        <button class="btn primary" data-action="board-add-item" data-entity="${item.entity}" data-id="${item.id}">Добавить</button>
        <button class="btn ghost" data-action="detail" data-entity="${item.entity}" data-id="${item.id}">Открыть</button>
        ${state.boardSelectedKey ? `<button class="btn ghost" data-action="board-add-and-connect" data-entity="${item.entity}" data-id="${item.id}">Связь</button>` : ""}
      </div>
    </article>
  `;
}

function renderBoardSuggestionPopover(board) {
  const activeKey = activeBoardSuggestionKey();
  if (!activeKey) return "";
  const item = boardItems(board).find((candidate) => nodeKey(candidate.entity, candidate.id) === activeKey);
  if (!item) return "";
  const position = getBoardItemPosition(item, 0);
  const suggestions = boardSuggestions(board, activeKey, { relatedOnly: true }).slice(0, 12);
  if (!suggestions.length) return "";
  return `
    <aside class="board-mini-suggestions" style="transform: translate(${position.x + 300}px, ${position.y}px);">
      <div class="tiny muted">Связанные рядом</div>
      ${suggestions.map((suggestion) => `
        <article class="board-mini-item" data-board-drag-entity="${suggestion.entity}" data-board-drag-id="${suggestion.id}" title="Перетащить на доску">
          <button class="board-mini-main" data-action="detail" data-entity="${suggestion.entity}" data-id="${suggestion.id}">
            <span>${escapeHtml(CONFIG[suggestion.entity].singular)}</span>
            <strong>${escapeHtml(truncate(titleOf(suggestion.entity, suggestion.id), 42))}</strong>
          </button>
          <div class="actions">
            <button class="btn primary" data-action="board-add-item" data-entity="${suggestion.entity}" data-id="${suggestion.id}">Добавить</button>
            <button class="btn ghost" data-action="board-add-and-connect" data-entity="${suggestion.entity}" data-id="${suggestion.id}">Связь</button>
          </div>
        </article>
      `).join("")}
    </aside>
  `;
}

function renderBoardConnectionPanel(board) {
  const draft = state.boardConnection;
  if (!draft?.source) {
    return `
      <section class="board-panel-section subtle">
        <h2>Связь</h2>
        <p class="tiny muted">Нажмите “Связь” на карточке, затем “Соединить” на другой карточке. После этого здесь появится меню типа связи.</p>
      </section>
    `;
  }
  const source = parseNodeKey(draft.source);
  if (!draft.target) {
    return `
      <section class="board-panel-section">
        <h2>Связь</h2>
        <p>Источник: <strong>${escapeHtml(titleOf(source.entity, source.id))}</strong></p>
        <p class="tiny muted">Выберите вторую карточку на доске и нажмите “Соединить”.</p>
        <button class="btn ghost" data-action="board-cancel-connection">Отмена</button>
      </section>
    `;
  }
  const target = parseNodeKey(draft.target);
  const existing = relationshipBetween(source.entity, source.id, target.entity, target.id);
  const currentLabel = existing?.relationLabel || "связано";
  const labelIsDefault = OPTIONS.relationshipLabels.includes(currentLabel);
  const labelMode = labelIsDefault ? currentLabel : "__custom";
  return `
    <section class="board-panel-section">
      <h2>${existing ? "Редактировать связь" : "Создать связь"}</h2>
      <form id="boardConnectionForm" data-source-key="${escapeAttr(draft.source)}" data-target-key="${escapeAttr(draft.target)}" data-relationship-id="${existing?.id || ""}">
        <div class="field">
          <label>От</label>
          <div class="readonly-field">${escapeHtml(titleOf(source.entity, source.id))}</div>
        </div>
        <div class="field">
          <label>К</label>
          <div class="readonly-field">${escapeHtml(titleOf(target.entity, target.id))}</div>
        </div>
        <div class="field">
          <label>Тип связи</label>
          <select name="relationLabelPreset" data-relationship-label-mode>
            ${OPTIONS.relationshipLabels.map((label) => `<option value="${escapeAttr(label)}" ${labelMode === label ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
            <option value="__custom" ${labelMode === "__custom" ? "selected" : ""}>Своё название...</option>
          </select>
        </div>
        <div class="field ${labelMode === "__custom" ? "" : "hidden"}" data-custom-relationship-label>
          <label>Своё название</label>
          <input name="relationLabelCustom" value="${escapeAttr(labelMode === "__custom" ? currentLabel : "")}" />
        </div>
        <div class="field">
          <label>Цвет линии</label>
          <input type="color" name="edgeColor" value="${escapeAttr(existing?.edgeColor || DEFAULT_EDGE_COLOR)}" />
        </div>
        <div class="field">
          <label>Стрелка</label>
          <select name="arrowDirection">
            <option value="" ${(existing?.arrowDirection || "") === "" ? "selected" : ""}>Без стрелки</option>
            <option value="source-to-target" ${existing?.arrowDirection === "source-to-target" ? "selected" : ""}>От первого ко второму</option>
            <option value="target-to-source" ${existing?.arrowDirection === "target-to-source" ? "selected" : ""}>От второго к первому</option>
          </select>
        </div>
        <div class="field">
          <label>Заметки</label>
          <textarea name="notes">${escapeHtml(existing?.notes || "")}</textarea>
        </div>
        <div class="actions">
          <button class="btn primary" type="submit">${existing ? "Сохранить" : "Создать"}</button>
          <button class="btn ghost" type="button" data-action="board-cancel-connection">Отмена</button>
        </div>
      </form>
    </section>
  `;
}

function selectFilter(name, label, options, selected) {
  return `
    <div class="field">
      <label>${escapeHtml(label)}</label>
      <select data-filter="${name}">
        ${options.map((option) => `<option value="${escapeAttr(option)}" ${selected === option ? "selected" : ""}>${option === "all" ? "Все" : escapeHtml(option)}</option>`).join("")}
      </select>
    </div>
  `;
}

function renderTimeline() {
  let events = visibleData("events");
  const character = state.filters.timelineCharacter;
  const location = state.filters.timelineLocation;
  const storyline = state.filters.timelineStoryline;
  if (character !== "all") {
    events = events.filter((event) => includesId(event.participantIds, character));
  }
  if (location !== "all") {
    events = events.filter((event) => event.cityId === location || event.placeId === location);
  }
  if (storyline !== "all") {
    events = events.filter((event) => areRelated("storylines", storyline, "events", event.id));
  }
  events = events.sort(compareEventsAsc);
  return `
    <div class="view-head">
      <div>
        <h1>Таймлайн событий</h1>
        <p>Хронология по игровой дате и времени с фильтрами по персонажу, локации и сюжетной линии.</p>
      </div>
      <button class="btn primary" data-action="new" data-entity="events">Новое событие</button>
    </div>
    <div class="filters">
      ${refFilter("timelineCharacter", "Персонаж", "characters", character)}
      ${refFilter("timelineLocation", "Локация", "locations", location)}
      ${refFilter("timelineStoryline", "Сюжетная линия", "storylines", storyline)}
    </div>
    <div class="timeline">
      ${events.length ? events.map(renderTimelineItem).join("") : emptyState("Событий для выбранных фильтров нет.", "events")}
    </div>
  `;
}

function refFilter(name, label, entity, selected) {
  return `
    <div class="field">
      <label>${escapeHtml(label)}</label>
      <select data-filter="${name}">
        <option value="all">Все</option>
        ${visibleData(entity).map((record) => `<option value="${record.id}" ${selected === record.id ? "selected" : ""}>${escapeHtml(titleOf(entity, record.id))}</option>`).join("")}
      </select>
    </div>
  `;
}

function renderTimelineItem(event) {
  return `
    <div class="timeline-item">
      <div class="timeline-date">${escapeHtml([event.gameDate || "без даты", event.gameTime].filter(Boolean).join(" "))}</div>
      ${renderRecordCard("events", event)}
    </div>
  `;
}

function renderSearch() {
  const query = state.search.trim().toLowerCase();
  const sections = [];
  for (const entity of ENTITY_KEYS.filter((key) => key !== "investigationBoards")) {
    const records = visibleData(entity).filter((record) => !query || recordSearchText(entity, record).includes(query));
    if (records.length) {
      sections.push(`
        <section class="panel">
          <div class="view-head">
            <div><h2>${escapeHtml(CONFIG[entity].label)}</h2><p>${records.length} результатов</p></div>
            <button class="btn ghost" data-action="nav" data-view="${entity === "memoirs" ? "coteries" : entity}">Открыть раздел</button>
          </div>
          <div class="grid cards">${records.map((record) => renderRecordCard(entity, record)).join("")}</div>
        </section>
      `);
    }
  }
  return `
    <div class="view-head">
      <div>
        <h1>Поиск по хронике</h1>
        <p>Поиск по названиям, описаниям, заметкам, источникам, вопросам и мемуарам.</p>
      </div>
    </div>
    ${query ? sections.join("") || `<div class="empty-state">По запросу ничего не найдено.</div>` : `<div class="empty-state">Введите запрос в верхней панели.</div>`}
  `;
}

function renderGraph() {
  const graph = buildGraph();
  return `
    <div class="view-head">
      <div>
        <h1>Граф связей</h1>
        <p>Force-directed граф в духе Obsidian: связанные узлы притягиваются, несвязанные отталкиваются, узлы можно перетаскивать.</p>
      </div>
    </div>
    <div class="graph-layout">
      <div class="graph-wrap" id="forceGraph">
        ${graph.nodes.length ? renderGraphSvg(graph) : `<div class="empty-state">Недостаточно видимых объектов для графа.</div>`}
      </div>
      ${renderGraphControlPanel(graph)}
    </div>
  `;
}

function renderGraphControlPanel(graph) {
  const focusOptions = graphAvailableNodes();
  const statuses = graphCharacterStatuses();
  return `
    <aside class="graph-panel">
      <h2>Фильтр графа</h2>
      <div class="field">
        <label>Узловая точка</label>
        <select data-graph-focus>
          <option value="">Все узлы</option>
          ${focusOptions.map((node) => `
            <option value="${escapeAttr(node.key)}" ${state.graphFocusKey === node.key ? "selected" : ""}>
              ${escapeHtml(CONFIG[node.entity].singular)}: ${escapeHtml(node.title)}
            </option>
          `).join("")}
        </select>
      </div>
      <div class="field">
        <label>Длина цепочки</label>
        <select data-graph-depth>
          ${[
            ["1", "1 связь"],
            ["2", "2 связи"],
            ["3", "3 связи"],
            ["4", "4 связи"],
            ["5", "5 связей"],
            ["all", "Без ограничения"],
          ].map(([value, label]) => `<option value="${value}" ${state.graphDepth === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </div>
      ${renderGraphSelectionPanel(graph)}
      <div>
        <div class="tiny muted" style="margin-bottom: 8px;">Типы объектов</div>
        <div class="graph-panel-list">
          ${GRAPH_ENTITY_KEYS.map((entity) => `
            <label class="check-pill">
              <input type="checkbox" data-graph-type="${entity}" ${state.graphTypes[entity] ? "checked" : ""} />
              ${escapeHtml(CONFIG[entity].label)}
            </label>
          `).join("")}
        </div>
      </div>
      <div>
        <div class="tiny muted" style="margin-bottom: 8px;">Статусы персонажей</div>
        <div class="graph-panel-list">
          ${statuses.map((status) => `
            <label class="check-pill">
              <input type="checkbox" data-graph-character-status="${escapeAttr(status)}" ${state.graphCharacterStatuses[status] !== false ? "checked" : ""} />
              ${escapeHtml(status)}
            </label>
          `).join("")}
        </div>
      </div>
      <div class="notice tiny">
        Сейчас видно узлов: ${graph.nodes.length}. Если выбрана узловая точка, показываются только объекты, достижимые по цепочке связей.
      </div>
    </aside>
  `;
}

function renderGraphSelectionPanel(graph) {
  const selectedNode = graph.nodes.find((node) => node.key === state.graphSelectedNodeKey);
  const selectedEdge = graph.edges.find((edge) => edge.relationshipId && edge.relationshipId === state.graphSelectedEdgeId);
  if (state.graphSelectedNodeKey && !selectedNode) state.graphSelectedNodeKey = "";
  if (state.graphSelectedEdgeId && !selectedEdge) state.graphSelectedEdgeId = "";

  if (selectedNode) {
    const record = byId(selectedNode.entity, selectedNode.id);
    const color = record?.graphNodeColor || nodeDefaultColor(selectedNode.entity);
    const textColor = record?.graphTextColor || nodeDefaultTextColor(selectedNode.entity);
    const scale = graphNodeScale(record, selectedNode.entity);
    return `
      <section class="graph-inspector">
        <div>
          <div class="tiny muted">Выбран узел</div>
          <h3>${escapeHtml(titleOf(selectedNode.entity, selectedNode.id))}</h3>
          <p class="tiny muted">${escapeHtml(CONFIG[selectedNode.entity].singular)}</p>
        </div>
        <div class="field">
          <label>Цвет узла</label>
          <input type="color" value="${escapeAttr(color)}" data-graph-node-color data-entity="${selectedNode.entity}" data-id="${selectedNode.id}" />
        </div>
        <div class="field">
          <label>Цвет текста</label>
          <input type="color" value="${escapeAttr(textColor)}" data-graph-node-text-color data-entity="${selectedNode.entity}" data-id="${selectedNode.id}" />
        </div>
        <div class="field">
          <label>Размер узла: ${Math.round(scale * 100)}%</label>
          <input type="range" min="60" max="190" step="5" value="${Math.round(scale * 100)}" data-graph-selected-node-scale data-entity="${selectedNode.entity}" data-id="${selectedNode.id}" />
        </div>
        <div class="actions">
          <button class="btn ghost" data-action="open-graph-node" data-entity="${selectedNode.entity}" data-id="${selectedNode.id}">Открыть карточку</button>
          <button class="btn ghost" data-action="reset-graph-node-style" data-entity="${selectedNode.entity}" data-id="${selectedNode.id}">Сбросить стиль</button>
        </div>
      </section>
    `;
  }

  if (selectedEdge) {
    const rel = state.relationships.find((item) => item.id === selectedEdge.relationshipId);
    if (!rel) return "";
    const color = rel.edgeColor || DEFAULT_EDGE_COLOR;
    const arrowDirection = rel.arrowDirection || "";
    const sourceTitle = titleOf(rel.sourceType, rel.sourceId);
    const targetTitle = titleOf(rel.targetType, rel.targetId);
    return `
      <section class="graph-inspector">
        <div>
          <div class="tiny muted">Выбрана связь</div>
          <h3>${escapeHtml(rel.relationLabel || "связано")}</h3>
          <p class="tiny muted">${escapeHtml(sourceTitle)} ↔ ${escapeHtml(targetTitle)}</p>
        </div>
        <div class="field">
          <label>Цвет связи</label>
          <input type="color" value="${escapeAttr(color)}" data-graph-selected-edge-color data-relationship-id="${rel.id}" />
        </div>
        <div class="field">
          <label>Стрелка</label>
          <select data-graph-arrow-direction data-relationship-id="${rel.id}">
            <option value="" ${arrowDirection === "" ? "selected" : ""}>Без стрелки</option>
            <option value="source-to-target" ${arrowDirection === "source-to-target" ? "selected" : ""}>${escapeHtml(sourceTitle)} → ${escapeHtml(targetTitle)}</option>
            <option value="target-to-source" ${arrowDirection === "target-to-source" ? "selected" : ""}>${escapeHtml(targetTitle)} → ${escapeHtml(sourceTitle)}</option>
          </select>
        </div>
        <div class="actions">
          <button class="btn ghost" data-action="reset-graph-edge-style" data-relationship-id="${rel.id}">Сбросить стиль</button>
          <button class="btn ghost" data-action="edit-relationship" data-id="${rel.id}">Править текст</button>
        </div>
      </section>
    `;
  }

  return `
    <section class="graph-inspector subtle">
      <h3>Настройка выбранного</h3>
      <p class="tiny muted">Кликните по узлу, линии или подписи связи на графе. Здесь появятся цвет, размер узла и стрелка связи.</p>
    </section>
  `;
}

function normalizeGraphViewport(viewport = state.graphViewport) {
  const zoom = clamp(Number(viewport.zoom) || 1, 0.35, 2.8);
  const width = GRAPH_WIDTH / zoom;
  const height = GRAPH_HEIGHT / zoom;
  return {
    x: clamp(Number(viewport.x) || 0, -GRAPH_WIDTH, GRAPH_WIDTH * 2 - width),
    y: clamp(Number(viewport.y) || 0, -GRAPH_HEIGHT, GRAPH_HEIGHT * 2 - height),
    zoom,
  };
}

function graphViewBox(viewport = state.graphViewport) {
  const normalized = normalizeGraphViewport(viewport);
  return {
    x: normalized.x,
    y: normalized.y,
    width: GRAPH_WIDTH / normalized.zoom,
    height: GRAPH_HEIGHT / normalized.zoom,
  };
}

function applyGraphViewport(svg) {
  state.graphViewport = normalizeGraphViewport(state.graphViewport);
  const viewBox = graphViewBox();
  svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
}

function zoomGraphAt(svg, event) {
  const oldViewport = normalizeGraphViewport(state.graphViewport);
  const oldViewBox = graphViewBox(oldViewport);
  const rect = svg.getBoundingClientRect();
  const localX = (event.clientX - rect.left) / Math.max(rect.width, 1);
  const localY = (event.clientY - rect.top) / Math.max(rect.height, 1);
  const worldX = oldViewBox.x + localX * oldViewBox.width;
  const worldY = oldViewBox.y + localY * oldViewBox.height;
  const nextZoom = clamp(oldViewport.zoom * Math.exp(-event.deltaY * 0.0011), 0.35, 2.8);
  const nextWidth = GRAPH_WIDTH / nextZoom;
  const nextHeight = GRAPH_HEIGHT / nextZoom;
  state.graphViewport = normalizeGraphViewport({
    x: worldX - localX * nextWidth,
    y: worldY - localY * nextHeight,
    zoom: nextZoom,
  });
  applyGraphViewport(svg);
}

function renderGraphSvg(graph) {
  const width = GRAPH_WIDTH;
  const height = GRAPH_HEIGHT;
  const viewBox = graphViewBox();
  const centerX = width / 2;
  const centerY = height / 2;
  const edges = graph.edges
    .map((edge, index) => {
      const edgeColor = edge.color || DEFAULT_EDGE_COLOR;
      const selectableAttrs = edge.relationshipId
        ? `data-action="select-graph-edge" data-relationship-id="${escapeAttr(edge.relationshipId)}"`
        : "";
      const selectedClass = edge.relationshipId && state.graphSelectedEdgeId === edge.relationshipId ? "selected" : "";
      const markerStart = edge.arrowDirection === "target-to-source" ? `marker-start="url(#graphArrow)"` : "";
      const markerEnd = edge.arrowDirection === "source-to-target" ? `marker-end="url(#graphArrow)"` : "";
      return `
        <line class="graph-edge edge-with-tooltip ${edge.kind === "user" ? "custom-edge" : ""} ${selectedClass}"
          ${selectableAttrs}
          ${markerStart}
          ${markerEnd}
          style="--edge-color: ${escapeAttr(edgeColor)};"
          data-edge-index="${index}"
          data-parallel-offset="${edge.parallelOffset || 0}"
          data-source-key="${escapeAttr(edge.source)}"
          data-target-key="${escapeAttr(edge.target)}"
          data-edge-label="${escapeAttr(edge.label || "связь")}"
          data-edge-detail="${escapeAttr(edgeDetail(edge))}">
          <title>${escapeHtml(edge.label || "связь")}</title>
        </line>
        <text class="graph-edge-label edge-with-tooltip ${edge.kind === "user" ? "custom-edge-label" : ""} ${selectedClass}"
          ${selectableAttrs}
          style="--edge-color: ${escapeAttr(edgeColor)};"
          data-edge-index="${index}"
          data-parallel-offset="${edge.parallelOffset || 0}"
          data-source-key="${escapeAttr(edge.source)}"
          data-target-key="${escapeAttr(edge.target)}"
          data-edge-label="${escapeAttr(edge.label || "связь")}"
          data-edge-detail="${escapeAttr(edgeDetail(edge))}">${escapeHtml(edge.label || "связь")}</text>
      `;
    })
    .join("");
  const nodes = graph.nodes
    .map((node, index) => {
      const record = byId(node.entity, node.id);
      const point = getGraphPosition(node, index, graph.nodes.length, width, height);
      const label = truncate(node.title, 24);
      const baseRadius = node.entity === "coteries" ? 38 : 28;
      const nodeRadius = Math.round(baseRadius * graphNodeScale(record, node.entity));
      const titleOffset = -nodeRadius - 8;
      const nodeColor = record?.graphNodeColor || nodeDefaultColor(node.entity);
      const nodeTextColor = record?.graphTextColor || nodeDefaultTextColor(node.entity);
      const selectedClass = state.graphSelectedNodeKey === node.key ? "selected" : "";
      return `
        <g class="graph-node ${record?.graphPosition ? "pinned" : ""} ${selectedClass}" data-action="select-graph-node" data-node-key="${escapeAttr(node.key)}" data-entity="${node.entity}" data-id="${node.id}" data-node-radius="${nodeRadius}" data-x="${point.x}" data-y="${point.y}" transform="translate(${point.x}, ${point.y})" style="--node-color: ${escapeAttr(nodeColor)}; --node-text-color: ${escapeAttr(nodeTextColor)};">
          <circle r="${nodeRadius}"></circle>
          <text y="${titleOffset}" text-anchor="middle">${escapeHtml(CONFIG[node.entity].singular)}</text>
          <text y="5" text-anchor="middle">${escapeHtml(label)}</text>
        </g>
      `;
    })
    .join("");
  return `
    <svg class="graph-svg" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" role="img" aria-label="Граф связей">
      <defs>
        <marker id="graphArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"></path>
        </marker>
      </defs>
      ${edges}
      ${nodes}
    </svg>
    <div class="graph-hint">Перетаскивайте узлы, тяните пустое место для перемещения камеры, колесом меняйте масштаб. Подписи на линиях — тип связи; наведите на линию или подпись, чтобы увидеть детали.</div>
  `;
}

function buildGraph() {
  const allNodes = graphAvailableNodes();
  const allNodeKeys = new Set(allNodes.map((node) => node.key));
  const allEdges = uniqueDisplayEdges([
    ...builtInEdges(),
    ...relationshipEdges(),
  ]).filter((edge) => allNodeKeys.has(edge.source) && allNodeKeys.has(edge.target));
  const reachable = graphReachableKeys(allEdges, allNodeKeys);
  const nodes = [];
  const nodeKeys = new Set();
  for (const node of allNodes) {
    if (!reachable.has(node.key)) continue;
    nodeKeys.add(node.key);
    nodes.push(node);
  }

  const rawEdges = allEdges;
  const seen = new Set();
  const edges = [];
  for (const edge of rawEdges) {
    if (!nodeKeys.has(edge.source) || !nodeKeys.has(edge.target)) continue;
    const key = [edge.source, edge.target, edge.label].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push(edge);
  }
  assignParallelEdgeOffsets(edges);
  return { nodes, edges };
}

function graphAvailableNodes() {
  const nodes = [];
  for (const entity of GRAPH_ENTITY_KEYS) {
    if (!state.graphTypes[entity]) continue;
    for (const record of visibleData(entity)) {
      if (entity === "characters" && !graphCharacterStatusAllowed(record.status)) continue;
      nodes.push({ key: nodeKey(entity, record.id), entity, id: record.id, title: titleOf(entity, record.id) });
    }
  }
  return nodes;
}

function graphCharacterStatuses() {
  const statuses = new Set(OPTIONS.characterStatus);
  for (const character of getRecords("characters")) {
    statuses.add(character.status || "Не указано");
  }
  return Array.from(statuses);
}

function graphCharacterStatusAllowed(status) {
  const normalized = status || "Не указано";
  if (!(normalized in state.graphCharacterStatuses)) return true;
  return state.graphCharacterStatuses[normalized] !== false;
}

function graphReachableKeys(edges, nodeKeys) {
  if (!state.graphFocusKey || !nodeKeys.has(state.graphFocusKey)) return new Set(nodeKeys);
  const maxDepth = state.graphDepth === "all" ? Infinity : Number(state.graphDepth || 1);
  const adjacency = new Map();
  for (const key of nodeKeys) adjacency.set(key, new Set());
  for (const edge of edges) {
    if (!nodeKeys.has(edge.source) || !nodeKeys.has(edge.target)) continue;
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }
  const seen = new Set([state.graphFocusKey]);
  const queue = [{ key: state.graphFocusKey, depth: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (current.depth >= maxDepth) continue;
    for (const next of adjacency.get(current.key) || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ key: next, depth: current.depth + 1 });
    }
  }
  return seen;
}

function builtInEdges() {
  const edges = [];
  const add = (sourceEntity, sourceId, targetEntity, targetId, label) => {
    if (sourceId && targetId) {
      edges.push({
        source: nodeKey(sourceEntity, sourceId),
        target: nodeKey(targetEntity, targetId),
        label,
        kind: "builtin",
        sourceTitle: titleOf(sourceEntity, sourceId),
        targetTitle: titleOf(targetEntity, targetId),
        detail: `${titleOf(sourceEntity, sourceId)} → ${titleOf(targetEntity, targetId)}`,
      });
    }
  };
  for (const coterie of getRecords("coteries")) {
    for (const id of coterieMembers(coterie).map((character) => character.id)) {
      add("coteries", coterie.id, "characters", id, "член котерии");
    }
  }
  for (const character of getRecords("characters")) {
    add("characters", character.id, "coteries", character.coterieId, "в котерии");
    add("characters", character.id, "factions", character.factionId, "состоит во фракции");
  }
  for (const faction of getRecords("factions")) {
    for (const id of asArray(faction.memberIds)) add("factions", faction.id, "characters", id, "участник");
    for (const id of asArray(faction.allyIds)) add("factions", faction.id, "factions", id, "союзник");
    for (const id of asArray(faction.enemyIds)) add("factions", faction.id, "factions", id, "враг");
  }
  for (const location of getRecords("locations")) {
    add("locations", location.id, "locations", location.parentCityId, "место в городе");
  }
  for (const event of getRecords("events")) {
    add("events", event.id, "locations", event.cityId, "город");
    add("events", event.id, "locations", event.placeId, "место");
    for (const id of asArray(event.participantIds)) add("events", event.id, "characters", id, "участник");
  }
  for (const fact of getRecords("facts")) {
    add("facts", fact.id, "events", fact.eventId, "связанное событие");
  }
  for (const clue of getRecords("clues")) {
    add("clues", clue.id, "events", clue.eventId, "связанное событие");
    for (const id of asArray(clue.discoveredByIds)) add("clues", clue.id, "characters", id, "обнаружил");
  }
  for (const memoir of getRecords("memoirs")) {
    add("memoirs", memoir.id, "characters", memoir.authorId, "автор");
    for (const id of asArray(memoir.eventIds)) add("memoirs", memoir.id, "events", id, "о событии");
    for (const id of asArray(memoir.characterIds)) add("memoirs", memoir.id, "characters", id, "упоминает");
  }
  return edges;
}

function relationshipEdges() {
  return state.relationships.map((rel) => ({
    source: nodeKey(rel.sourceType, rel.sourceId),
    target: nodeKey(rel.targetType, rel.targetId),
    label: rel.relationLabel || "связано",
    kind: "user",
    notes: rel.notes || "",
    color: rel.edgeColor || "",
    arrowDirection: rel.arrowDirection || "",
    sourceTitle: titleOf(rel.sourceType, rel.sourceId),
    targetTitle: titleOf(rel.targetType, rel.targetId),
    relationshipId: rel.id,
  }));
}

function relationshipPairKey(rel) {
  return [nodeKey(rel.sourceType, rel.sourceId), nodeKey(rel.targetType, rel.targetId)]
    .sort()
    .join("::");
}

function edgePairKey(edge) {
  return [edge.source, edge.target].sort().join("::");
}

function uniqueRelationships(relationships) {
  const byPair = new Map();
  for (const rel of relationships) {
    const key = relationshipPairKey(rel);
    const existing = byPair.get(key);
    if (!existing) {
      byPair.set(key, rel);
      continue;
    }
    const existingHasDetails = Boolean(existing.relationLabel || existing.notes || existing.edgeColor || existing.arrowDirection);
    const relHasDetails = Boolean(rel.relationLabel || rel.notes || rel.edgeColor || rel.arrowDirection);
    if (!existingHasDetails && relHasDetails) {
      byPair.set(key, rel);
    }
  }
  return Array.from(byPair.values());
}

function uniqueDisplayEdges(edges) {
  const byPair = new Map();
  for (const edge of edges) {
    const key = edgePairKey(edge);
    const existing = byPair.get(key);
    if (!existing || (existing.kind !== "user" && edge.kind === "user")) {
      byPair.set(key, edge);
    }
  }
  return Array.from(byPair.values());
}

function assignParallelEdgeOffsets(edges) {
  const groups = new Map();
  for (const edge of edges) {
    const key = [edge.source, edge.target].sort().join("::");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edge);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "builtin" ? -1 : 1));
    const middle = (group.length - 1) / 2;
    group.forEach((edge, index) => {
      edge.parallelOffset = (index - middle) * 22;
    });
  }
}

function edgeDetail(edge) {
  const parts = [
    `Тип связи: ${edge.label || "связь"}`,
    `От: ${edge.sourceTitle || titleFromNodeKey(edge.source)}`,
    `К: ${edge.targetTitle || titleFromNodeKey(edge.target)}`,
  ];
  if (edge.notes) parts.push(`Заметки: ${edge.notes}`);
  return parts.join("\n");
}

function nodeKey(entity, id) {
  return `${entity}:${id}`;
}

function parseNodeKey(key) {
  const index = String(key || "").indexOf(":");
  if (index === -1) return { entity: "", id: "" };
  return { entity: key.slice(0, index), id: key.slice(index + 1) };
}

function titleFromNodeKey(key) {
  const { entity, id } = parseNodeKey(key);
  return titleOf(entity, id);
}

function currentBoard() {
  return getRecords("investigationBoards").find((board) => board.id === state.boardId) ||
    getRecords("investigationBoards").find((board) => board.status !== "Архив") ||
    getRecords("investigationBoards")[0];
}

function boardViewport(board) {
  const viewport = board?.viewport || {};
  return {
    x: Math.max(0, Number(viewport.x) || 0),
    y: Math.max(0, Number(viewport.y) || 0),
    zoom: clamp(Number(viewport.zoom) || 1, 0.35, 2.4),
  };
}

function boardItems(board) {
  const seen = new Set();
  const items = [];
  for (const item of asArray(board?.items)) {
    if (!BOARD_ENTITY_KEYS.includes(item.entity) || !byId(item.entity, item.id)) continue;
    const key = nodeKey(item.entity, item.id);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      entity: item.entity,
      id: item.id,
      x: Number.isFinite(Number(item.x)) ? Number(item.x) : undefined,
      y: Number.isFinite(Number(item.y)) ? Number(item.y) : undefined,
      width: Number.isFinite(Number(item.width)) ? clamp(Number(item.width), BOARD_CARD_MIN_WIDTH, 520) : BOARD_CARD_DEFAULT_WIDTH,
      height: Number.isFinite(Number(item.height)) ? clamp(Number(item.height), BOARD_CARD_MIN_HEIGHT, 420) : BOARD_CARD_DEFAULT_HEIGHT,
    });
  }
  return items;
}

function boardGroups(board) {
  return asArray(board?.groups).map((group, index) => ({
    id: group.id || `group_${index}`,
    title: group.title || "Группа",
    color: group.color || "#6f91c4",
    borderStyle: ["solid", "dashed", "dotted"].includes(group.borderStyle) ? group.borderStyle : "dashed",
    borderWidth: Number.isFinite(Number(group.borderWidth)) ? clamp(Number(group.borderWidth), 1, 8) : 1,
    x: Number.isFinite(Number(group.x)) ? Number(group.x) : 80 + index * 40,
    y: Number.isFinite(Number(group.y)) ? Number(group.y) : 80 + index * 40,
    width: Number.isFinite(Number(group.width)) ? Number(group.width) : 460,
    height: Number.isFinite(Number(group.height)) ? Number(group.height) : 300,
  }));
}

function getBoardItemPosition(item, index) {
  if (Number.isFinite(Number(item?.x)) && Number.isFinite(Number(item?.y))) {
    return { x: Number(item.x), y: Number(item.y) };
  }
  const groupOffsets = {
    storylines: { x: 80, y: 70 },
    events: { x: 430, y: 80 },
    facts: { x: 760, y: 90 },
    clues: { x: 1080, y: 110 },
    theories: { x: 650, y: 420 },
    notes: { x: 960, y: 560 },
    characters: { x: 120, y: 430 },
    factions: { x: 420, y: 430 },
    locations: { x: 980, y: 420 },
    memoirs: { x: 1260, y: 420 },
  };
  const base = groupOffsets[item.entity] || { x: 120, y: 120 };
  return {
    x: base.x + (index % 3) * 42,
    y: base.y + Math.floor(index / 3) * 188,
  };
}

function getGraphPosition(node, index, total, width, height) {
  const record = byId(node.entity, node.id);
  if (record?.graphPosition && Number.isFinite(record.graphPosition.x) && Number.isFinite(record.graphPosition.y)) {
    return record.graphPosition;
  }
  const centerX = width / 2;
  const centerY = height / 2;
  if (node.entity === "coteries") return { x: centerX, y: centerY };
  const playerCharacters = getRecords("characters").filter(isPlayerCharacter);
  if (node.entity === "characters" && isPlayerCharacter(record)) {
    const playerIndex = Math.max(0, playerCharacters.findIndex((character) => character.id === node.id));
    const angle = (Math.PI * 2 * playerIndex) / Math.max(playerCharacters.length, 1) - Math.PI / 2;
    return { x: centerX + Math.cos(angle) * 145, y: centerY + Math.sin(angle) * 145 };
  }
  const angle = (Math.PI * 2 * index) / Math.max(total, 1) - Math.PI / 2;
  const radius = Math.min(width, height) * 0.38;
  return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
}

function nodeDefaultColor(entity) {
  return graphTypeStyle(entity).nodeColor || baseNodeColor(entity);
}

function nodeDefaultTextColor(entity) {
  return graphTypeStyle(entity).textColor || DEFAULT_NODE_TEXT_COLOR;
}

function baseNodeColor(entity) {
  return entity === "coteries" ? DEFAULT_COTERIE_NODE_COLOR : DEFAULT_NODE_COLOR;
}

function graphTypeStyle(entity) {
  return campaignRecord()?.graphTypeStyles?.[entity] || {};
}

function graphTypeScale(entity) {
  const value = Number(graphTypeStyle(entity).nodeScale);
  return Number.isFinite(value) && value > 0 ? clamp(value, 0.6, 1.9) : 1;
}

function graphNodeScale(record, entity = "") {
  const rawValue = record?.graphNodeScale;
  const fallback = entity ? graphTypeScale(entity) : 1;
  const value = rawValue === "" || rawValue === undefined || rawValue === null ? fallback : Number(rawValue);
  return Number.isFinite(value) ? clamp(value, 0.6, 1.9) : 1;
}

function campaignRecord() {
  return getRecords("campaigns")[0];
}

function renderModal() {
  if (state.editor) return renderEditor();
  if (state.detail) return renderDetail();
  return "";
}

function renderBoardContextMenu() {
  const menu = state.boardContextMenu;
  if (!menu) return "";
  if (menu.kind === "canvas") {
    return `
      <div class="board-context-menu" style="left: ${menu.x}px; top: ${menu.y}px;" data-board-context-menu>
        <div class="tiny muted">Доска расследования</div>
        <strong>Создать здесь</strong>
        <div class="board-context-actions">
          <button data-action="board-create-note">Заметку</button>
          <button data-action="board-create-hypothesis">Гипотезу</button>
        </div>
      </div>
    `;
  }
  const item = boardItems(currentBoard()).find((candidate) => nodeKey(candidate.entity, candidate.id) === menu.nodeKey);
  if (!item) return "";
  return `
    <div class="board-context-menu" style="left: ${menu.x}px; top: ${menu.y}px;" data-board-context-menu>
      <div class="tiny muted">${escapeHtml(CONFIG[item.entity].singular)}</div>
      <strong>${escapeHtml(truncate(titleOf(item.entity, item.id), 44))}</strong>
      <div class="board-context-actions">
        <button data-action="detail" data-entity="${item.entity}" data-id="${item.id}">Открыть</button>
        <button data-action="edit" data-entity="${item.entity}" data-id="${item.id}">Редактировать</button>
        <button data-action="board-show-suggestions" data-node-key="${escapeAttr(menu.nodeKey)}">Показать связанные</button>
        <button data-action="board-start-connection" data-node-key="${escapeAttr(menu.nodeKey)}">Создать связь</button>
        <button class="danger" data-action="board-remove-item" data-node-key="${escapeAttr(menu.nodeKey)}">Убрать с доски</button>
      </div>
      <div class="board-control-grid compact">
        <div class="field">
          <label>Ширина</label>
          <input type="number" min="${BOARD_CARD_MIN_WIDTH}" max="520" step="10" value="${Math.round(item.width)}" data-board-card-width data-node-key="${escapeAttr(menu.nodeKey)}" />
        </div>
        <div class="field">
          <label>Высота</label>
          <input type="number" min="${BOARD_CARD_MIN_HEIGHT}" max="420" step="10" value="${Math.round(item.height)}" data-board-card-height data-node-key="${escapeAttr(menu.nodeKey)}" />
        </div>
      </div>
      <p class="tiny muted">Размер также меняется перетаскиванием угла карточки.</p>
    </div>
  `;
}

function renderEditor() {
  const { entity, id } = state.editor;
  const record = id ? byId(entity, id) : { ...(state.editor.defaults || {}) };
  const config = CONFIG[entity];
  return `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(config.singular)}" data-modal-stop>
        <div class="modal-head">
          <div>
            <h2>${id ? "Редактировать" : "Создать"}: ${escapeHtml(config.singular)}</h2>
            <p class="muted tiny">${escapeHtml(config.description)}</p>
          </div>
          <button class="btn ghost" type="button" data-action="close-modal">Закрыть</button>
        </div>
        <form id="entityForm" class="modal-body" data-entity="${entity}" data-id="${id || ""}">
          <div class="form-grid">
            ${config.fields.map((field) => renderFieldInput(field, record?.[field.key], record)).join("")}
          </div>
          <div class="actions" style="margin-top: 16px;">
            <button class="btn primary" type="submit">Сохранить</button>
            <button class="btn ghost" type="button" data-action="close-modal">Отмена</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderFieldInput(field, value, currentRecord) {
  value = normalizedFieldValue(field, value);
  const required = field.required ? "required" : "";
  const wide = field.wide || ["textarea", "multiRef"].includes(field.kind) ? "wide" : "";
  const isConditionalVisible = fieldVisibleForRecord(field, currentRecord);
  const rowClass = ["form-row", wide, isConditionalVisible ? "" : "hidden"].filter(Boolean).join(" ");
  const visibilityAttrs = field.visibleWhen
    ? `data-visible-field="${escapeAttr(field.visibleWhen.field)}" data-visible-values="${escapeAttr(field.visibleWhen.values.join("|"))}"`
    : "";
  const hint = field.hint ? `<span class="tiny muted">${escapeHtml(field.hint)}</span>` : "";
  if (field.kind === "textarea") {
    return `
      <div class="${rowClass}" ${visibilityAttrs}>
        <label>${escapeHtml(field.label)}</label>
        <textarea name="${field.key}" ${required} placeholder="${escapeAttr(field.placeholder || "")}">${escapeHtml(value || "")}</textarea>
        ${hint}
      </div>
    `;
  }
  if (field.kind === "select") {
    return `
      <div class="${rowClass}" ${visibilityAttrs}>
        <label>${escapeHtml(field.label)}</label>
        <select name="${field.key}" ${required}>
          <option value="">Не указано</option>
          ${(field.options || []).map((option) => `<option value="${escapeAttr(option)}" ${(value || "") === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
        </select>
        ${hint}
      </div>
    `;
  }
  if (field.kind === "ref") {
    const records = getRecords(field.entity).filter((item) => !field.filter || field.filter(item, currentRecord));
    return `
      <div class="${rowClass}" ${visibilityAttrs}>
        <label>${escapeHtml(field.label)}</label>
        <select name="${field.key}" ${required}>
          <option value="">Не указано</option>
          ${records.map((record) => `<option value="${record.id}" ${(value || "") === record.id ? "selected" : ""}>${escapeHtml(titleOf(field.entity, record.id))}</option>`).join("")}
        </select>
        ${hint}
      </div>
    `;
  }
  if (field.kind === "multiRef") {
    const values = new Set(asArray(value));
    const records = getRecords(field.entity).filter((item) => !field.filter || field.filter(item, currentRecord));
    return `
      <div class="${rowClass}" ${visibilityAttrs}>
        <label>${escapeHtml(field.label)}</label>
        <div class="multi-choice" data-multi-field="${field.key}">
          ${records.length ? records.map((record) => `
            <label class="multi-choice-item">
              <input type="checkbox" name="${field.key}" value="${record.id}" ${values.has(record.id) ? "checked" : ""} />
              <span>${escapeHtml(titleOf(field.entity, record.id))}</span>
            </label>
          `).join("") : `<div class="tiny muted">Нет доступных объектов для выбора.</div>`}
        </div>
        ${hint}
      </div>
    `;
  }
  return `
    <div class="${rowClass}" ${visibilityAttrs}>
      <label>${escapeHtml(field.label)}</label>
      <input name="${field.key}" type="${field.kind || "text"}" value="${escapeAttr(value || "")}" ${required} placeholder="${escapeAttr(field.placeholder || "")}" />
      ${hint}
    </div>
  `;
}

function normalizedFieldValue(field, value) {
  if (field.key !== "vampireClan") return value;
  if (value === "Бану Хаким") return "Ассамиты";
  if (value === "Тзимисхи") return "Цимисхи";
  if (["Министерство", "Геката"].includes(value)) return UNKNOWN_OPTION;
  return value;
}

function fieldVisibleForRecord(field, record) {
  if (!field.visibleWhen) return true;
  return field.visibleWhen.values.includes(record?.[field.visibleWhen.field] || "");
}

function fieldVisibleForForm(field, form) {
  if (!field.visibleWhen) return true;
  const value = form.elements[field.visibleWhen.field]?.value || "";
  return field.visibleWhen.values.includes(value);
}

function updateConditionalFieldVisibility(form) {
  form.querySelectorAll("[data-visible-field]").forEach((row) => {
    const value = form.elements[row.dataset.visibleField]?.value || "";
    const values = (row.dataset.visibleValues || "").split("|");
    const visible = values.includes(value);
    row.classList.toggle("hidden", !visible);
    if (!visible) {
      row.querySelectorAll("input, select, textarea").forEach((input) => {
        if (input.type === "checkbox" || input.type === "radio") input.checked = false;
        else input.value = "";
      });
    }
  });
}

function renderDetail() {
  const { entity, id } = state.detail;
  const record = byId(entity, id);
  if (!record) return "";
  const config = CONFIG[entity];
  return `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(config.singular)}" data-modal-stop>
        <div class="modal-head">
          <div>
            <h2>${escapeHtml(config.title(record))}</h2>
            <p class="muted tiny">${escapeHtml(config.singular)}</p>
          </div>
          <div class="actions">
            <button class="btn ghost" data-action="edit" data-entity="${entity}" data-id="${id}">Править</button>
            <button class="btn ghost" data-action="close-modal">Закрыть</button>
          </div>
        </div>
        <div class="modal-body">
          ${state.justCreated?.entity === entity && state.justCreated?.id === id ? `
            <div class="notice relation-suggestion">
              Объект создан. Теперь добавьте связанные элементы: сначала выберите тип, затем конкретный объект и подпишите связь.
            </div>
          ` : ""}
          ${renderBadges(entity, record)}
          <div class="detail-grid" style="margin-top: 16px;">
            ${config.fields.map((field) => `
              <div class="detail-label">${escapeHtml(field.label)}</div>
              <div class="detail-value">${formatValue(field, record[field.key])}</div>
            `).join("")}
          </div>
          ${entity === "characters" && isPlayerCharacter(record) ? renderCharacterMemoirs(record) : ""}
          <section style="margin-top: 22px;">
            <h3>Связи</h3>
            ${renderRelationships(entity, id)}
          </section>
        </div>
      </section>
    </div>
  `;
}

function renderCharacterMemoirs(character) {
  const memoirs = visibleData("memoirs")
    .filter((memoir) => memoir.authorId === character.id)
    .sort((a, b) => (b.entryDate || "").localeCompare(a.entryDate || ""));
  return `
    <section class="character-memoirs">
      <div class="view-head">
        <div>
          <h3>Мемуары персонажа</h3>
          <p>Личные записи от лица ${escapeHtml(CONFIG.characters.title(character))}.</p>
        </div>
        <button class="btn primary" data-action="new-memoir" data-character-id="${character.id}">Новая запись</button>
      </div>
      <div class="grid cards">
        ${memoirs.length ? memoirs.map((memoir) => renderRecordCard("memoirs", memoir)).join("") : `<div class="empty-state">У персонажа пока нет мемуаров.</div>`}
      </div>
    </section>
  `;
}

function renderRelationships(entity, id) {
  const rels = state.relationships.filter((rel) =>
    (rel.sourceType === entity && rel.sourceId === id) ||
    (rel.targetType === entity && rel.targetId === id)
  );
  const draftKey = `${entity}:${id}`;
  const editingRel = state.editingRelationshipId
    ? state.relationships.find((rel) => rel.id === state.editingRelationshipId)
    : null;
  const editingCurrentIsSource = editingRel?.sourceType === entity && editingRel?.sourceId === id;
  const editingTargetType = editingRel
    ? (editingCurrentIsSource ? editingRel.targetType : editingRel.sourceType)
    : "";
  const editingTargetId = editingRel
    ? (editingCurrentIsSource ? editingRel.targetId : editingRel.sourceId)
    : "";
  const selectedTargetType = state.relationDrafts[draftKey] || editingTargetType || "";
  const currentLabel = editingRel?.relationLabel || "";
  const labelIsDefault = !currentLabel || OPTIONS.relationshipLabels.includes(currentLabel);
  const labelMode = labelIsDefault ? (currentLabel || "связано") : "__custom";
  const targetRecords = selectedTargetType ? visibleData(selectedTargetType) : [];
  return `
    <div class="relation-list">
      ${rels.length ? rels.map((rel) => renderRelationshipItem(rel, entity, id)).join("") : `<div class="empty-state">Связей пока нет.</div>`}
    </div>
    <form id="relationshipForm" class="panel" style="margin-top: 14px;" data-source-entity="${entity}" data-source-id="${id}" data-relationship-id="${editingRel?.id || ""}">
      <h3>${editingRel ? "Редактировать связь" : "Добавить связь"}</h3>
      <div class="form-grid">
        <div class="form-row">
          <label>1. Тип элемента</label>
          <select name="targetType" data-relationship-type="${escapeAttr(draftKey)}" required>
            <option value="">Выберите тип</option>
            ${RELATION_ENTITY_KEYS.map((targetEntity) => `
              <option value="${targetEntity}" ${selectedTargetType === targetEntity ? "selected" : ""}>${escapeHtml(CONFIG[targetEntity].label)}</option>
            `).join("")}
          </select>
        </div>
        <div class="form-row">
          <label>2. Элемент</label>
          <select name="targetId" ${selectedTargetType ? "required" : "disabled"}>
            <option value="">${selectedTargetType ? "Выберите объект" : "Сначала выберите тип"}</option>
            ${targetRecords.map((record) => `<option value="${record.id}" ${editingTargetId === record.id ? "selected" : ""}>${escapeHtml(titleOf(selectedTargetType, record.id))}</option>`).join("")}
          </select>
        </div>
        <div class="form-row">
          <label>3. Тип связи</label>
          <select name="relationLabelPreset" data-relationship-label-mode>
            ${OPTIONS.relationshipLabels.map((label) => `
              <option value="${escapeAttr(label)}" ${labelMode === label ? "selected" : ""}>${escapeHtml(label)}</option>
            `).join("")}
            <option value="__custom" ${labelMode === "__custom" ? "selected" : ""}>Свое название...</option>
          </select>
        </div>
        <div class="form-row ${labelMode === "__custom" ? "" : "hidden"}" data-custom-relationship-label>
          <label>Свое название связи</label>
          <input name="relationLabelCustom" value="${escapeAttr(labelMode === "__custom" ? currentLabel : "")}" placeholder="например: должен услугу, шантажирует..." />
        </div>
        <div class="form-row wide">
          <label>Заметки к связи</label>
          <textarea name="notes">${escapeHtml(editingRel?.notes || "")}</textarea>
        </div>
      </div>
      <div class="actions" style="margin-top: 12px;">
        <button class="btn primary" type="submit">${editingRel ? "Сохранить связь" : "Добавить связь"}</button>
        ${editingRel ? `<button class="btn ghost" type="button" data-action="cancel-relationship-edit">Отмена правки</button>` : ""}
      </div>
    </form>
  `;
}

function renderRelationshipItem(rel, currentEntity, currentId) {
  const currentIsSource = rel.sourceType === currentEntity && rel.sourceId === currentId;
  const otherEntity = currentIsSource ? rel.targetType : rel.sourceType;
  const otherId = currentIsSource ? rel.targetId : rel.sourceId;
  return `
    <div class="relation-item">
      <div>
        <button class="inline-link" data-action="detail" data-entity="${otherEntity}" data-id="${otherId}">
          ${escapeHtml(CONFIG[otherEntity]?.singular || otherEntity)}: ${escapeHtml(titleOf(otherEntity, otherId))}
        </button>
        <div class="tiny muted">${escapeHtml(rel.relationLabel || "связано")}${rel.notes ? ` · ${escapeHtml(rel.notes)}` : ""}</div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-action="edit-relationship" data-id="${rel.id}">Править</button>
        <button class="btn danger" data-action="delete-relationship" data-id="${rel.id}">Удалить</button>
      </div>
    </div>
  `;
}

function formatValue(field, value) {
  if (field.kind === "ref") {
    return value ? linkedButton(field.entity, value) : `<span class="muted">—</span>`;
  }
  if (field.kind === "multiRef") {
    const values = asArray(value);
    return values.length ? values.map((id) => linkedButton(field.entity, id)).join(", ") : `<span class="muted">—</span>`;
  }
  if (Array.isArray(value)) {
    return value.length ? escapeHtml(value.join(", ")) : `<span class="muted">—</span>`;
  }
  return value ? escapeHtml(String(value)) : `<span class="muted">—</span>`;
}

function linkedButton(entity, id) {
  return `<button class="inline-link" data-action="detail" data-entity="${entity}" data-id="${id}">${escapeHtml(titleOf(entity, id))}</button>`;
}

function emptyState(message, entity) {
  return `
    <div class="empty-state">
      <p>${escapeHtml(message)}</p>
      ${entity && entity !== "campaigns" ? `<button class="btn primary" data-action="new" data-entity="${entity}">Создать</button>` : ""}
    </div>
  `;
}

document.addEventListener("submit", async (event) => {
  if (event.target.id === "loginForm") {
    event.preventDefault();
    const password = new FormData(event.target).get("password") || "";
    await runAction(async () => {
      await api("/api/login", { method: "POST", body: JSON.stringify({ password }) });
      state.auth = true;
      state.error = "";
      await loadData();
    });
    render();
  }
  if (event.target.id === "entityForm") {
    event.preventDefault();
    const form = event.target;
    const entity = form.dataset.entity;
    const id = form.dataset.id;
    const payload = collectEntityPayload(entity, form);
    await runAction(async () => {
      let saved;
      if (id) {
        saved = await api(`/api/${entity}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        saved = await api(`/api/${entity}`, { method: "POST", body: JSON.stringify(payload) });
      }
      await loadData();
      state.editor = null;
      if (entity === "investigationBoards" && saved?.id) {
        state.boardId = saved.id;
        state.view = "investigation";
        state.detail = null;
        state.justCreated = null;
      } else if (!id && saved?.id) {
        state.detail = { entity, id: saved.id };
        state.justCreated = { entity, id: saved.id };
      } else {
        state.justCreated = null;
      }
    });
    render();
  }
  if (event.target.id === "relationshipForm") {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const targetType = formData.get("targetType") || "";
    const targetId = formData.get("targetId") || "";
    const presetLabel = formData.get("relationLabelPreset") || "";
    const customLabel = String(formData.get("relationLabelCustom") || "").trim();
    const relationLabel = presetLabel === "__custom" ? customLabel : presetLabel;
    if (!targetType || !targetId) return;
    await runAction(async () => {
      const payload = {
        sourceType: form.dataset.sourceEntity,
        sourceId: form.dataset.sourceId,
        targetType,
        targetId,
        relationLabel,
        notes: formData.get("notes") || "",
      };
      if (form.dataset.relationshipId) {
        await api(`/api/relationships/${encodeURIComponent(form.dataset.relationshipId)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/relationships", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      await loadData();
      state.justCreated = null;
      state.editingRelationshipId = "";
      delete state.relationDrafts[`${form.dataset.sourceEntity}:${form.dataset.sourceId}`];
    });
    render();
  }
  if (event.target.id === "boardConnectionForm") {
    event.preventDefault();
    const form = event.target;
    const source = parseNodeKey(form.dataset.sourceKey);
    const target = parseNodeKey(form.dataset.targetKey);
    const formData = new FormData(form);
    const presetLabel = formData.get("relationLabelPreset") || "";
    const customLabel = String(formData.get("relationLabelCustom") || "").trim();
    const relationLabel = presetLabel === "__custom" ? customLabel : presetLabel;
    await runAction(async () => {
      const payload = {
        sourceType: source.entity,
        sourceId: source.id,
        targetType: target.entity,
        targetId: target.id,
        relationLabel: relationLabel || "связано",
        notes: formData.get("notes") || "",
        edgeColor: formData.get("edgeColor") || "",
        arrowDirection: formData.get("arrowDirection") || "",
      };
      if (form.dataset.relationshipId) {
        await api(`/api/relationships/${encodeURIComponent(form.dataset.relationshipId)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/relationships", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      await loadData();
      state.boardConnection = null;
      state.boardSelectedKey = form.dataset.targetKey;
      state.boardSelectedRelationshipId = "";
    });
    render();
  }
  if (event.target.id === "boardRelationshipForm") {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const presetLabel = formData.get("relationLabelPreset") || "";
    const customLabel = String(formData.get("relationLabelCustom") || "").trim();
    const relationLabel = presetLabel === "__custom" ? customLabel : presetLabel;
    await runAction(async () => {
      await saveRelationshipPatch(form.dataset.relationshipId, {
        relationLabel: relationLabel || "связано",
        notes: formData.get("notes") || "",
        edgeColor: formData.get("edgeColor") || "",
        arrowDirection: formData.get("arrowDirection") || "",
      });
    });
    render();
  }
});

document.addEventListener("click", async (event) => {
  if (state.suppressClickUntil && Date.now() < state.suppressClickUntil) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const modalContent = event.target.closest("[data-modal-stop]");
  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) {
    if (state.boardContextMenu && !event.target.closest("[data-board-context-menu]")) {
      state.boardContextMenu = null;
      render();
    }
    return;
  }
  const action = actionElement.dataset.action;
  if (modalContent && action === "close-modal" && event.target !== actionElement) return;

  if (action === "nav") {
    state.boardContextMenu = null;
    state.view = actionElement.dataset.view;
    state.search = state.view === "search" ? state.search : "";
    render();
  }
  if (action === "new") {
    state.editor = { entity: actionElement.dataset.entity, id: "" };
    state.detail = null;
    state.justCreated = null;
    render();
  }
  if (action === "new-memoir") {
    state.editor = {
      entity: "memoirs",
      id: "",
      defaults: { authorId: actionElement.dataset.characterId },
    };
    state.detail = null;
    state.justCreated = null;
    render();
  }
  if (action === "edit") {
    state.boardContextMenu = null;
    state.editor = { entity: actionElement.dataset.entity, id: actionElement.dataset.id };
    state.detail = null;
    state.justCreated = null;
    render();
  }
  if (action === "detail") {
    state.boardContextMenu = null;
    state.detail = { entity: actionElement.dataset.entity, id: actionElement.dataset.id };
    state.editor = null;
    state.editingRelationshipId = "";
    render();
  }
  if (action === "select-graph-node") {
    state.graphSelectedNodeKey = actionElement.dataset.nodeKey;
    state.graphSelectedEdgeId = "";
    render();
  }
  if (action === "select-graph-edge") {
    state.graphSelectedEdgeId = actionElement.dataset.relationshipId;
    state.graphSelectedNodeKey = "";
    render();
  }
  if (action === "board-select-relationship") {
    state.boardSelectedRelationshipId = actionElement.dataset.relationshipId;
    state.boardSelectedKey = "";
    state.boardSelectedGroupId = "";
    state.boardConnection = null;
    state.boardContextMenu = null;
    render();
  }
  if (action === "open-graph-node") {
    state.detail = { entity: actionElement.dataset.entity, id: actionElement.dataset.id };
    state.editor = null;
    state.editingRelationshipId = "";
    render();
  }
  if (action === "reset-graph-node-style") {
    await runAction(async () => {
      await saveRecordPatch(actionElement.dataset.entity, actionElement.dataset.id, {
        graphNodeColor: "",
        graphTextColor: "",
        graphNodeScale: "",
      });
    });
    render();
  }
  if (action === "reset-graph-edge-style") {
    await runAction(async () => {
      await saveRelationshipPatch(actionElement.dataset.relationshipId, {
        edgeColor: "",
        arrowDirection: "",
      });
    });
    render();
  }
  if (action === "reset-entity-style") {
    await runAction(async () => {
      await saveGraphTypeStyle(actionElement.dataset.entity, {
        nodeColor: "",
        textColor: "",
        nodeScale: "",
      });
    });
    render();
  }
  if (action === "board-select-card") {
    state.boardSelectedKey = actionElement.dataset.nodeKey;
    state.boardSelectedGroupId = "";
    state.boardSelectedRelationshipId = "";
    state.boardContextMenu = null;
    showBoardSuggestionsFor(actionElement.dataset.nodeKey);
    render();
  }
  if (action === "board-show-suggestions") {
    state.boardSelectedKey = actionElement.dataset.nodeKey;
    state.boardSelectedGroupId = "";
    state.boardSelectedRelationshipId = "";
    state.boardContextMenu = null;
    showBoardSuggestionsFor(actionElement.dataset.nodeKey);
    render();
  }
  if (action === "board-connector") {
    const targetKey = actionElement.dataset.nodeKey;
    if (state.boardConnection?.source && state.boardConnection.source !== targetKey) {
      await runAction(async () => {
        await quickConnectBoardCards(state.boardConnection.source, targetKey);
      });
    } else {
      state.boardSelectedKey = targetKey;
      state.boardSelectedGroupId = "";
      state.boardSelectedRelationshipId = "";
      state.boardContextMenu = null;
      state.boardConnection = { source: targetKey, sourceSide: actionElement.dataset.side || "", target: "", quick: true };
    }
    render();
  }
  if (action === "board-create-note") {
    const position = state.boardContextMenu?.position;
    state.boardContextMenu = null;
    await runAction(async () => {
      await createBoardRecordAt("notes", position);
    });
    render();
  }
  if (action === "board-create-hypothesis") {
    const position = state.boardContextMenu?.position;
    state.boardContextMenu = null;
    await runAction(async () => {
      await createBoardRecordAt("theories", position, { title: "Новая гипотеза", status: "Черновик" });
    });
    render();
  }
  if (action === "board-select-group") {
    state.boardSelectedGroupId = actionElement.dataset.groupId;
    state.boardSelectedKey = "";
    state.boardSelectedRelationshipId = "";
    state.boardConnection = null;
    state.boardContextMenu = null;
    render();
  }
  if (action === "board-add-item") {
    await runAction(async () => {
      await addItemToBoard(actionElement.dataset.entity, actionElement.dataset.id);
    });
    state.boardSelectedGroupId = "";
    state.boardSelectedRelationshipId = "";
    render();
  }
  if (action === "board-add-and-connect") {
    await runAction(async () => {
      const targetKey = nodeKey(actionElement.dataset.entity, actionElement.dataset.id);
      const sourceKey = state.boardSelectedKey;
      await addItemToBoard(actionElement.dataset.entity, actionElement.dataset.id);
      if (sourceKey && sourceKey !== targetKey) {
        state.boardConnection = { source: sourceKey, target: targetKey };
        state.boardSelectedKey = targetKey;
        state.boardSelectedGroupId = "";
      }
    });
    render();
  }
  if (action === "board-remove-item") {
    state.boardContextMenu = null;
    await runAction(async () => {
      await removeItemFromBoard(actionElement.dataset.nodeKey);
    });
    render();
  }
  if (action === "board-start-connection") {
    state.boardContextMenu = null;
    state.boardSelectedKey = actionElement.dataset.nodeKey;
    state.boardSelectedRelationshipId = "";
    state.boardConnection = { source: actionElement.dataset.nodeKey, target: "" };
    render();
  }
  if (action === "board-finish-connection") {
    if (state.boardConnection?.source && state.boardConnection.source !== actionElement.dataset.nodeKey) {
      state.boardConnection = { source: state.boardConnection.source, target: actionElement.dataset.nodeKey };
      state.boardSelectedKey = actionElement.dataset.nodeKey;
      state.boardSelectedRelationshipId = "";
      render();
    }
  }
  if (action === "board-cancel-connection") {
    state.boardConnection = null;
    render();
  }
  if (action === "board-cancel-relationship-edit") {
    state.boardSelectedRelationshipId = "";
    render();
  }
  if (action === "board-add-group") {
    const board = currentBoard();
    await runAction(async () => {
      const groups = boardGroups(board);
      groups.push({
        id: `group_${Date.now().toString(36)}`,
        title: "Новая группа",
        color: "#6f91c4",
        borderStyle: "dashed",
        borderWidth: 1,
        x: 140 + groups.length * 32,
        y: 120 + groups.length * 32,
        width: 480,
        height: 320,
      });
      await saveBoardGroups(board, groups);
      state.boardSelectedGroupId = groups[groups.length - 1].id;
      state.boardSelectedKey = "";
    });
    render();
  }
  if (action === "board-remove-group") {
    const board = currentBoard();
    await runAction(async () => {
      await saveBoardGroups(board, boardGroups(board).filter((group) => group.id !== actionElement.dataset.groupId));
    });
    if (state.boardSelectedGroupId === actionElement.dataset.groupId) state.boardSelectedGroupId = "";
    render();
  }
  if (action === "board-archive") {
    const board = byId("investigationBoards", actionElement.dataset.boardId);
    await runAction(async () => {
      await saveBoardPatch(board, { status: "Архив" });
      const next = getRecords("investigationBoards").find((item) => item.id !== board.id && item.status !== "Архив") || board;
      state.boardId = next?.id || "";
    });
    render();
  }
  if (action === "close-modal") {
    state.editor = null;
    state.detail = null;
    state.justCreated = null;
    state.editingRelationshipId = "";
    render();
  }
  if (action === "delete") {
    const entity = actionElement.dataset.entity;
    const id = actionElement.dataset.id;
    if (!confirm(`Удалить объект "${titleOf(entity, id)}"?`)) return;
    await runAction(async () => {
      await api(`/api/${entity}/${encodeURIComponent(id)}`, { method: "DELETE" });
      await loadData();
    });
    render();
  }
  if (action === "delete-relationship") {
    if (!confirm("Удалить эту связь?")) return;
    await runAction(async () => {
      await api(`/api/relationships/${encodeURIComponent(actionElement.dataset.id)}`, { method: "DELETE" });
      await loadData();
      if (state.editingRelationshipId === actionElement.dataset.id) {
        state.editingRelationshipId = "";
      }
      if (state.boardSelectedRelationshipId === actionElement.dataset.id) {
        state.boardSelectedRelationshipId = "";
      }
      if (state.graphSelectedEdgeId === actionElement.dataset.id) {
        state.graphSelectedEdgeId = "";
      }
    });
    render();
  }
  if (action === "edit-relationship") {
    const rel = state.relationships.find((item) => item.id === actionElement.dataset.id);
    state.editingRelationshipId = actionElement.dataset.id;
    if (rel && !state.detail) {
      state.detail = { entity: rel.sourceType, id: rel.sourceId };
    }
    if (rel && state.detail) {
      const currentIsSource = rel.sourceType === state.detail.entity && rel.sourceId === state.detail.id;
      const draftKey = `${state.detail.entity}:${state.detail.id}`;
      state.relationDrafts[draftKey] = currentIsSource ? rel.targetType : rel.sourceType;
    }
    render();
  }
  if (action === "cancel-relationship-edit") {
    state.editingRelationshipId = "";
    if (state.detail) {
      delete state.relationDrafts[`${state.detail.entity}:${state.detail.id}`];
    }
    render();
  }
  if (action === "logout") {
    await runAction(async () => {
      await api("/api/logout", { method: "POST", body: "{}" });
      state.auth = false;
      state.data = emptyData();
      state.relationships = [];
      state.search = "";
    });
    render();
  }
});

document.addEventListener("contextmenu", (event) => {
  const edge = event.target.closest(".whiteboard-link, .whiteboard-link-label");
  if (edge?.dataset.relationshipId) {
    event.preventDefault();
    state.boardSelectedRelationshipId = edge.dataset.relationshipId;
    state.boardSelectedKey = "";
    state.boardSelectedGroupId = "";
    state.boardConnection = null;
    state.boardContextMenu = null;
    render();
    return;
  }
  const card = event.target.closest(".whiteboard-card");
  const boardFrame = event.target.closest("[data-board-frame]");
  if (!card && !boardFrame) return;
  event.preventDefault();
  if (!card) {
    if (event.target.closest("button, input, select, textarea, .board-mini-suggestions, .edge-with-tooltip")) return;
    state.boardSelectedKey = "";
    state.boardSelectedGroupId = "";
    state.boardSelectedRelationshipId = "";
    state.boardConnection = null;
    state.boardSuggestionKey = "";
    state.boardSuggestionUntil = 0;
    state.boardContextMenu = {
      kind: "canvas",
      position: boardPositionFromClientPoint(boardFrame, event.clientX, event.clientY),
      x: clamp(event.clientX, 8, window.innerWidth - 300),
      y: clamp(event.clientY, 8, window.innerHeight - 190),
    };
    render();
    return;
  }
  if (!document.getElementById("investigationWhiteboard")?.contains(card)) return;
  state.boardSelectedKey = card.dataset.nodeKey;
  state.boardSelectedGroupId = "";
  state.boardSelectedRelationshipId = "";
  state.boardConnection = null;
  state.boardSuggestionKey = "";
  state.boardSuggestionUntil = 0;
  state.boardContextMenu = {
    kind: "card",
    nodeKey: card.dataset.nodeKey,
    x: clamp(event.clientX, 8, window.innerWidth - 300),
    y: clamp(event.clientY, 8, window.innerHeight - 330),
  };
  render();
});

document.addEventListener("input", (event) => {
  if (event.target.id === "globalSearch") {
    state.search = event.target.value;
    if (state.search.trim()) state.view = "search";
    render();
  }
  if (event.target.dataset.boardAddSearch !== undefined) {
    state.boardAddSearch = event.target.value;
    render();
  }
});

document.addEventListener("change", async (event) => {
  const entityForm = event.target.closest("#entityForm");
  if (entityForm) {
    updateConditionalFieldVisibility(entityForm);
  }
  if (event.target.dataset.filter) {
    state.filters[event.target.dataset.filter] = event.target.value;
    render();
  }
  if (event.target.dataset.boardSelect !== undefined) {
    state.boardId = event.target.value;
    state.boardSelectedKey = "";
    state.boardSelectedGroupId = "";
    state.boardSelectedRelationshipId = "";
    state.boardConnection = null;
    render();
  }
  if (event.target.dataset.boardStoryline !== undefined) {
    const board = byId("investigationBoards", event.target.dataset.boardId);
    await runAction(async () => {
      await saveBoardPatch(board, { storylineId: event.target.value || "" });
    });
    render();
  }
  if (event.target.dataset.boardAddType !== undefined) {
    state.boardAddType = event.target.value || "all";
    render();
  }
  if (event.target.dataset.boardCardWidth !== undefined) {
    await runAction(async () => {
      await updateBoardItemPatch(event.target.dataset.nodeKey, {
        width: clamp(Number(event.target.value || BOARD_CARD_DEFAULT_WIDTH), BOARD_CARD_MIN_WIDTH, 520),
      });
    });
    render();
  }
  if (event.target.dataset.boardCardHeight !== undefined) {
    await runAction(async () => {
      await updateBoardItemPatch(event.target.dataset.nodeKey, {
        height: clamp(Number(event.target.value || BOARD_CARD_DEFAULT_HEIGHT), BOARD_CARD_MIN_HEIGHT, 420),
      });
    });
    render();
  }
  if (event.target.dataset.boardGroupTitle !== undefined) {
    await runAction(async () => {
      await updateBoardGroupPatch(event.target.dataset.groupId, {
        title: event.target.value.trim() || "Группа",
      });
    });
    render();
  }
  if (event.target.dataset.boardGroupWidth !== undefined) {
    await runAction(async () => {
      await updateBoardGroupPatch(event.target.dataset.groupId, {
        width: clamp(Number(event.target.value || 460), 240, 1200),
      });
    });
    render();
  }
  if (event.target.dataset.boardGroupHeight !== undefined) {
    await runAction(async () => {
      await updateBoardGroupPatch(event.target.dataset.groupId, {
        height: clamp(Number(event.target.value || 300), 180, 900),
      });
    });
    render();
  }
  if (event.target.dataset.boardGroupColor !== undefined) {
    await runAction(async () => {
      await updateBoardGroupPatch(event.target.dataset.groupId, {
        color: event.target.value || "#6f91c4",
      });
    });
    render();
  }
  if (event.target.dataset.boardGroupBorderWidth !== undefined) {
    await runAction(async () => {
      await updateBoardGroupPatch(event.target.dataset.groupId, {
        borderWidth: clamp(Number(event.target.value || 1), 1, 8),
      });
    });
    render();
  }
  if (event.target.dataset.boardGroupBorderStyle !== undefined) {
    await runAction(async () => {
      await updateBoardGroupPatch(event.target.dataset.groupId, {
        borderStyle: event.target.value || "dashed",
      });
    });
    render();
  }
  if (event.target.dataset.relationshipType) {
    state.relationDrafts[event.target.dataset.relationshipType] = event.target.value;
    render();
  }
  if (event.target.dataset.relationshipLabelMode !== undefined) {
    const form = event.target.closest("form");
    const customField = form?.querySelector("[data-custom-relationship-label]");
    customField?.classList.toggle("hidden", event.target.value !== "__custom");
  }
  if (event.target.dataset.graphFocus !== undefined) {
    state.graphFocusKey = event.target.value;
    render();
  }
  if (event.target.dataset.graphDepth !== undefined) {
    state.graphDepth = event.target.value;
    render();
  }
  if (event.target.dataset.graphNodeColor !== undefined) {
    await runAction(async () => {
      await saveRecordPatch(event.target.dataset.entity, event.target.dataset.id, {
        graphNodeColor: event.target.value || "",
      });
    });
    render();
  }
  if (event.target.dataset.graphNodeTextColor !== undefined) {
    await runAction(async () => {
      await saveRecordPatch(event.target.dataset.entity, event.target.dataset.id, {
        graphTextColor: event.target.value || "",
      });
    });
    render();
  }
  if (event.target.dataset.graphSelectedNodeScale !== undefined) {
    const scale = clamp(Number(event.target.value || 100) / 100, 0.6, 1.9);
    await runAction(async () => {
      await saveRecordPatch(event.target.dataset.entity, event.target.dataset.id, {
        graphNodeScale: scale,
      });
    });
    render();
  }
  if (event.target.dataset.graphSelectedEdgeColor !== undefined) {
    await runAction(async () => {
      await saveRelationshipPatch(event.target.dataset.relationshipId, {
        edgeColor: event.target.value || "",
      });
    });
    render();
  }
  if (event.target.dataset.graphArrowDirection !== undefined) {
    await runAction(async () => {
      await saveRelationshipPatch(event.target.dataset.relationshipId, {
        arrowDirection: event.target.value || "",
      });
    });
    render();
  }
  if (event.target.dataset.entityStyleColor !== undefined) {
    await runAction(async () => {
      await saveGraphTypeStyle(event.target.dataset.entity, {
        nodeColor: event.target.value || "",
      });
    });
    render();
  }
  if (event.target.dataset.entityStyleTextColor !== undefined) {
    await runAction(async () => {
      await saveGraphTypeStyle(event.target.dataset.entity, {
        textColor: event.target.value || "",
      });
    });
    render();
  }
  if (event.target.dataset.entityStyleScale !== undefined) {
    const scale = clamp(Number(event.target.value || 100) / 100, 0.6, 1.9);
    await runAction(async () => {
      await saveGraphTypeStyle(event.target.dataset.entity, {
        nodeScale: scale,
      });
    });
    render();
  }
  if (event.target.dataset.graphCharacterStatus !== undefined) {
    state.graphCharacterStatuses[event.target.dataset.graphCharacterStatus] = event.target.checked;
    if (state.graphFocusKey) {
      const available = new Set(graphAvailableNodes().map((node) => node.key));
      if (!available.has(state.graphFocusKey)) state.graphFocusKey = "";
    }
    render();
  }
  if (event.target.dataset.graphType) {
    state.graphTypes[event.target.dataset.graphType] = event.target.checked;
    if (state.graphFocusKey) {
      const available = new Set(graphAvailableNodes().map((node) => node.key));
      if (!available.has(state.graphFocusKey)) state.graphFocusKey = "";
    }
    render();
  }
});

document.addEventListener("pointerdown", (event) => {
  const connector = event.target.closest(".board-connector");
  if (connector) {
    if (event.button !== 0) return;
    const sourceKey = connector.dataset.nodeKey;
    const activeSource = state.boardConnection?.source;
    if (activeSource && activeSource !== sourceKey) return;
    event.preventDefault();
    event.stopPropagation();
    state.boardSelectedKey = sourceKey;
    state.boardSelectedGroupId = "";
    state.boardSelectedRelationshipId = "";
    state.boardContextMenu = null;
    state.boardConnection = {
      source: sourceKey,
      sourceSide: connector.dataset.side || "",
      target: "",
      quick: true,
    };
    state.drag = {
      kind: "board-connect",
      sourceKey,
      sourceSide: connector.dataset.side || "",
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      moved: false,
    };
    render();
    state.drag.preview = createBoardConnectionPreview(sourceKey, state.drag.sourceSide, event.clientX, event.clientY);
    return;
  }

  const groupResizeHandle = event.target.closest("[data-drag-kind='board-group-resize']");
  if (groupResizeHandle) {
    const groupElement = groupResizeHandle.closest(".whiteboard-group");
    const board = currentBoard();
    const group = boardGroups(board).find((item) => item.id === groupResizeHandle.dataset.groupId);
    if (!groupElement || !group) return;
    event.preventDefault();
    state.boardSelectedGroupId = group.id;
    state.boardSelectedKey = "";
    state.boardSelectedRelationshipId = "";
    state.drag = {
      kind: "board-group-resize",
      element: groupElement,
      groupId: group.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: group.width,
      startHeight: group.height,
      zoom: Number(document.getElementById("investigationWhiteboard")?.dataset.zoom || 1),
      moved: false,
    };
    groupElement.classList.add("resizing");
    return;
  }

  const cardResizeHandle = event.target.closest("[data-drag-kind='board-card-resize']");
  if (cardResizeHandle) {
    const card = cardResizeHandle.closest(".whiteboard-card");
    if (!card) return;
    event.preventDefault();
    state.boardSelectedKey = card.dataset.nodeKey;
    state.boardSelectedGroupId = "";
    state.boardSelectedRelationshipId = "";
    state.drag = {
      kind: "board-card-resize",
      element: card,
      nodeKey: card.dataset.nodeKey,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: Number(card.dataset.width || BOARD_CARD_DEFAULT_WIDTH),
      startHeight: Number(card.dataset.height || BOARD_CARD_DEFAULT_HEIGHT),
      zoom: Number(document.getElementById("investigationWhiteboard")?.dataset.zoom || 1),
      moved: false,
    };
    card.classList.add("resizing");
    return;
  }

  const paletteItem = event.target.closest("[data-board-drag-entity]");
  if (paletteItem && !event.target.closest("button, input, select, textarea")) {
    const frame = document.querySelector("[data-board-frame]");
    if (!frame) return;
    event.preventDefault();
    state.drag = {
      kind: "board-add-drag",
      entity: paletteItem.dataset.boardDragEntity,
      id: paletteItem.dataset.boardDragId,
      element: createBoardDragGhost(paletteItem, event.clientX, event.clientY),
      sourceElement: paletteItem,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    };
    paletteItem.classList.add("drag-source");
    return;
  }

  const groupHandle = event.target.closest("[data-drag-kind='board-group']");
  if (groupHandle) {
    if (event.target.closest("button")) return;
    const groupElement = groupHandle.closest(".whiteboard-group");
    const board = currentBoard();
    if (!groupElement || !board) return;
    event.preventDefault();
    try {
      groupElement.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is best-effort; dragging still works through document listeners.
    }
    const group = boardGroups(board).find((item) => item.id === groupElement.dataset.groupId);
    if (!group) return;
    state.boardSelectedGroupId = group.id;
    state.boardSelectedKey = "";
    state.boardSelectedRelationshipId = "";
    const contained = boardItems(board)
      .filter((item) => item.x >= group.x && item.x <= group.x + group.width && item.y >= group.y && item.y <= group.y + group.height)
      .map((item) => ({ ...item, key: nodeKey(item.entity, item.id) }));
    state.drag = {
      kind: "board-group",
      element: groupElement,
      groupId: group.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: group.x,
      startY: group.y,
      zoom: Number(document.getElementById("investigationWhiteboard")?.dataset.zoom || 1),
      contained,
      moved: false,
    };
    groupElement.classList.add("dragging");
    return;
  }

  const boardHandle = event.target.closest("[data-drag-kind='board']");
  if (boardHandle) {
    const card = boardHandle.closest(".whiteboard-card");
    if (!card) return;
    event.preventDefault();
    try {
      card.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is best-effort; dragging still works through document listeners.
    }
    state.boardSelectedKey = card.dataset.nodeKey;
    state.boardSelectedGroupId = "";
    state.boardSelectedRelationshipId = "";
    state.drag = {
      kind: "board",
      element: card,
      nodeKey: card.dataset.nodeKey,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: Number(card.dataset.x || 0),
      startY: Number(card.dataset.y || 0),
      zoom: Number(document.getElementById("investigationWhiteboard")?.dataset.zoom || 1),
      moved: false,
    };
    card.classList.add("dragging");
    return;
  }

  const graphNode = event.target.closest(".graph-node");
  if (graphNode && document.getElementById("forceGraph")?.contains(graphNode)) {
    event.preventDefault();
    const runtime = state.graphRuntime;
    const node = runtime?.nodes.get(graphNode.dataset.nodeKey);
    if (!runtime || !node) return;
    state.drag = {
      kind: "graph",
      element: graphNode,
      entity: graphNode.dataset.entity,
      id: graphNode.dataset.id,
      svg: runtime.svg,
      node,
      moved: false,
    };
    graphNode.classList.add("dragging");
    return;
  }

  const boardFrame = event.target.closest("[data-board-frame]");
  if (
    boardFrame &&
    !event.target.closest("button, input, select, textarea, .whiteboard-card, .whiteboard-group, .board-mini-suggestions, .edge-with-tooltip")
  ) {
    event.preventDefault();
    state.drag = {
      kind: "board-pan",
      element: boardFrame,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: boardFrame.scrollLeft,
      startScrollTop: boardFrame.scrollTop,
      moved: false,
    };
    boardFrame.classList.add("panning");
    return;
  }

  const graphWrap = event.target.closest("#forceGraph");
  if (
    graphWrap &&
    !event.target.closest("button, input, select, textarea, .graph-node, .graph-edge, .graph-edge-label")
  ) {
    event.preventDefault();
    const svg = graphWrap.querySelector(".graph-svg");
    if (!svg) return;
    state.drag = {
      kind: "graph-pan",
      element: graphWrap,
      svg,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startViewport: { ...state.graphViewport },
      moved: false,
    };
    graphWrap.classList.add("panning");
  }
});

document.addEventListener("pointermove", (event) => {
  if (!state.drag) return;
  if (state.drag.kind === "board-connect") {
    const dx = event.clientX - state.drag.startClientX;
    const dy = event.clientY - state.drag.startClientY;
    state.drag.lastClientX = event.clientX;
    state.drag.lastClientY = event.clientY;
    state.drag.moved = state.drag.moved || Math.abs(dx) + Math.abs(dy) > 4;
    updateBoardConnectionPreview(state.drag.preview, event.clientX, event.clientY);
    return;
  }
  if (state.drag.kind === "board-add-drag") {
    const dx = event.clientX - state.drag.startClientX;
    const dy = event.clientY - state.drag.startClientY;
    state.drag.lastClientX = event.clientX;
    state.drag.lastClientY = event.clientY;
    moveBoardDragGhost(state.drag.element, event.clientX, event.clientY);
    document.querySelectorAll("[data-board-frame].drop-target").forEach((frame) => frame.classList.remove("drop-target"));
    const frame = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-board-frame]");
    frame?.classList.add("drop-target");
    state.drag.moved = state.drag.moved || Math.abs(dx) + Math.abs(dy) > 4;
    return;
  }
  if (state.drag.kind === "board-card-resize") {
    const screenDx = event.clientX - state.drag.startClientX;
    const screenDy = event.clientY - state.drag.startClientY;
    const zoom = clamp(Number(state.drag.zoom) || 1, 0.35, 2.4);
    const width = clamp(state.drag.startWidth + screenDx / zoom, BOARD_CARD_MIN_WIDTH, 520);
    const height = clamp(state.drag.startHeight + screenDy / zoom, BOARD_CARD_MIN_HEIGHT, 420);
    state.drag.element.dataset.width = String(width);
    state.drag.element.dataset.height = String(height);
    state.drag.element.style.width = `${width}px`;
    state.drag.element.style.height = `${height}px`;
    state.drag.moved = state.drag.moved || Math.abs(screenDx) + Math.abs(screenDy) > 4;
    updateWhiteboardLinks();
    return;
  }
  if (state.drag.kind === "board-group-resize") {
    const screenDx = event.clientX - state.drag.startClientX;
    const screenDy = event.clientY - state.drag.startClientY;
    const zoom = clamp(Number(state.drag.zoom) || 1, 0.35, 2.4);
    const width = clamp(state.drag.startWidth + screenDx / zoom, 240, 1200);
    const height = clamp(state.drag.startHeight + screenDy / zoom, 180, 900);
    state.drag.element.dataset.width = String(width);
    state.drag.element.dataset.height = String(height);
    state.drag.element.style.width = `${width}px`;
    state.drag.element.style.height = `${height}px`;
    state.drag.moved = state.drag.moved || Math.abs(screenDx) + Math.abs(screenDy) > 4;
    return;
  }
  if (state.drag.kind === "board") {
    const screenDx = event.clientX - state.drag.startClientX;
    const screenDy = event.clientY - state.drag.startClientY;
    const zoom = clamp(Number(state.drag.zoom) || 1, 0.35, 2.4);
    const dx = screenDx / zoom;
    const dy = screenDy / zoom;
    const x = clamp(state.drag.startX + dx, 20, 1820);
    const y = clamp(state.drag.startY + dy, 20, 1120);
    state.drag.element.dataset.x = String(x);
    state.drag.element.dataset.y = String(y);
    state.drag.element.style.transform = `translate(${x}px, ${y}px)`;
    state.drag.moved = state.drag.moved || Math.abs(screenDx) + Math.abs(screenDy) > 4;
    updateWhiteboardLinks();
    return;
  }
  if (state.drag.kind === "board-group") {
    const screenDx = event.clientX - state.drag.startClientX;
    const screenDy = event.clientY - state.drag.startClientY;
    const zoom = clamp(Number(state.drag.zoom) || 1, 0.35, 2.4);
    const dx = screenDx / zoom;
    const dy = screenDy / zoom;
    const x = clamp(state.drag.startX + dx, 20, 1700);
    const y = clamp(state.drag.startY + dy, 20, 1040);
    state.drag.element.dataset.x = String(x);
    state.drag.element.dataset.y = String(y);
    state.drag.element.style.transform = `translate(${x}px, ${y}px)`;
    for (const item of state.drag.contained) {
      const card = document.querySelector(`.whiteboard-card[data-node-key="${cssEscape(item.key)}"]`);
      if (!card) continue;
      const nextX = item.x + dx;
      const nextY = item.y + dy;
      card.dataset.x = String(nextX);
      card.dataset.y = String(nextY);
      card.style.transform = `translate(${nextX}px, ${nextY}px)`;
    }
    state.drag.moved = state.drag.moved || Math.abs(screenDx) + Math.abs(screenDy) > 4;
    updateWhiteboardLinks();
    return;
  }
  if (state.drag.kind === "graph") {
    const point = clientToSvgPoint(state.drag.svg, event.clientX, event.clientY);
    state.drag.node.x = clamp(point.x, 45, 1055);
    state.drag.node.y = clamp(point.y, 55, 590);
    state.drag.node.vx = 0;
    state.drag.node.vy = 0;
    state.drag.node.fixed = true;
    state.drag.moved = true;
    updateGraphDom(state.graphRuntime);
    return;
  }
  if (state.drag.kind === "board-pan") {
    const dx = event.clientX - state.drag.startClientX;
    const dy = event.clientY - state.drag.startClientY;
    state.drag.element.scrollLeft = state.drag.startScrollLeft - dx;
    state.drag.element.scrollTop = state.drag.startScrollTop - dy;
    state.drag.moved = state.drag.moved || Math.abs(dx) + Math.abs(dy) > 4;
    return;
  }
  if (state.drag.kind === "graph-pan") {
    const dx = event.clientX - state.drag.startClientX;
    const dy = event.clientY - state.drag.startClientY;
    const rect = state.drag.svg.getBoundingClientRect();
    const viewBox = graphViewBox(state.drag.startViewport);
    state.graphViewport = normalizeGraphViewport({
      ...state.drag.startViewport,
      x: state.drag.startViewport.x - dx * (viewBox.width / Math.max(rect.width, 1)),
      y: state.drag.startViewport.y - dy * (viewBox.height / Math.max(rect.height, 1)),
    });
    applyGraphViewport(state.drag.svg);
    state.drag.moved = state.drag.moved || Math.abs(dx) + Math.abs(dy) > 4;
  }
});

document.addEventListener("pointerup", async () => {
  if (!state.drag) return;
  const drag = state.drag;
  state.drag = null;
  drag.element?.classList.remove("dragging");
  drag.element?.classList.remove("panning");
  drag.element?.classList.remove("resizing");
  drag.sourceElement?.classList.remove("drag-source");
  document.querySelectorAll("[data-board-frame].drop-target").forEach((frame) => frame.classList.remove("drop-target"));
  if (drag.kind === "board-connect") {
    state.suppressClickUntil = Date.now() + 250;
    const clientX = drag.lastClientX || drag.startClientX;
    const clientY = drag.lastClientY || drag.startClientY;
    const targetConnector = document.elementFromPoint(clientX, clientY)?.closest(".board-connector");
    const targetKey = targetConnector?.dataset.nodeKey || "";
    removeBoardConnectionPreview(drag.preview);
    if (targetKey && targetKey !== drag.sourceKey) {
      await runAction(async () => {
        await quickConnectBoardCards(drag.sourceKey, targetKey);
      });
    } else {
      state.boardSelectedKey = drag.sourceKey;
      state.boardSelectedGroupId = "";
    }
    render();
    return;
  }
  if (drag.moved) {
    state.suppressClickUntil = Date.now() + 250;
  }
  if (drag.kind === "board-add-drag") {
    const frame = document.elementFromPoint(drag.lastClientX || drag.startClientX, drag.lastClientY || drag.startClientY)?.closest("[data-board-frame]");
    drag.element?.remove();
    if (!frame) return;
    const position = boardPositionFromClientPoint(frame, drag.lastClientX || drag.startClientX, drag.lastClientY || drag.startClientY);
    await runAction(async () => {
      await addItemToBoard(drag.entity, drag.id, position);
      state.boardSelectedGroupId = "";
    });
    render();
    return;
  }
  if (drag.kind === "board-card-resize") {
    await updateBoardItemPatch(drag.nodeKey, {
      width: Number(drag.element.dataset.width || BOARD_CARD_DEFAULT_WIDTH),
      height: Number(drag.element.dataset.height || BOARD_CARD_DEFAULT_HEIGHT),
    });
    render();
    return;
  }
  if (drag.kind === "board-group-resize") {
    await updateBoardGroupPatch(drag.groupId, {
      width: Number(drag.element.dataset.width || drag.startWidth),
      height: Number(drag.element.dataset.height || drag.startHeight),
    });
    render();
    return;
  }
  if (drag.kind === "board") {
    const board = currentBoard();
    if (!board) return;
    const items = boardItems(board).map((item) =>
      nodeKey(item.entity, item.id) === drag.nodeKey
        ? { ...item, x: Number(drag.element.dataset.x || 0), y: Number(drag.element.dataset.y || 0) }
        : item
    );
    await saveBoardItems(board, items);
  }
  if (drag.kind === "board-group") {
    const board = currentBoard();
    if (!board) return;
    const dx = Number(drag.element.dataset.x || 0) - drag.startX;
    const dy = Number(drag.element.dataset.y || 0) - drag.startY;
    const groups = boardGroups(board).map((group) =>
      group.id === drag.groupId
        ? { ...group, x: Number(drag.element.dataset.x || 0), y: Number(drag.element.dataset.y || 0) }
        : group
    );
    const movedKeys = new Set(drag.contained.map((item) => item.key));
    const items = boardItems(board).map((item) => {
      const key = nodeKey(item.entity, item.id);
      const start = drag.contained.find((candidate) => candidate.key === key);
      return movedKeys.has(key) ? { ...item, x: start.x + dx, y: start.y + dy } : item;
    });
    await saveBoardPatch(board, { groups, items });
  }
  if (drag.kind === "graph") {
    drag.node.fixed = true;
    await saveRecordPosition(drag.entity, drag.id, "graphPosition", {
      x: Math.round(drag.node.x),
      y: Math.round(drag.node.y),
    });
  }
  if (drag.kind === "board-pan") {
    const board = currentBoard();
    if (!board) return;
    saveBoardViewportDebounced(board, {
      x: drag.element.scrollLeft,
      y: drag.element.scrollTop,
      zoom: Number(drag.element.querySelector("#investigationWhiteboard")?.dataset.zoom || boardViewport(board).zoom),
    }, 0);
  }
});

document.addEventListener("wheel", (event) => {
  const boardFrame = event.target.closest("[data-board-frame]");
  if (boardFrame) {
    if (event.target.closest("input, select, textarea, .board-mini-suggestions")) return;
    event.preventDefault();
    zoomWhiteboardAt(boardFrame, event);
    return;
  }
  const graphWrap = event.target.closest("#forceGraph");
  const svg = graphWrap?.querySelector(".graph-svg");
  if (svg) {
    event.preventDefault();
    zoomGraphAt(svg, event);
  }
}, { passive: false });

function initInteractiveSurfaces() {
  initEdgeTooltips();
  initWhiteboard();
  initForceGraph();
}

function initWhiteboard() {
  const board = document.getElementById("investigationWhiteboard");
  if (!board) return;
  const frame = board.closest("[data-board-frame]");
  const current = currentBoard();
  if (frame && current) {
    applyWhiteboardViewport(frame, boardViewport(current));
  }
  updateWhiteboardLinks();
}

function applyWhiteboardViewport(frame, viewport) {
  const canvas = frame.querySelector("#investigationWhiteboard");
  const world = frame.querySelector(".whiteboard-world");
  if (!canvas || !world) return;
  const zoom = clamp(Number(viewport.zoom) || 1, 0.35, 2.4);
  canvas.dataset.zoom = String(zoom);
  canvas.style.width = `${Math.round(BOARD_CANVAS_WIDTH * zoom)}px`;
  canvas.style.height = `${Math.round(BOARD_CANVAS_HEIGHT * zoom)}px`;
  world.style.transform = `scale(${zoom})`;
  frame.scrollLeft = Math.max(0, Number(viewport.x) || 0);
  frame.scrollTop = Math.max(0, Number(viewport.y) || 0);
}

function zoomWhiteboardAt(frame, event) {
  const board = currentBoard();
  const canvas = frame.querySelector("#investigationWhiteboard");
  const world = frame.querySelector(".whiteboard-world");
  if (!board || !canvas || !world) return;
  const oldZoom = clamp(Number(canvas.dataset.zoom) || boardViewport(board).zoom, 0.35, 2.4);
  const zoomFactor = Math.exp(-event.deltaY * 0.0011);
  const nextZoom = clamp(oldZoom * zoomFactor, 0.35, 2.4);
  if (Math.abs(nextZoom - oldZoom) < 0.001) return;
  const rect = frame.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  const worldX = (frame.scrollLeft + localX) / oldZoom;
  const worldY = (frame.scrollTop + localY) / oldZoom;
  canvas.dataset.zoom = String(nextZoom);
  canvas.style.width = `${Math.round(BOARD_CANVAS_WIDTH * nextZoom)}px`;
  canvas.style.height = `${Math.round(BOARD_CANVAS_HEIGHT * nextZoom)}px`;
  world.style.transform = `scale(${nextZoom})`;
  frame.scrollLeft = clamp(worldX * nextZoom - localX, 0, canvas.offsetWidth);
  frame.scrollTop = clamp(worldY * nextZoom - localY, 0, canvas.offsetHeight);
  saveBoardViewportDebounced(board, {
    x: frame.scrollLeft,
    y: frame.scrollTop,
    zoom: nextZoom,
  });
}

function createBoardDragGhost(source, clientX, clientY) {
  const ghost = document.createElement("div");
  ghost.className = "board-drag-ghost";
  const type = source.querySelector(".tiny")?.textContent?.trim() || "Элемент";
  const title = source.querySelector("strong")?.textContent?.trim() || "Карточка";
  ghost.innerHTML = `<span>${escapeHtml(type)}</span><strong>${escapeHtml(title)}</strong>`;
  document.body.appendChild(ghost);
  moveBoardDragGhost(ghost, clientX, clientY);
  return ghost;
}

function moveBoardDragGhost(ghost, clientX, clientY) {
  if (!ghost) return;
  ghost.style.transform = `translate(${clientX + 14}px, ${clientY + 14}px)`;
}

function boardConnectorScreenCenter(nodeKeyValue, side) {
  const connector = document.querySelector(
    `.board-connector[data-node-key="${cssEscape(nodeKeyValue)}"][data-side="${cssEscape(side || "right")}"]`
  );
  const element = connector || document.querySelector(`.whiteboard-card[data-node-key="${cssEscape(nodeKeyValue)}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function createBoardConnectionPreview(sourceKey, sourceSide, clientX, clientY) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  svg.classList.add("board-connection-preview");
  line.classList.add("board-connection-preview-line");
  svg.appendChild(line);
  document.body.appendChild(svg);
  const preview = {
    svg,
    line,
    sourceKey,
    sourceSide,
    startClientX: clientX,
    startClientY: clientY,
  };
  updateBoardConnectionPreview(preview, clientX, clientY);
  return preview;
}

function updateBoardConnectionPreview(preview, clientX, clientY) {
  if (!preview?.line) return;
  const start = boardConnectorScreenCenter(preview.sourceKey, preview.sourceSide) || {
    x: preview.startClientX,
    y: preview.startClientY,
  };
  preview.line.setAttribute("x1", start.x);
  preview.line.setAttribute("y1", start.y);
  preview.line.setAttribute("x2", clientX);
  preview.line.setAttribute("y2", clientY);
}

function removeBoardConnectionPreview(preview) {
  preview?.svg?.remove();
}

function boardPositionFromClientPoint(frame, clientX, clientY) {
  const canvas = frame.querySelector("#investigationWhiteboard");
  const zoom = clamp(Number(canvas?.dataset.zoom) || 1, 0.35, 2.4);
  const rect = frame.getBoundingClientRect();
  const x = (frame.scrollLeft + clientX - rect.left) / zoom - BOARD_CARD_DEFAULT_WIDTH / 2;
  const y = (frame.scrollTop + clientY - rect.top) / zoom - 28;
  return {
    x: Math.round(clamp(x, 20, BOARD_CANVAS_WIDTH - BOARD_CARD_DEFAULT_WIDTH - 20)),
    y: Math.round(clamp(y, 20, BOARD_CANVAS_HEIGHT - BOARD_CARD_DEFAULT_HEIGHT - 20)),
  };
}

function updateWhiteboardLinks() {
  const board = document.getElementById("investigationWhiteboard");
  if (!board) return;
  const centerFor = (key) => {
    const node = board.querySelector(`.whiteboard-card[data-node-key="${cssEscape(key)}"]`);
    if (!node) return null;
    const x = Number(node.dataset.x || 0) + node.offsetWidth / 2;
    const y = Number(node.dataset.y || 0) + node.offsetHeight / 2;
    return { x, y };
  };
  board.querySelectorAll(".whiteboard-link").forEach((line) => {
    const source = centerFor(line.dataset.sourceKey);
    const target = centerFor(line.dataset.targetKey);
    if (!source || !target) return;
    const offset = Number(line.dataset.parallelOffset || 0);
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = (-dy / distance) * offset;
    const ny = (dx / distance) * offset;
    line.setAttribute("x1", source.x + nx);
    line.setAttribute("y1", source.y + ny);
    line.setAttribute("x2", target.x + nx);
    line.setAttribute("y2", target.y + ny);
  });
  board.querySelectorAll(".whiteboard-link-label").forEach((label) => {
    const source = centerFor(label.dataset.sourceKey);
    const target = centerFor(label.dataset.targetKey);
    if (!source || !target) return;
    const offset = Number(label.dataset.parallelOffset || 0);
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = (-dy / distance) * offset;
    const ny = (dx / distance) * offset;
    label.setAttribute("x", (source.x + target.x) / 2 + nx);
    label.setAttribute("y", (source.y + target.y) / 2 + ny - 8);
  });
}

function initForceGraph() {
  const wrap = document.getElementById("forceGraph");
  const svg = wrap?.querySelector(".graph-svg");
  if (!svg) {
    if (state.graphRuntime?.raf) cancelAnimationFrame(state.graphRuntime.raf);
    state.graphRuntime = null;
    return;
  }
  if (state.graphRuntime?.raf) cancelAnimationFrame(state.graphRuntime.raf);
  applyGraphViewport(svg);
  const nodes = new Map();
  svg.querySelectorAll(".graph-node").forEach((element) => {
    nodes.set(element.dataset.nodeKey, {
      key: element.dataset.nodeKey,
      entity: element.dataset.entity,
      id: element.dataset.id,
      element,
      x: Number(element.dataset.x || 550),
      y: Number(element.dataset.y || 320),
      vx: 0,
      vy: 0,
      radius: Number(element.dataset.nodeRadius || 28),
      fixed: Boolean(byId(element.dataset.entity, element.dataset.id)?.graphPosition),
    });
  });
  const edges = Array.from(svg.querySelectorAll(".graph-edge")).map((line) => ({
    line,
    label: svg.querySelector(`.graph-edge-label[data-edge-index="${line.dataset.edgeIndex}"]`),
    sourceKey: line.dataset.sourceKey,
    targetKey: line.dataset.targetKey,
    parallelOffset: Number(line.dataset.parallelOffset || 0),
  }));
  state.graphRuntime = { svg, nodes, edges, raf: 0, tick: 0 };
  updateGraphDom(state.graphRuntime);
  runGraphSimulation(state.graphRuntime);
}

function runGraphSimulation(runtime) {
  const nodes = Array.from(runtime.nodes.values());
  const edges = runtime.edges;
  const step = () => {
    if (state.graphRuntime !== runtime) return;
    runtime.tick += 1;
    const alpha = Math.max(0.08, 0.85 * Math.exp(-runtime.tick / 600));
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distanceSq = dx * dx + dy * dy || 1;
        const distance = Math.sqrt(distanceSq);
        const force = Math.min(1800 / distanceSq, 0.9) * alpha;
        dx /= distance;
        dy /= distance;
        if (!a.fixed) {
          a.vx -= dx * force;
          a.vy -= dy * force;
        }
        if (!b.fixed) {
          b.vx += dx * force;
          b.vy += dy * force;
        }
      }
    }
    for (const edge of edges) {
      const source = runtime.nodes.get(edge.sourceKey);
      const target = runtime.nodes.get(edge.targetKey);
      if (!source || !target) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const desired = source.entity === "coteries" || target.entity === "coteries" ? 155 : 210;
      const force = (distance - desired) * 0.012 * alpha;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      if (!source.fixed) {
        source.vx += fx;
        source.vy += fy;
      }
      if (!target.fixed) {
        target.vx -= fx;
        target.vy -= fy;
      }
    }
    for (const node of nodes) {
      if (node.fixed) continue;
      node.vx *= 0.86;
      node.vy *= 0.86;
      node.x = clamp(node.x + node.vx, 45, 1055);
      node.y = clamp(node.y + node.vy, 55, 590);
    }
    updateGraphDom(runtime);
    runtime.raf = requestAnimationFrame(step);
  };
  runtime.raf = requestAnimationFrame(step);
}

function updateGraphDom(runtime) {
  if (!runtime) return;
  for (const node of runtime.nodes.values()) {
    node.element.setAttribute("transform", `translate(${node.x}, ${node.y})`);
    node.element.dataset.x = String(node.x);
    node.element.dataset.y = String(node.y);
  }
  for (const edge of runtime.edges) {
    const source = runtime.nodes.get(edge.sourceKey);
    const target = runtime.nodes.get(edge.targetKey);
    if (!source || !target) continue;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / distance;
    const uy = dy / distance;
    const nx = (-dy / distance) * edge.parallelOffset;
    const ny = (dx / distance) * edge.parallelOffset;
    edge.line.setAttribute("x1", source.x + ux * (source.radius + 4) + nx);
    edge.line.setAttribute("y1", source.y + uy * (source.radius + 4) + ny);
    edge.line.setAttribute("x2", target.x - ux * (target.radius + 8) + nx);
    edge.line.setAttribute("y2", target.y - uy * (target.radius + 8) + ny);
    if (edge.label) {
      edge.label.setAttribute("x", (source.x + target.x) / 2 + nx);
      edge.label.setAttribute("y", (source.y + target.y) / 2 + ny - 8);
    }
  }
}

function initEdgeTooltips() {
  if (document.body.dataset.edgeTooltipReady) return;
  document.body.dataset.edgeTooltipReady = "true";
  const tooltip = document.createElement("div");
  tooltip.className = "edge-tooltip";
  document.body.appendChild(tooltip);
  document.addEventListener("mousemove", (event) => {
    if (!tooltip.classList.contains("visible")) return;
    tooltip.style.left = `${event.clientX + 14}px`;
    tooltip.style.top = `${event.clientY + 14}px`;
  });
  document.addEventListener("mouseover", (event) => {
    const edge = event.target.closest(".edge-with-tooltip");
    if (!edge) return;
    tooltip.textContent = edge.dataset.edgeDetail || edge.dataset.edgeLabel || "Связь";
    tooltip.classList.add("visible");
    tooltip.style.left = `${event.clientX + 14}px`;
    tooltip.style.top = `${event.clientY + 14}px`;
  });
  document.addEventListener("mouseout", (event) => {
    if (!event.target.closest(".edge-with-tooltip")) return;
    tooltip.classList.remove("visible");
  });
}

async function saveRecordPosition(entity, id, field, position) {
  try {
    await saveRecordPatch(entity, id, { [field]: position });
  } catch (error) {
    state.error = error.message;
  }
}

async function saveRecordPatch(entity, id, patch) {
  const record = byId(entity, id);
  const previous = {};
  if (record) {
    for (const key of Object.keys(patch)) previous[key] = record[key];
    Object.assign(record, patch);
  }
  try {
    const saved = await api(`/api/${entity}/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });
    if (record) Object.assign(record, saved);
    return saved;
  } catch (error) {
    if (record) Object.assign(record, previous);
    throw error;
  }
}

async function saveRelationshipPatch(id, patch) {
  const rel = state.relationships.find((item) => item.id === id);
  if (!rel) throw new Error("Связь не найдена.");
  const previous = {};
  for (const key of Object.keys(patch)) previous[key] = rel[key];
  Object.assign(rel, patch);
  try {
    const saved = await api(`/api/relationships/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({
        sourceType: rel.sourceType,
        sourceId: rel.sourceId,
        targetType: rel.targetType,
        targetId: rel.targetId,
        relationLabel: rel.relationLabel || "",
        notes: rel.notes || "",
        ...patch,
      }),
    });
    const index = state.relationships.findIndex((item) => item.id === id);
    if (index !== -1) state.relationships[index] = saved;
    return saved;
  } catch (error) {
    Object.assign(rel, previous);
    throw error;
  }
}

async function saveGraphTypeStyle(entity, patch) {
  const campaign = campaignRecord();
  if (!campaign) throw new Error("Кампания не найдена.");
  const graphTypeStyles = { ...(campaign.graphTypeStyles || {}) };
  const current = { ...(graphTypeStyles[entity] || {}) };
  const next = { ...current, ...patch };
  if (!next.nodeColor) delete next.nodeColor;
  if (!next.textColor) delete next.textColor;
  if (!next.nodeScale) delete next.nodeScale;
  if (Object.keys(next).length) {
    graphTypeStyles[entity] = next;
  } else {
    delete graphTypeStyles[entity];
  }
  return saveRecordPatch("campaigns", campaign.id, { graphTypeStyles });
}

async function saveBoardPatch(board, patch) {
  if (!board) throw new Error("Доска не найдена.");
  const saved = await saveRecordPatch("investigationBoards", board.id, patch);
  const index = getRecords("investigationBoards").findIndex((item) => item.id === board.id);
  if (index !== -1) state.data.investigationBoards[index] = saved;
  return saved;
}

function setLocalBoardViewport(board, viewport) {
  const index = getRecords("investigationBoards").findIndex((item) => item.id === board?.id);
  if (index !== -1) {
    state.data.investigationBoards[index] = {
      ...state.data.investigationBoards[index],
      viewport: {
        x: Math.round(Math.max(0, Number(viewport.x) || 0)),
        y: Math.round(Math.max(0, Number(viewport.y) || 0)),
        zoom: Number(clamp(Number(viewport.zoom) || 1, 0.35, 2.4).toFixed(3)),
      },
    };
  }
}

function showBoardSuggestionsFor(nodeKeyValue, duration = 4200) {
  state.boardSuggestionKey = nodeKeyValue;
  state.boardSuggestionUntil = Date.now() + duration;
  window.clearTimeout(boardSuggestionTimer);
  boardSuggestionTimer = window.setTimeout(() => {
    if (state.boardSuggestionKey === nodeKeyValue && Date.now() >= state.boardSuggestionUntil) {
      state.boardSuggestionKey = "";
      state.boardSuggestionUntil = 0;
      render();
    }
  }, duration + 80);
}

function activeBoardSuggestionKey() {
  return state.boardSuggestionKey && Date.now() <= state.boardSuggestionUntil ? state.boardSuggestionKey : "";
}

function saveBoardViewportDebounced(board, viewport, delay = 260) {
  if (!board) return;
  const normalized = {
    x: Math.round(Math.max(0, Number(viewport.x) || 0)),
    y: Math.round(Math.max(0, Number(viewport.y) || 0)),
    zoom: Number(clamp(Number(viewport.zoom) || 1, 0.35, 2.4).toFixed(3)),
  };
  setLocalBoardViewport(board, normalized);
  window.clearTimeout(boardViewportSaveTimer);
  boardViewportSaveTimer = window.setTimeout(() => {
    saveBoardPatch(board, { viewport: normalized }).catch((error) => {
      state.error = error.message;
      render();
    });
  }, delay);
}

async function saveBoardItems(board, items) {
  return saveBoardPatch(board, {
    items: items.map((item) => ({
      entity: item.entity,
      id: item.id,
      x: Math.round(Number(item.x || 0)),
      y: Math.round(Number(item.y || 0)),
      width: Math.round(clamp(Number(item.width || BOARD_CARD_DEFAULT_WIDTH), BOARD_CARD_MIN_WIDTH, 520)),
      height: Math.round(clamp(Number(item.height || BOARD_CARD_DEFAULT_HEIGHT), BOARD_CARD_MIN_HEIGHT, 420)),
    })),
  });
}

async function saveBoardGroups(board, groups) {
  return saveBoardPatch(board, { groups });
}

async function updateBoardItemPatch(key, patch) {
  const board = currentBoard();
  if (!board) return;
  const items = boardItems(board).map((item) =>
    nodeKey(item.entity, item.id) === key ? { ...item, ...patch } : item
  );
  await saveBoardItems(board, items);
}

async function updateBoardGroupPatch(groupId, patch) {
  const board = currentBoard();
  if (!board) return;
  const groups = boardGroups(board).map((group) =>
    group.id === groupId ? { ...group, ...patch } : group
  );
  await saveBoardGroups(board, groups);
}

async function createBoardRecordAt(entity, position = null, overrides = {}) {
  const defaults = {
    notes: { title: "Новая заметка", text: "", notes: "" },
    theories: { title: "Новая гипотеза", status: "Черновик", description: "", notes: "" },
  };
  const payload = { ...(defaults[entity] || {}), ...overrides };
  const created = await api(`/api/${entity}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  await loadData();
  await addItemToBoard(entity, created.id, position);
  state.boardSelectedGroupId = "";
  state.boardContextMenu = null;
  return created;
}

async function quickConnectBoardCards(sourceKey, targetKey) {
  const source = parseNodeKey(sourceKey);
  const target = parseNodeKey(targetKey);
  if (!source.entity || !target.entity || sourceKey === targetKey) return;
  const existing = relationshipBetween(source.entity, source.id, target.entity, target.id);
  await api("/api/relationships", {
    method: "POST",
    body: JSON.stringify({
      sourceType: source.entity,
      sourceId: source.id,
      targetType: target.entity,
      targetId: target.id,
      relationLabel: existing?.relationLabel || "связано",
      notes: existing?.notes || "",
      edgeColor: existing?.edgeColor || "",
      arrowDirection: existing?.arrowDirection || "",
    }),
  });
  await loadData();
  state.boardConnection = null;
  state.boardSelectedKey = targetKey;
  state.boardSelectedGroupId = "";
  state.boardSelectedRelationshipId = "";
  state.boardContextMenu = null;
}

async function addItemToBoard(entity, id, position = null) {
  const board = currentBoard();
  if (!board || !BOARD_ENTITY_KEYS.includes(entity) || !byId(entity, id)) return;
  const items = boardItems(board);
  const key = nodeKey(entity, id);
  const existing = items.find((item) => nodeKey(item.entity, item.id) === key);
  if (existing) {
    if (position) {
      await saveBoardItems(board, items.map((item) =>
        nodeKey(item.entity, item.id) === key ? { ...item, x: position.x, y: position.y } : item
      ));
    }
    state.boardSelectedKey = key;
    return;
  }
  const defaultPosition = getBoardItemPosition({ entity, id }, items.length);
  const nextPosition = position || defaultPosition;
  items.push({
    entity,
    id,
    x: nextPosition.x,
    y: nextPosition.y,
    width: BOARD_CARD_DEFAULT_WIDTH,
    height: BOARD_CARD_DEFAULT_HEIGHT,
  });
  await saveBoardItems(board, items);
  state.boardSelectedKey = key;
}

async function removeItemFromBoard(key) {
  const board = currentBoard();
  if (!board) return;
  const items = boardItems(board).filter((item) => nodeKey(item.entity, item.id) !== key);
  await saveBoardItems(board, items);
  if (state.boardSelectedKey === key) state.boardSelectedKey = "";
  if (state.boardConnection?.source === key || state.boardConnection?.target === key) state.boardConnection = null;
}

function clientToSvgPoint(svg, clientX, clientY) {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

async function runAction(fn) {
  state.error = "";
  try {
    await fn();
  } catch (error) {
    state.error = error.message;
  }
}

function collectEntityPayload(entity, form) {
  const payload = {};
  const data = new FormData(form);
  for (const field of CONFIG[entity].fields) {
    if (!fieldVisibleForForm(field, form)) {
      payload[field.key] = field.kind === "multiRef" ? [] : "";
      continue;
    }
    if (field.kind === "multiRef") {
      payload[field.key] = Array.from(form.querySelectorAll(`[name="${field.key}"]:checked`)).map((input) => input.value);
    } else {
      payload[field.key] = data.get(field.key) || "";
    }
  }
  if (entity === "locations" && payload.level === "Город") {
    payload.parentCityId = "";
  }
  if (entity === "investigationBoards") {
    payload.status = payload.status || "Активна";
    payload.items = asArray(byId(entity, form.dataset.id)?.items);
    payload.groups = asArray(byId(entity, form.dataset.id)?.groups);
    payload.viewport = byId(entity, form.dataset.id)?.viewport || { x: 0, y: 0, zoom: 1 };
  }
  if (entity === "events") {
    delete payload.knownByIds;
  }
  if (entity === "facts") {
    delete payload.knownByIds;
    delete payload.unknownByIds;
  }
  if (entity === "clues") {
    delete payload.knownByIds;
  }
  if (entity === "characters") {
    if (payload.species !== "Вампир") payload.vampireClan = "";
    if (payload.vampireClan === "Бану Хаким") payload.vampireClan = "Ассамиты";
    if (payload.vampireClan === "Тзимисхи") payload.vampireClan = "Цимисхи";
    if (["Министерство", "Геката"].includes(payload.vampireClan)) payload.vampireClan = UNKNOWN_OPTION;
    if (payload.species !== "Гару") payload.garouTribe = "";
  }
  return payload;
}

function getRecords(entity) {
  return state.data[entity] || [];
}

function byId(entity, id) {
  return getRecords(entity).find((record) => record.id === id);
}

function titleOf(entity, id) {
  if (!id) return "";
  const record = byId(entity, id);
  if (!record) return "Удаленный объект";
  return CONFIG[entity]?.title(record) || record.title || record.name || record.id;
}

function visibleData(entity) {
  return getRecords(entity);
}

function isVisible(entity, id) {
  return Boolean(entity && id);
}

function getVisibleSets() {
  const sets = Object.fromEntries(ENTITY_KEYS.map((key) => [key, new Set()]));
  for (const entity of ENTITY_KEYS) {
    for (const record of getRecords(entity)) sets[entity].add(record.id);
  }
  return sets;
}

function expandBuiltIns(sets) {
  const add = (entity, id) => {
    if (entity && id && byId(entity, id)) sets[entity].add(id);
  };
  for (const character of getRecords("characters")) {
    if (sets.characters.has(character.id)) add("coteries", character.coterieId);
    if (sets.characters.has(character.id)) add("factions", character.factionId);
  }
  for (const coterie of getRecords("coteries")) {
    if (!sets.coteries.has(coterie.id)) continue;
    coterieMembers(coterie).forEach((character) => add("characters", character.id));
  }
  for (const faction of getRecords("factions")) {
    if (!sets.factions.has(faction.id)) continue;
    asArray(faction.memberIds).forEach((id) => add("characters", id));
    asArray(faction.allyIds).forEach((id) => add("factions", id));
    asArray(faction.enemyIds).forEach((id) => add("factions", id));
  }
  for (const location of getRecords("locations")) {
    if (sets.locations.has(location.id)) add("locations", location.parentCityId);
  }
  for (const storyline of getRecords("storylines")) {
    if (sets.storylines.has(storyline.id)) continue;
  }
}

function relatedRecords(entity, id) {
  const related = [];
  for (const rel of state.relationships) {
    if (rel.sourceType === entity && rel.sourceId === id) {
      const record = byId(rel.targetType, rel.targetId);
      if (record) related.push({ entity: rel.targetType, record, rel });
    }
    if (rel.targetType === entity && rel.targetId === id) {
      const record = byId(rel.sourceType, rel.sourceId);
      if (record) related.push({ entity: rel.sourceType, record, rel });
    }
  }
  return related;
}

function boardSuggestions(board, anchorKey = "", options = {}) {
  const onBoard = new Set(boardItems(board).map((item) => nodeKey(item.entity, item.id)));
  const suggestions = new Map();
  const addCandidate = (entity, id, reason = "") => {
    if (!BOARD_ENTITY_KEYS.includes(entity) || !id || !byId(entity, id)) return;
    const key = nodeKey(entity, id);
    if (onBoard.has(key) || suggestions.has(key)) return;
    suggestions.set(key, { entity, id, reason });
  };
  const addRelated = (entity, id, reason) => {
    for (const item of relatedRecords(entity, id)) {
      addCandidate(item.entity, item.record.id, reason || item.rel?.relationLabel || "связано");
    }
  };

  if (anchorKey) {
    const anchor = parseNodeKey(anchorKey);
    addRelated(anchor.entity, anchor.id, "связано с выбранным");
  } else if (board?.storylineId) {
    addCandidate("storylines", board.storylineId, "сюжетная линия");
    addRelated("storylines", board.storylineId, "из сюжетной линии");
  }

  for (const item of boardItems(board)) {
    addRelated(item.entity, item.id, "связано с доской");
  }

  if (!options.relatedOnly) {
    const query = state.boardAddSearch.trim().toLowerCase();
    for (const entity of BOARD_ENTITY_KEYS) {
      if (state.boardAddType !== "all" && state.boardAddType !== entity) continue;
      for (const record of getRecords(entity)) {
        if (query && !recordSearchText(entity, record).includes(query)) continue;
        addCandidate(entity, record.id, query ? "поиск" : "");
      }
    }
  }

  return Array.from(suggestions.values()).filter((item) =>
    state.boardAddType === "all" || state.boardAddType === item.entity || options.relatedOnly
  );
}

function relationshipBetween(sourceType, sourceId, targetType, targetId) {
  return state.relationships.find((rel) =>
    (rel.sourceType === sourceType && rel.sourceId === sourceId && rel.targetType === targetType && rel.targetId === targetId) ||
    (rel.sourceType === targetType && rel.sourceId === targetId && rel.targetType === sourceType && rel.targetId === sourceId)
  );
}

function areRelated(entityA, idA, entityB, idB) {
  return state.relationships.some((rel) =>
    (rel.sourceType === entityA && rel.sourceId === idA && rel.targetType === entityB && rel.targetId === idB) ||
    (rel.targetType === entityA && rel.targetId === idA && rel.sourceType === entityB && rel.sourceId === idB)
  );
}

function recordSearchText(entity, record) {
  const values = [];
  values.push(CONFIG[entity].title(record), CONFIG[entity].summary(record));
  for (const field of CONFIG[entity].fields) {
    const value = record[field.key];
    if (field.kind === "ref") values.push(titleOf(field.entity, value));
    else if (field.kind === "multiRef") values.push(...asArray(value).map((id) => titleOf(field.entity, id)));
    else values.push(value);
  }
  return values.flat().filter(Boolean).join(" ").toLowerCase();
}

function isPlayerCharacter(character) {
  if (!character) return false;
  if (["chr_julia", "chr_dietrich", "chr_ray", "chr_garrett"].includes(character.id)) return true;
  if (character.coterieId) return true;
  return String(character.characterType || "").toLowerCase().includes("игров");
}

function coterieMembers(coterie) {
  const explicit = asArray(coterie?.memberIds)
    .map((id) => byId("characters", id))
    .filter(Boolean);
  if (explicit.length) return explicit;
  return getRecords("characters").filter((character) =>
    character.coterieId === coterie?.id || isPlayerCharacter(character)
  );
}

function compareEventsAsc(a, b) {
  return eventSortKey(a).localeCompare(eventSortKey(b));
}

function compareEventsDesc(a, b) {
  return eventSortKey(b).localeCompare(eventSortKey(a));
}

function eventSortKey(event) {
  return `${event.gameDate || "9999-99-99"} ${event.gameTime || "99:99"} ${event.createdAt || ""}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function includesId(values, id) {
  return asArray(values).includes(id);
}

function truncate(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

boot();
