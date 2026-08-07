import type { AppStore } from "../application/store";
import { SearchIndex, type SearchDocument } from "../domain/knowledge-search";
import { activeGraphModeLayout } from "../domain/graph-layout-state";
import type { EntityRegistry } from "../domain/registry";
import { relationshipColor } from "../domain/relationship-style";
import { projectedSystemTagPaths } from "../domain/structured-tags";
import { type ChronicleRecord, type EntityType, type GraphLayout, type Relationship } from "../domain/types";
import type { HttpChronicleGateway } from "../infrastructure/gateway";
import { asString, asStringArray, escapeAttr, escapeHtml, truncate } from "../ui/dom";
import type { ModalService, ToastService } from "./modal";

export interface KnowledgeControllerHost {
  reload(): Promise<void>;
  navigate(route: string): void;
}

export class KnowledgeController {
  private tagTree = true;
  private readonly recentKey = "vc_recent_searches";

  constructor(
    private readonly store: AppStore,
    private readonly registry: EntityRegistry,
    private readonly gateway: HttpChronicleGateway,
    private readonly modal: ModalService,
    private readonly toast: ToastService,
    private readonly host: KnowledgeControllerHost,
  ) {}

  index(): SearchIndex {
    const records = this.registry.searchable().flatMap((definition) => this.store.records(definition.type).map((record) => ({
      entity: definition.type,
      record,
      title: definition.title(record),
      typeLabel: definition.singular,
      structuredTags: projectedSystemTagPaths(definition.type, record, definition.fields, this.store.getState().snapshot.relationships, (entity, id) => {
        const target = this.store.record(entity, id);
        return target ? this.registry.get(entity).title(target) : id;
      }),
    })));
    return new SearchIndex(records, this.store.getState().snapshot.relationships, (entity, id) => {
      const record = this.store.record(entity, id);
      return record ? this.registry.get(entity).title(record) : id;
    });
  }

  renderSearch(): string {
    const query = this.store.getState().search.trim();
    const results = query ? this.index().search(query) : [];
    const saved = this.store.records("savedSearches");
    const recent = this.recentSearches();
    return `<header class="view-head"><div><h1>Поиск</h1><p>Текст, теги, свойства, связи и отношение к котерии.</p></div><div class="toolbar"><button class="btn" data-action="bookmark-search" ${query ? "" : "disabled"}>В закладки</button><button class="btn" data-action="save-search" ${query ? "" : "disabled"}>Сохранить поиск</button></div></header>
      <form class="knowledge-search-bar" data-knowledge-search-form><input name="query" value="${escapeAttr(query)}" placeholder='Например: тег:город/прага статус:активна -ложь'><button class="btn primary" type="submit">Найти</button></form>
      <div class="search-syntax"><code>тег:</code><code>тип:</code><code>статус:</code><code>отношение:</code><code>связано:</code><code>[поле:значение]</code><code>OR</code><code>-исключить</code></div>
      ${query ? `<div class="panel-head"><h2>Найдено: ${results.length}</h2></div><div class="search-result-list">${results.map((result) => this.renderResult(result)).join("") || `<p class="muted">Ничего не найдено.</p>`}</div>` : `<div class="dashboard-grid"><section><div class="panel-head"><h2>Сохранённые поиски</h2></div>${saved.map((item) => this.renderSavedSearch(item)).join("") || `<p class="muted">Сохранённых запросов пока нет.</p>`}</section><section><div class="panel-head"><h2>Недавние</h2></div>${recent.map((item) => `<button class="recent-search" data-action="run-query" data-query="${escapeAttr(item)}">${escapeHtml(item)}</button>`).join("") || `<p class="muted">История на этом устройстве пока пуста.</p>`}</section></div>`}`;
  }

