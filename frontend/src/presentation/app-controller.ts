import { AppStore } from "../application/store";
import { MentionIndex, SearchIndex, type MentionSuggestion } from "../domain/knowledge-search";
import { EntityChoicePolicy, EntityRegistry, RelationshipLabelPolicy } from "../domain/registry";
import { projectedSystemTagPaths } from "../domain/structured-tags";
import type { ChronicleRecord, EntityType } from "../domain/types";
import { ApiError, HttpChronicleGateway } from "../infrastructure/gateway";
import { asString, closestAction, escapeAttr, escapeHtml, truncate } from "../ui/dom";
import { BoardController } from "./board-controller";
import { EntityController, type EntityControllerHost } from "./entity-controller";
import { GraphController } from "./graph-controller";
import { KnowledgeController } from "./knowledge-controller";
import { ModalService, ToastService } from "./modal";

export class AppController implements EntityControllerHost {
  private readonly store = new AppStore();
  private readonly gateway = new HttpChronicleGateway();
  private readonly registry = new EntityRegistry();
  private readonly choices = new EntityChoicePolicy();
  private readonly labels = new RelationshipLabelPolicy();
  private readonly modal = new ModalService();
  private readonly toast = new ToastService();
  private readonly entities = new EntityController(this.store, this.registry, this.choices, this.labels, this.gateway, this.modal, this.toast, this);
  private readonly knowledge = new KnowledgeController(this.store, this.registry, this.gateway, this.modal, this.toast, this);
  private readonly board = new BoardController(this.store, this.registry, this.gateway, this.modal, this.toast, this, this.entities);
  private readonly graph = new GraphController(this.store, this.registry, this.gateway, this.modal, this.toast, this, this.entities);
  private content: HTMLElement | null = null;
  private readonly returnRoutes = new Map<string, string>();

  constructor(private readonly root: HTMLElement) {}

  async start(): Promise<void> {
    window.addEventListener("hashchange", () => this.renderRoute());
    this.root.addEventListener("click", (event) => void this.handleClick(event));
    this.root.addEventListener("submit", (event) => void this.handleSubmit(event));
    this.root.addEventListener("keydown", (event) => this.handleKeydown(event));
    try {
      const authenticated = await this.gateway.session();
      this.store.patch({ authenticated, loading: false });
      if (!authenticated) this.renderLogin();
      else {
        this.renderShell();
        await this.reload();
      }
    } catch (error) {
      this.renderFatal(error);
    }
  }

  async reload(): Promise<void> {
    const snapshot = await this.gateway.bootstrap();
    this.store.setSnapshot(snapshot);
    this.renderNavigation();
    this.renderRoute();
  }

  navigate(route: string): void {
    const current = this.route();
    if (route.startsWith("detail:") && current !== route) this.returnRoutes.set(route, current);
    const next = `#${route}`;
    if (window.location.hash === next) this.renderRoute();
    else window.location.hash = route;
  }

  currentRoute(): string {
    return this.route();
  }

  returnRoute(fallback: string): string {
    const current = this.route();
    return this.returnRoutes.get(current) ?? (current.startsWith("detail:") ? fallback : current || fallback);
  }

  private renderLogin(error = ""): void {
    this.root.innerHTML = `<main class="login-screen"><section class="login-card">
      <div class="brand-mark">VC</div><h1>Veerhau's Companion</h1><p>Введите общий пароль хроники.</p>
      <form data-login-form><label class="field"><span>Пароль</span><input type="password" name="password" autofocus required></label>
      <p class="form-error" ${error ? "" : "hidden"}>${escapeHtml(error)}</p><button class="btn primary wide-button" type="submit">Войти</button></form>
    </section></main>`;
  }