  renderTags(): string {
    const tags = this.tagRows();
    return `<header class="view-head"><div><h1>Теги</h1><p>Иерархия тем и меток кампании.</p></div><div class="toolbar"><div class="segmented-control"><button class="${this.tagTree ? "active" : ""}" data-action="tag-view" data-mode="tree">Дерево</button><button class="${this.tagTree ? "" : "active"}" data-action="tag-view" data-mode="flat">Список</button></div><button class="btn primary" data-action="new-tag">Новый тег</button></div></header>
      <div class="tag-browser">${tags.map((tag) => `<article class="tag-browser-row" style="--tag-depth:${this.tagTree ? tag.depth : 0}"><button class="tag-name" data-action="search-tag" data-tag="${escapeAttr(tag.name)}">#${escapeHtml(tag.name)}</button><span>${tag.count}</span>${tag.recommended ? `<span class="recommended-mark">рекомендуемый</span>` : ""}${tag.system ? `<span class="system-mark">из списка</span>` : ""}<div class="inline-actions">${tag.system ? "" : `<button class="icon-button" data-action="rename-tag" data-tag="${escapeAttr(tag.name)}" title="Переименовать">✎</button><button class="icon-button" data-action="merge-tag" data-tag="${escapeAttr(tag.name)}" title="Объединить">⇄</button>`}</div></article>`).join("") || `<p class="muted">Тегов пока нет.</p>`}</div>`;
  }

  renderBookmarks(): string {
    const bookmarks = [...this.store.records("bookmarks")].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
    return `<header class="view-head"><div><h1>Закладки</h1><p>Объекты, поиски, доски и состояния графа.</p></div></header><div class="bookmark-list">${bookmarks.map((bookmark) => `<article class="bookmark-row"><button class="linked-title" data-action="open-bookmark" data-id="${escapeAttr(bookmark.id)}">${escapeHtml(asString(bookmark.title) || "Закладка")}</button><span>${escapeHtml(this.bookmarkKind(bookmark))}</span><button class="icon-button danger" data-action="delete-support-record" data-entity="bookmarks" data-id="${escapeAttr(bookmark.id)}" title="Удалить">×</button></article>`).join("") || `<p class="muted">Добавляйте закладки со страниц объектов, поиска, доски и графа.</p>`}</div>`;
  }

  renderTemplates(): string {
    const templates = this.store.records("entityTemplates");
    return `<header class="view-head"><div><h1>Шаблоны</h1><p>Заготовки для новых сущностей.</p></div></header><div class="grid cards">${templates.map((template) => `<article class="compact-card"><div class="card-kicker">${escapeHtml(this.registry.get(asString(template.targetType) as EntityType).singular)}</div><strong>${escapeHtml(asString(template.name))}</strong><button class="icon-button danger" data-action="delete-support-record" data-entity="entityTemplates" data-id="${escapeAttr(template.id)}" title="Удалить">×</button></article>`).join("") || `<p class="muted">Шаблон можно сохранить со страницы любого объекта.</p>`}</div>`;
  }

  renderRelationshipStyles(): string {
    const groups = new Map<string, Relationship[]>();
    for (const relationship of this.store.getState().snapshot.relationships) {
      const label = relationship.relationLabel.trim() || "связано";
      const items = groups.get(label) ?? [];
      items.push(relationship);
      groups.set(label, items);
    }
    const rows = [...groups].sort(([first], [second]) => first.localeCompare(second, "ru")).map(([label, relationships]) => {
      const sample = relationships[0]!;
      return `<form class="relationship-style-row" data-relationship-style-form>
        <input type="hidden" name="relationLabel" value="${escapeAttr(label)}">
        <div class="relationship-style-name"><strong>${escapeHtml(label)}</strong><span>Связей: ${relationships.length}</span></div>
        <label class="field"><span>Цвет</span><input type="color" name="edgeColor" value="${escapeAttr(relationshipColor(sample))}"></label>
        <label class="field"><span>Тип линии</span><select name="lineStyle"><option value="solid" ${sample.lineStyle !== "dashed" ? "selected" : ""}>Сплошная</option><option value="dashed" ${sample.lineStyle === "dashed" ? "selected" : ""}>Пунктирная</option></select></label>
        <label class="field"><span>Направление стрелки</span><select name="arrowDirection"><option value="" ${sample.arrowDirection ? "" : "selected"}>Без стрелки</option><option value="source-to-target" ${sample.arrowDirection === "source-to-target" ? "selected" : ""}>От первого ко второму</option><option value="target-to-source" ${sample.arrowDirection === "target-to-source" ? "selected" : ""}>От второго к первому</option></select></label>
        <button class="btn primary" type="submit">Применить ко всем</button>
      </form>`;
    }).join("");
    return `<header class="view-head"><div><h1>Стили связей</h1><p>Единое оформление всех существующих связей с одинаковым названием.</p></div></header>
      <div class="relationship-style-list">${rows || `<p class="muted">Связей пока нет.</p>`}</div>`;
  }

  async handleAction(element: HTMLElement): Promise<boolean> {
    const action = element.dataset.action;
    if (action === "search-tag" && element.dataset.tag) { this.runQuery(`тег:${element.dataset.tag}`); return true; }
    if (action === "run-query" && element.dataset.query) { this.runQuery(element.dataset.query); return true; }
    if (action === "tag-view") { this.tagTree = element.dataset.mode !== "flat"; this.host.navigate("tags"); return true; }
    if (action === "new-tag") { this.openTagForm(); return true; }
    if ((action === "rename-tag" || action === "merge-tag") && element.dataset.tag) { this.openTagChange(element.dataset.tag, action === "merge-tag"); return true; }
    if (action === "save-search") { this.openSavedSearchForm(); return true; }
    if (action === "bookmark-search") { await this.createBookmark("Поиск: " + this.store.getState().search, "search", { query: this.store.getState().search }); return true; }
    if (action === "bookmark-entity" && element.dataset.entity && element.dataset.id) { await this.createBookmark(element.dataset.title || "Объект", "entity", { entity: element.dataset.entity, id: element.dataset.id }); return true; }
    if (action === "bookmark-graph") { const layout = this.store.records("graphLayouts")[0] as GraphLayout | undefined; if (layout) await this.createBookmark(`Граф: ${layout.mode === "custom" ? "Настраиваемый" : "Obsidian"}`, "graph", { mode: layout.mode, filters: layout.filters, viewport: activeGraphModeLayout(layout, layout.mode).viewport }); return true; }
    if (action === "bookmark-board" && element.dataset.id) { await this.createBookmark(element.dataset.title || "Доска", "board", { id: element.dataset.id }); return true; }
    if (action === "open-bookmark" && element.dataset.id) { await this.openBookmark(element.dataset.id); return true; }
    if (action === "delete-support-record" && element.dataset.entity && element.dataset.id) { await this.gateway.delete(element.dataset.entity as EntityType, element.dataset.id); await this.host.reload(); return true; }
    if (action === "run-saved-search" && element.dataset.id) { const saved = this.store.record("savedSearches", element.dataset.id); if (saved) this.runQuery(asString(saved.query)); return true; }
    return false;
  }

  handleSubmit(form: HTMLFormElement): boolean {
    if (form.matches("[data-knowledge-search-form]")) {
      this.runQuery(String(new FormData(form).get("query") ?? ""));
      return true;
    }
    if (form.matches("[data-relationship-style-form]")) {
      const data = new FormData(form);
      const relationLabel = String(data.get("relationLabel") ?? "");
      const patch: Partial<Relationship> = {
        edgeColor: String(data.get("edgeColor") ?? ""),
        lineStyle: String(data.get("lineStyle") ?? "solid") as Relationship["lineStyle"],
        arrowDirection: String(data.get("arrowDirection") ?? "") as Relationship["arrowDirection"],
      };
      void this.perform(async () => {
        const relationships = this.store.getState().snapshot.relationships.filter((item) => (item.relationLabel.trim() || "связано") === relationLabel);
        await Promise.all(relationships.map((relationship) => this.gateway.updateRelationship(relationship.id, patch)));
        await this.host.reload();
        this.toast.show(`Стиль применён к связям «${relationLabel}»`);
      });
      return true;
    }
    return false;
  }

  search(query: string): void {
    this.runQuery(query);
  }