  private renderShell(): void {
    this.root.innerHTML = `<div class="shell">
      <aside class="sidebar"><div class="sidebar-head"><div class="brand-mark">VC</div><div><div class="sidebar-title">Veerhau's<br>Companion</div><div class="sidebar-subtitle">Хроника ночного города</div></div></div><nav data-navigation></nav></aside>
      <main class="main"><header class="topbar"><label class="search-box"><span>⌕</span><input type="search" data-global-search placeholder="Поиск по хронике"></label><button class="btn ghost" data-action="open-quick-switcher">Быстрый переход</button><button class="btn ghost" data-action="logout">Выйти</button></header><section class="content" data-content></section></main>
    </div>`;
    this.content = this.root.querySelector("[data-content]");
    this.renderNavigation();
  }

  private renderNavigation(): void {
    const nav = this.root.querySelector<HTMLElement>("[data-navigation]");
    if (!nav) return;
    const active = this.route();
    const button = (route: string, label: string, count?: number) => `<button class="nav-button ${active.startsWith(route) ? "active" : ""}" data-action="navigate" data-route="${route}"><span>${escapeHtml(label)}</span>${count === undefined ? "" : `<span class="count-pill">${count}</span>`}</button>`;
    nav.innerHTML = `
      ${button("dashboard", "Главная")}${button("coterie", "Котерия", this.coterieMembers().length)}
      <div class="nav-section">Хроника</div>
      ${this.registry.navigation().map((definition) => button(`entity:${definition.type}`, definition.label, this.store.records(definition.type).length)).join("")}
      <div class="nav-section">Исследование</div>
      ${button("board", "Доска расследования")}${button("graph", "Граф связей")}${button("timeline", "Таймлайн")}
      <div class="nav-section">База знаний</div>
      ${button("search", "Поиск")}${button("tags", "Теги")}${button("relationship-styles", "Стили связей")}${button("bookmarks", "Закладки", this.store.records("bookmarks").length)}${button("templates", "Шаблоны", this.store.records("entityTemplates").length)}`;
  }

  private renderRoute(): void {
    if (!this.content) return;
    this.graph.dispose();
    const route = this.route();
    const parts = route.split(":");
    if (parts[0] === "entity" && parts[1]) this.content.innerHTML = this.entities.renderList(parts[1] as EntityType);
    else if (parts[0] === "detail" && parts[1] && parts[2]) this.content.innerHTML = this.entities.renderDetail(parts[1] as EntityType, parts.slice(2).join(":"));
    else if (route === "coterie") this.content.innerHTML = this.renderCoterie();
    else if (route === "timeline") this.content.innerHTML = this.renderTimeline();
    else if (route === "search") this.content.innerHTML = this.knowledge.renderSearch();
    else if (route === "tags") this.content.innerHTML = this.knowledge.renderTags();
    else if (route === "relationship-styles") this.content.innerHTML = this.knowledge.renderRelationshipStyles();
    else if (route === "bookmarks") this.content.innerHTML = this.knowledge.renderBookmarks();
    else if (route === "templates") this.content.innerHTML = this.knowledge.renderTemplates();
    else if (route === "board") this.content.innerHTML = this.board.render();
    else if (route === "graph") this.content.innerHTML = this.graph.render();
    else this.content.innerHTML = this.renderDashboard();
    this.renderNavigation();
    if (route === "board") this.board.bind(this.content);
    if (route === "graph") this.graph.bind(this.content);
  }