  openQuickSwitcher(): void {
    const documents = this.index().all();
    const root = this.modal.open("Быстрый переход", `<label class="field"><span>Название, псевдоним или тег</span><input data-quick-switcher autofocus autocomplete="off"></label><div class="quick-switcher-results" data-quick-results></div>`);
    const input = root.querySelector<HTMLInputElement>("[data-quick-switcher]");
    const results = root.querySelector<HTMLElement>("[data-quick-results]");
    if (!input || !results) return;
    const render = () => {
      const query = input.value.trim().toLocaleLowerCase("ru");
      const matches = documents.filter((document) => !query || `${document.title} ${document.aliases.join(" ")} ${document.tags.join(" ")}`.toLocaleLowerCase("ru").includes(query)).slice(0, 12);
      results.innerHTML = matches.map((document, index) => `<button data-quick-key="${document.entity}:${escapeAttr(document.record.id)}" class="${index === 0 ? "active" : ""}"><span>${escapeHtml(document.title)}</span><small>${escapeHtml(document.typeLabel)}</small></button>`).join("");
    };
    const open = (button: HTMLElement | null) => {
      const key = button?.dataset.quickKey;
      if (!key) return;
      const [entity, ...id] = key.split(":");
      this.modal.close();
      this.host.navigate(`detail:${entity}:${id.join(":")}`);
    };
    input.addEventListener("input", render);
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); open(results.querySelector<HTMLElement>("button")); } });
    results.addEventListener("click", (event) => open(event.target instanceof Element ? event.target.closest<HTMLElement>("button") : null));
    render();
  }

  private renderResult(result: SearchDocument & { snippet: string }): string {
    return `<article class="search-result"><div><div class="card-kicker">${escapeHtml(result.typeLabel)}</div><button class="linked-title" data-action="open-record" data-entity="${result.entity}" data-id="${escapeAttr(result.record.id)}">${escapeHtml(result.title)}</button><p>${escapeHtml(truncate(result.snippet, 280))}</p><div class="tag-row">${result.tags.map((tag) => `<button class="tag-chip" data-action="search-tag" data-tag="${escapeAttr(tag)}">#${escapeHtml(tag)}</button>`).join("")}</div><button class="btn small ghost" data-action="edit-record" data-entity="${result.entity}" data-id="${escapeAttr(result.record.id)}">Изменить</button></div></article>`;
  }

  private renderSavedSearch(record: ChronicleRecord): string {
    return `<article class="saved-search-row"><button class="linked-title" data-action="run-saved-search" data-id="${escapeAttr(record.id)}">${escapeHtml(asString(record.name))}</button><code>${escapeHtml(asString(record.query))}</code><button class="icon-button danger" data-action="delete-support-record" data-entity="savedSearches" data-id="${escapeAttr(record.id)}">×</button></article>`;
  }

  private tagRows(): Array<{ name: string; count: number; depth: number; recommended: boolean; system: boolean }> {
    const documents = this.index().all();
    const systemNames = new Set(documents.flatMap((document) => document.tags.filter((tag) => !asStringArray(document.record.tags).includes(tag))));
    const exact = new Map<string, { count: number; recommended: boolean; system: boolean }>();
    for (const document of documents) for (const tag of document.tags) {
      const current = exact.get(tag) ?? { count: 0, recommended: false, system: systemNames.has(tag) };
      current.count += 1;
      current.system ||= systemNames.has(tag);
      exact.set(tag, current);
    }
    for (const definition of this.store.records("tagDefinitions")) {
      const name = asString(definition.name);
      if (!name) continue;
      const current = exact.get(name) ?? { count: 0, recommended: false, system: false };
      current.recommended ||= Boolean(definition.recommended);
      exact.set(name, current);
    }
    if (!this.tagTree) return [...exact].map(([name, item]) => ({ name, ...item, depth: 0 })).sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const tree = new Map<string, { count: number; recommended: boolean; system: boolean }>();
    for (const [name, item] of exact) {
      const parts = name.split("/");
      for (let index = 1; index <= parts.length; index += 1) {
        const path = parts.slice(0, index).join("/");
        const current = tree.get(path) ?? { count: 0, recommended: false, system: false };
        current.count += item.count;
        current.recommended ||= index === parts.length && item.recommended;
        current.system ||= item.system;
        tree.set(path, current);
      }
    }
    return [...tree].map(([name, item]) => ({ name, ...item, depth: name.split("/").length - 1 })).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  private runQuery(query: string): void {
    const normalized = query.trim();
    this.store.patch({ search: normalized });
    if (normalized) this.rememberSearch(normalized);
    this.host.navigate("search");
  }

  private recentSearches(): string[] {
    try { return JSON.parse(localStorage.getItem(this.recentKey) || "[]") as string[]; }
    catch { return []; }
  }

  private rememberSearch(query: string): void {
    const recent = [query, ...this.recentSearches().filter((item) => item !== query)].slice(0, 8);
    localStorage.setItem(this.recentKey, JSON.stringify(recent));
  }

  private openTagForm(): void {
    const root = this.modal.open("Новый рекомендуемый тег", `<form data-tag-form><label class="field"><span>Тег</span><input name="name" required placeholder="город/прага"></label><label class="field"><span>Описание</span><textarea name="description"></textarea></label><div class="modal-actions"><button class="btn ghost" type="button" data-modal-close>Отмена</button><button class="btn primary" type="submit">Создать</button></div></form>`);
    root.querySelector<HTMLFormElement>("[data-tag-form]")?.addEventListener("submit", (event) => { event.preventDefault(); const form = event.currentTarget as HTMLFormElement; void this.perform(async () => { const data = new FormData(form); await this.gateway.createTag({ name: String(data.get("name") ?? ""), description: String(data.get("description") ?? ""), recommended: true }); this.modal.close(); await this.host.reload(); this.host.navigate("tags"); }); });
  }

  private openTagChange(source: string, merge: boolean): void {
    const root = this.modal.open(merge ? "Объединить тег" : "Переименовать тег", `<form data-tag-change><p class="muted">Исходный тег: #${escapeHtml(source)}</p><label class="field"><span>${merge ? "Объединить с" : "Новое название"}</span><input name="target" required list="tag-change-options"></label><datalist id="tag-change-options">${this.tagRows().map((tag) => `<option value="${escapeAttr(tag.name)}"></option>`).join("")}</datalist><div class="modal-actions"><button class="btn ghost" type="button" data-modal-close>Отмена</button><button class="btn primary" type="submit">${merge ? "Объединить" : "Переименовать"}</button></div></form>`);
    root.querySelector<HTMLFormElement>("[data-tag-change]")?.addEventListener("submit", (event) => { event.preventDefault(); const form = event.currentTarget as HTMLFormElement; void this.perform(async () => { await this.gateway.renameTag(source, String(new FormData(form).get("target") ?? ""), merge); this.modal.close(); await this.host.reload(); this.host.navigate("tags"); }); });
  }

  private openSavedSearchForm(): void {
    const query = this.store.getState().search;
    const root = this.modal.open("Сохранить поиск", `<form data-save-search><label class="field"><span>Название</span><input name="name" required></label><label class="field"><span>Запрос</span><input name="query" value="${escapeAttr(query)}" required></label><div class="modal-actions"><button class="btn ghost" type="button" data-modal-close>Отмена</button><button class="btn primary" type="submit">Сохранить</button></div></form>`);
    root.querySelector<HTMLFormElement>("[data-save-search]")?.addEventListener("submit", (event) => { event.preventDefault(); const form = event.currentTarget as HTMLFormElement; void this.perform(async () => { const data = new FormData(form); await this.gateway.create("savedSearches", { name: String(data.get("name") ?? ""), query: String(data.get("query") ?? ""), sortBy: "updatedAt", sortDirection: "desc" }); this.modal.close(); await this.host.reload(); }); });
  }

  private async createBookmark(title: string, kind: string, target: Record<string, unknown>): Promise<void> {
    await this.perform(async () => { await this.gateway.create("bookmarks", { title, kind, target, group: "", order: this.store.records("bookmarks").length }); await this.host.reload(); this.toast.show("Добавлено в закладки"); });
  }

  private async openBookmark(id: string): Promise<void> {
    const bookmark = this.store.record("bookmarks", id);
    if (!bookmark || !bookmark.target || typeof bookmark.target !== "object") return;
    const target = bookmark.target as Record<string, unknown>;
    if (bookmark.kind === "entity") this.host.navigate(`detail:${target.entity}:${target.id}`);
    else if (bookmark.kind === "search") this.runQuery(String(target.query ?? ""));
    else if (bookmark.kind === "board") this.host.navigate("board");
    else if (bookmark.kind === "graph") {
      const layout = this.store.records("graphLayouts")[0] as GraphLayout | undefined;
      if (layout) {
        await this.gateway.updateRecord("graphLayouts", layout.id, { mode: target.mode, filters: target.filters, viewport: target.viewport });
        await this.host.reload();
      }
      this.host.navigate("graph");
    }
  }

  private bookmarkKind(record: ChronicleRecord): string {
    return ({ entity: "Объект", search: "Поиск", graph: "Граф", board: "Доска" } as Record<string, string>)[asString(record.kind)] ?? "Закладка";
  }

  private async perform(action: () => Promise<void>): Promise<void> {
    try { await action(); }
    catch (error) { this.toast.show(error instanceof Error ? error.message : "Не удалось выполнить действие", "error"); }
  }
}