  private renderDashboard(): string {
    const campaign = this.store.records("campaigns")[0];
    const events = [...this.store.records("events")].sort((a, b) => `${asString(b.gameDate)} ${asString(b.gameTime)}`.localeCompare(`${asString(a.gameDate)} ${asString(a.gameTime)}`)).slice(0, 5);
    const activeStories = this.store.records("storylines").filter((record) => asString(record.status) === "Активна");
    const mentionSuggestions = this.mentionSuggestions().slice(0, 12);
    return `<header class="view-head"><div><div class="eyebrow">Кампания</div><h1>${escapeHtml(campaign ? this.registry.get("campaigns").title(campaign) : "Хроника")}</h1><p>${escapeHtml(campaign ? asString(campaign.description) : "")}</p></div>${campaign ? `<button class="btn" data-action="edit-record" data-entity="campaigns" data-id="${escapeAttr(campaign.id)}">Настройки</button>` : ""}</header>
      <div class="metrics"><div><strong>${this.store.records("characters").length}</strong><span>персонажей</span></div><div><strong>${this.store.records("clues").length}</strong><span>улик</span></div><div><strong>${this.store.records("facts").length}</strong><span>фактов</span></div><div><strong>${activeStories.length}</strong><span>активных линий</span></div></div>
      <div class="dashboard-workspace"><div class="dashboard-grid"><section><div class="panel-head"><h2>Недавние события</h2><button class="text-button" data-action="navigate" data-route="timeline">Весь таймлайн</button></div><div class="stack">${events.map((event) => this.miniCard("events", event)).join("") || "<p class='muted'>Событий пока нет.</p>"}</div></section><section><div class="panel-head"><h2>Активные линии</h2></div><div class="stack">${activeStories.map((story) => this.miniCard("storylines", story)).join("") || "<p class='muted'>Нет активных линий.</p>"}</div></section></div><aside class="mention-review-panel"><div class="panel-head"><div><h2>Возможные связи</h2><p class="tiny muted">Найдены по точным упоминаниям имён и псевдонимов.</p></div><span class="count-pill">${mentionSuggestions.length}</span></div><div class="mention-review-list">${mentionSuggestions.map((suggestion) => this.renderMentionSuggestion(suggestion)).join("") || `<p class="muted">Новых упоминаний нет.</p>`}</div></aside></div>`;
  }

  private renderMentionSuggestion(suggestion: MentionSuggestion): string {
    return `<article class="mention-review-item"><div class="tiny muted">${escapeHtml(suggestion.document.typeLabel)} → ${escapeHtml(suggestion.target.typeLabel)}</div><strong>${escapeHtml(suggestion.document.title)} → ${escapeHtml(suggestion.target.title)}</strong><p>${escapeHtml(suggestion.snippet)}</p><div class="inline-actions"><button class="btn small primary" data-action="approve-mention" data-source-entity="${suggestion.document.entity}" data-source-id="${escapeAttr(suggestion.document.record.id)}" data-target-entity="${suggestion.target.entity}" data-target-id="${escapeAttr(suggestion.target.record.id)}">Утвердить</button><button class="btn small ghost" data-action="reject-mention" data-pair-key="${escapeAttr(suggestion.pairKey)}" data-source-entity="${suggestion.document.entity}" data-source-id="${escapeAttr(suggestion.document.record.id)}" data-target-entity="${suggestion.target.entity}" data-target-id="${escapeAttr(suggestion.target.record.id)}">Отклонить</button></div></article>`;
  }

  private mentionSuggestions(): MentionSuggestion[] {
    const index = this.searchIndex();
    const dismissed = new Set(this.store.records("mentionDismissals").map((record) => asString(record.pairKey)));
    return new MentionIndex(index.all(), this.store.getState().snapshot.relationships)
      .allSuggestions()
      .filter((suggestion) => !dismissed.has(suggestion.pairKey));
  }

  private searchIndex(): SearchIndex {
    const relationships = this.store.getState().snapshot.relationships;
    const records = this.registry.searchable().flatMap((definition) => this.store.records(definition.type).map((record) => ({
      entity: definition.type,
      record,
      title: definition.title(record),
      typeLabel: definition.singular,
      structuredTags: projectedSystemTagPaths(
        definition.type,
        record,
        definition.fields,
        relationships,
        (entity, id) => {
          const target = this.store.record(entity, id);
          return target ? this.registry.get(entity).title(target) : id;
        },
      ),
    })));
    return new SearchIndex(records, relationships, (entity, id) => {
      const target = this.store.record(entity, id);
      return target ? this.registry.get(entity).title(target) : id;
    });
  }

  private renderCoterie(): string {
    const coterie = this.store.records("coteries")[0];
    const members = this.coterieMembers();
    return `<header class="view-head"><div><h1>${escapeHtml(coterie ? this.registry.get("coteries").title(coterie) : "Котерия")}</h1><p>${escapeHtml(coterie ? asString(coterie.description) : "Игровые персонажи хроники")}</p></div>${coterie ? `<button class="btn" data-action="edit-record" data-entity="coteries" data-id="${escapeAttr(coterie.id)}">Редактировать</button>` : ""}</header><div class="grid coterie-grid">${members.map((record) => `<article class="player-card" data-action="open-record" data-entity="characters" data-id="${escapeAttr(record.id)}"><div class="card-kicker">${escapeHtml(asString(record.species) || "Вид не указан")}</div><h2>${escapeHtml(this.registry.get("characters").title(record))}</h2><p>${escapeHtml(truncate(asString(record.description), 220)) || "Описание пока не заполнено."}</p><div class="tag-row"><span>${escapeHtml(asString(record.status))}</span><span>${escapeHtml(asString(record.characterType))}</span></div><div class="card-actions"><button class="btn small ghost" data-action="edit-record" data-entity="characters" data-id="${escapeAttr(record.id)}">Изменить</button></div></article>`).join("") || "<p class='muted'>Добавьте персонажей игроков в котерию.</p>"}</div>`;
  }

  private renderTimeline(): string {
    const events = [...this.store.records("events")].sort((a, b) => `${asString(a.gameDate)} ${asString(a.gameTime)}`.localeCompare(`${asString(b.gameDate)} ${asString(b.gameTime)}`));
    return `<header class="view-head"><div><h1>Таймлайн</h1><p>События по игровой дате и времени.</p></div><button class="btn primary" data-action="new-record" data-entity="events">Добавить событие</button></header><div class="timeline">${events.map((event) => `<article class="timeline-item"><time>${escapeHtml(asString(event.gameDate) || "Без даты")} ${escapeHtml(asString(event.gameTime))}</time><div><button class="linked-title" data-action="open-record" data-entity="events" data-id="${escapeAttr(event.id)}">${escapeHtml(this.registry.get("events").title(event))}</button><p>${escapeHtml(truncate(asString(event.description), 260))}</p><button class="btn small ghost" data-action="edit-record" data-entity="events" data-id="${escapeAttr(event.id)}">Изменить</button></div></article>`).join("") || "<p class='muted'>Событий пока нет.</p>"}</div>`;
  }

  private renderSearch(): string {
    const query = this.store.getState().search.trim().toLocaleLowerCase("ru");
    const results: Array<{ entity: EntityType; record: ChronicleRecord }> = [];
    if (query) {
      for (const definition of [...this.registry.navigation(), this.registry.get("notes")]) {
        for (const record of this.store.records(definition.type)) {
          if (JSON.stringify(record).toLocaleLowerCase("ru").includes(query)) results.push({ entity: definition.type, record });
        }
      }
    }
    return `<header class="view-head"><div><h1>Поиск</h1><p>${query ? `Результаты для «${escapeHtml(this.store.getState().search)}»` : "Введите запрос в строке сверху."}</p></div></header><div class="grid cards">${results.map(({ entity, record }) => this.miniCard(entity, record)).join("") || (query ? "<p class='muted'>Ничего не найдено.</p>" : "")}</div>`;
  }

  private miniCard(entity: EntityType, record: ChronicleRecord): string {
    const definition = this.registry.get(entity);
    return `<article class="compact-card" data-action="open-record" data-entity="${entity}" data-id="${escapeAttr(record.id)}"><div class="card-kicker">${escapeHtml(definition.singular)}</div><strong>${escapeHtml(definition.title(record))}</strong><p>${escapeHtml(truncate(definition.summary(record), 130))}</p><button class="btn small ghost" data-action="edit-record" data-entity="${entity}" data-id="${escapeAttr(record.id)}">Изменить</button></article>`;
  }

  private coterieMembers(): ChronicleRecord[] {
    const coterie = this.store.records("coteries")[0];
    if (!coterie) return this.store.records("characters").filter((record) => asString(record.characterType) === "Игровой персонаж");
    const ids = new Set(this.store.getState().snapshot.relationships.filter((relationship) => relationship.sourceType === "coteries" && relationship.sourceId === coterie.id && relationship.targetType === "characters" && relationship.relationLabel === "член").map((relationship) => relationship.targetId));
    return this.store.records("characters").filter((record) => ids.has(record.id) || (!ids.size && asString(record.characterType) === "Игровой персонаж"));
  }

  private async handleClick(event: MouseEvent): Promise<void> {
    const element = closestAction(event);
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    if (element.dataset.action === "navigate" && element.dataset.route) { this.navigate(element.dataset.route); return; }
    if (element.dataset.action === "logout") { await this.gateway.logout(); this.store.patch({ authenticated: false }); this.renderLogin(); return; }
    if (element.dataset.action === "open-quick-switcher") { this.knowledge.openQuickSwitcher(); return; }
    if (element.dataset.action === "approve-mention" && element.dataset.sourceEntity && element.dataset.sourceId && element.dataset.targetEntity && element.dataset.targetId) {
      this.entities.openRelationshipEditor(
        element.dataset.sourceEntity as EntityType,
        element.dataset.sourceId,
        undefined,
        { entityType: element.dataset.targetEntity as EntityType, entityId: element.dataset.targetId },
      );
      return;
    }
    if (element.dataset.action === "reject-mention" && element.dataset.pairKey && element.dataset.sourceEntity && element.dataset.sourceId && element.dataset.targetEntity && element.dataset.targetId) {
      await this.gateway.create("mentionDismissals", {
        pairKey: element.dataset.pairKey,
        sourceType: element.dataset.sourceEntity,
        sourceId: element.dataset.sourceId,
        targetType: element.dataset.targetEntity,
        targetId: element.dataset.targetId,
      });
      await this.reload();
      this.toast.show("Предложение отклонено.");
      return;
    }
    if (await this.knowledge.handleAction(element)) return;
    if (await this.board.handleAction(element)) return;
    if (await this.graph.handleAction(element)) return;
    await this.entities.handleAction(element);
  }

  private async handleSubmit(event: SubmitEvent): Promise<void> {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (this.knowledge.handleSubmit(form)) { event.preventDefault(); return; }
    if (!form.matches("[data-login-form]")) return;
    event.preventDefault();
    const password = String(new FormData(form).get("password") ?? "");
    try {
      await this.gateway.login(password);
      this.store.patch({ authenticated: true });
      this.renderShell();
      await this.reload();
    } catch (error) {
      this.renderLogin(error instanceof Error ? error.message : "Ошибка входа");
    }
  }

  private handleKeydown(event: KeyboardEvent): void {
    const target = event.target;
    if (event.ctrlKey && event.key.toLocaleLowerCase("ru") === "o") { event.preventDefault(); this.knowledge.openQuickSwitcher(); return; }
    if (event.ctrlKey && event.shiftKey && event.key.toLocaleLowerCase("ru") === "f") { event.preventDefault(); this.root.querySelector<HTMLInputElement>("[data-global-search]")?.focus(); return; }
    if (event.key === "Enter" && target instanceof HTMLInputElement && target.matches("[data-global-search]")) {
      this.knowledge.search(target.value);
    }
  }

  private route(): string {
    return window.location.hash.replace(/^#/, "") || "dashboard";
  }

  private renderFatal(error: unknown): void {
    const message = error instanceof ApiError || error instanceof Error ? error.message : "Не удалось запустить приложение";
    this.root.innerHTML = `<main class="login-screen"><section class="login-card"><h1>Ошибка запуска</h1><p>${escapeHtml(message)}</p><button class="btn" onclick="location.reload()">Повторить</button></section></main>`;
  }
}
