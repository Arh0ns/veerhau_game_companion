import type { AppStore } from "../application/store";
import { InteractionStateMachine } from "../application/interaction-state";
import { CoterieDispositionPolicy } from "../domain/coterie-disposition";
import { EntityChoicePolicy, type EntityRegistry } from "../domain/registry";
import { nodeCenter, rectangleBoundaryPoint, type Point } from "../domain/board-geometry";
import { relationshipColor } from "../domain/relationship-style";
import { entityKey, parseEntityKey, type BoardGroup, type BoardNode, type ChronicleRecord, type EntityType, type InvestigationBoard, type Relationship } from "../domain/types";
import type { HttpChronicleGateway } from "../infrastructure/gateway";
import { asString, escapeAttr, escapeHtml, truncate } from "../ui/dom";
import type { EntityController, EntityControllerHost } from "./entity-controller";
import type { ModalService, ToastService } from "./modal";

const CARD_WIDTH = 280;
const CARD_HEIGHT = 170;
const MIN_CARD_WIDTH = 220;
const MIN_CARD_HEIGHT = 130;
const BOARD_WIDTH = 2400;
const BOARD_HEIGHT = 1600;

function cloneNode(item: BoardNode): BoardNode {
  return { ...item };
}

export class BoardController {
  private readonly choices = new EntityChoicePolicy();
  private readonly dispositionPolicy = new CoterieDispositionPolicy();
  private activeId = "";
  private selectedKey = "";
  private addType: EntityType | "all" = "all";
  private search = "";
  private suggestionKey = "";
  private suggestionTimer = 0;
  private saveTimer = 0;
  private readonly interaction = new InteractionStateMachine();

  constructor(
    private readonly store: AppStore,
    private readonly registry: EntityRegistry,
    private readonly gateway: HttpChronicleGateway,
    private readonly modal: ModalService,
    private readonly toast: ToastService,
    private readonly host: EntityControllerHost,
    private readonly entities: EntityController,
  ) {}

  render(): string {
    const boards = this.boards();
    if (!this.activeId || !boards.some((board) => board.id === this.activeId)) this.activeId = boards.find((board) => board.status !== "Архив")?.id ?? boards[0]?.id ?? "";
    const board = this.currentBoard();
    if (!board) return `<header class="view-head"><div><h1>Доска расследования</h1><p>Создайте первую доску.</p></div><button class="btn primary" data-action="new-board">Новая доска</button></header>`;
    return `<header class="view-head"><div><h1>${escapeHtml(board.name)}</h1><p>${escapeHtml(board.description || "Рабочая доска расследования")}</p></div><div class="toolbar"><button class="btn primary" data-action="new-board">Новая доска</button><button class="btn" data-action="bookmark-board" data-id="${escapeAttr(board.id)}" data-title="${escapeAttr(board.name)}">В закладки</button><button class="btn" data-action="edit-board">Настройки</button><button class="btn" data-action="add-board-group">Новая группа</button></div></header>
      <div class="board-toolbar"><label class="field"><span>Доска</span><select data-board-select>${boards.map((item) => `<option value="${escapeAttr(item.id)}" ${item.id === board.id ? "selected" : ""}>${escapeHtml(item.name)}${item.status === "Архив" ? " · архив" : ""}</option>`).join("")}</select></label><div class="board-panel-section subtle"><strong>Навигация</strong><p class="tiny muted">Перетаскивание фона — перемещение. Колесо — масштаб.</p></div><div class="board-panel-section subtle"><strong>Связи</strong><p class="tiny muted">Потяните точку на стороне карточки к точке другой карточки.</p></div></div>
      <div class="investigation-layout">
        <div class="whiteboard-frame" data-board-frame tabindex="0">
          <div class="whiteboard-canvas" data-board-canvas style="width:${BOARD_WIDTH}px;height:${BOARD_HEIGHT}px">
            <div class="whiteboard-world" data-board-world style="width:${BOARD_WIDTH}px;height:${BOARD_HEIGHT}px;transform:${this.worldTransform(board)}">
              ${this.renderLinks(board)}${this.renderGroups(board)}${this.renderNodes(board)}${this.renderSuggestionPopover(board)}
              ${board.items.length ? "" : `<div class="whiteboard-empty"><h2>На доске пока пусто</h2><p>Перетащите объект из правой панели или создайте его через правую кнопку мыши.</p></div>`}
            </div>
          </div>
        </div>
        ${this.renderAddPanel(board)}
      </div>`;
  }

  bind(root: HTMLElement): void {
    const frame = root.querySelector<HTMLElement>("[data-board-frame]");
    const world = root.querySelector<HTMLElement>("[data-board-world]");
    if (!frame || !world) return;
    root.querySelector<HTMLSelectElement>("[data-board-select]")?.addEventListener("change", (event) => {
      this.activeId = (event.target as HTMLSelectElement).value;
      this.selectedKey = "";
      this.host.navigate("board");
    });
    root.querySelector<HTMLInputElement>("[data-board-search]")?.addEventListener("input", (event) => {
      this.search = (event.target as HTMLInputElement).value;
      this.host.navigate("board");
    });
    root.querySelector<HTMLSelectElement>("[data-board-type]")?.addEventListener("change", (event) => {
      this.addType = (event.target as HTMLSelectElement).value as EntityType | "all";
      this.host.navigate("board");
    });
    for (const button of root.querySelectorAll<HTMLElement>("[data-board-more-type]")) button.addEventListener("click", () => { this.addType = button.dataset.boardMoreType as EntityType; this.host.navigate("board"); });
    for (const suggestion of root.querySelectorAll<HTMLElement>("[data-board-drag]")) {
      suggestion.addEventListener("dragstart", (event) => {
        if (!(event instanceof DragEvent) || !event.dataTransfer) return;
        event.dataTransfer.setData("application/x-chronicle-node", suggestion.dataset.boardDrag ?? "");
        event.dataTransfer.effectAllowed = "copy";
      });
    }
    frame.addEventListener("dragover", (event) => { event.preventDefault(); frame.classList.add("drop-target"); });
    frame.addEventListener("dragleave", () => frame.classList.remove("drop-target"));
    frame.addEventListener("drop", (event) => {
      event.preventDefault();
      frame.classList.remove("drop-target");
      const key = event.dataTransfer?.getData("application/x-chronicle-node");
      if (!key) return;
      const point = this.clientToBoard(frame, event.clientX, event.clientY);
      void this.addNode(parseEntityKey(key).entityType, parseEntityKey(key).entityId, point);
    });
    frame.addEventListener("wheel", (event) => this.zoom(event, frame, world), { passive: false });
    frame.addEventListener("pointerdown", (event) => this.pointerDown(event, root, frame, world));
    frame.addEventListener("click", (event) => this.selectCard(event));
    frame.addEventListener("contextmenu", (event) => this.openContextMenu(event, root, frame));
    for (const connector of root.querySelectorAll<HTMLElement>("[data-board-connector]")) connector.addEventListener("pointerdown", (event) => this.startConnection(event, frame));
  }

  async handleAction(element: HTMLElement): Promise<boolean> {
    const action = element.dataset.action;
    if (action === "new-board") { this.openBoardEditor(); return true; }
    if (action === "edit-board") { this.openBoardEditor(this.currentBoard()); return true; }
    if (action === "add-board-group") { await this.addGroup(); return true; }
    if (action === "add-board-item" && element.dataset.key) { const ref = parseEntityKey(element.dataset.key); await this.addNode(ref.entityType, ref.entityId); return true; }
    if (action === "remove-board-item" && element.dataset.key) { await this.removeNode(element.dataset.key); return true; }
    if (action === "edit-board-edge" && element.dataset.id) { const rel = this.relationship(element.dataset.id); if (rel) this.entities.openRelationshipEditor(rel.sourceType, rel.sourceId, rel); return true; }
    if (action === "delete-board-edge" && element.dataset.id) { if (await this.modal.confirm("Удалить связь между объектами?")) { await this.gateway.deleteRelationship(element.dataset.id); await this.host.reload(); } return true; }
    return false;
  }

  private boards(): InvestigationBoard[] {
    return this.store.records("investigationBoards") as InvestigationBoard[];
  }

  private currentBoard(): InvestigationBoard | undefined {
    return this.boards().find((board) => board.id === this.activeId);
  }

  private renderNodes(board: InvestigationBoard): string {
    return board.items.map((item) => {
      const key = entityKey(item.entity, item.id);
      const record = this.store.record(item.entity, item.id);
      if (!record) return "";
      const definition = this.registry.get(item.entity);
      const width = item.width ?? CARD_WIDTH;
      const height = item.height ?? CARD_HEIGHT;
      const selected = key === this.selectedKey;
      const relationColor = this.boardRelationColor(item.entity, record);
      const cardColor = item.color || relationColor;
      const textColor = item.textColor || (cardColor === "#f4f4f2" ? "#111318" : "");
      return `<article class="whiteboard-card whiteboard-card-${item.entity} ${selected ? "selected" : ""}" data-board-card data-key="${escapeAttr(key)}" style="left:${item.x}px;top:${item.y}px;width:${width}px;height:${height}px;${cardColor ? `--board-card-color:${escapeAttr(cardColor)};` : ""}${textColor ? `color:${escapeAttr(textColor)};` : ""}${item.borderColor ? `border-color:${escapeAttr(item.borderColor)};` : ""}">
        <div class="whiteboard-card-handle" data-card-drag><span>${escapeHtml(definition.singular)}</span><span>двигать</span></div>
        <div class="whiteboard-card-body"><h3>${escapeHtml(definition.title(record))}</h3><p>${escapeHtml(truncate(definition.summary(record), 260))}</p></div>
        <footer class="whiteboard-card-footer"><button class="text-button" data-action="open-record" data-entity="${item.entity}" data-id="${escapeAttr(item.id)}">Открыть</button><button class="text-button" data-action="edit-record" data-entity="${item.entity}" data-id="${escapeAttr(item.id)}">Изменить</button></footer>
        <div class="board-connectors">${(["top", "right", "bottom", "left"] as const).map((side) => `<button class="board-connector board-connector-${side}" data-board-connector data-key="${escapeAttr(key)}" data-side="${side}" title="Создать связь"></button>`).join("")}</div>
        <div class="board-resize-handle card-resize-handle" data-card-resize></div>
      </article>`;
    }).join("");
  }

  private boardRelationColor(entity: EntityType, record: ChronicleRecord): string {
    if (entity === "coteries") return "#62b5e5";
    if (entity === "characters") {
      const coterie = this.store.records("coteries")[0];
      const isMember = coterie && this.store.getState().snapshot.relationships.some((relationship) =>
        relationship.relationLabel === "член" && (
          (relationship.sourceType === "coteries" && relationship.sourceId === coterie.id && relationship.targetType === "characters" && relationship.targetId === record.id)
          || (relationship.targetType === "coteries" && relationship.targetId === coterie.id && relationship.sourceType === "characters" && relationship.sourceId === record.id)
        ),
      );
      if (isMember) return "#62b5e5";
    }
    return entity === "characters" || entity === "factions" ? this.dispositionPolicy.read(record)?.color ?? "" : "";
  }

  private renderGroups(board: InvestigationBoard): string {
    return board.groups.map((group) => `<section class="whiteboard-group ${this.selectedKey === `group:${group.id}` ? "selected" : ""}" data-board-group data-group-id="${escapeAttr(group.id)}" style="left:${group.x}px;top:${group.y}px;width:${group.width}px;height:${group.height}px;--group-color:${escapeAttr(group.color || "#6f91c4")};--group-border-style:${escapeAttr(group.borderStyle || "dashed")};${group.borderColor ? `border-color:${escapeAttr(group.borderColor)};` : ""}"><header class="whiteboard-group-head" data-group-drag><strong>${escapeHtml(group.name)}</strong><span>двигать</span></header><div class="board-resize-handle group-resize-handle" data-group-resize></div></section>`).join("");
  }

  private renderLinks(board: InvestigationBoard): string {
    const map = new Map(board.items.map((item) => [entityKey(item.entity, item.id), item]));
    const relationships = this.store.getState().snapshot.relationships.filter((rel) => map.has(entityKey(rel.sourceType, rel.sourceId)) && map.has(entityKey(rel.targetType, rel.targetId)));
    return `<svg class="whiteboard-links" data-board-links width="${BOARD_WIDTH}" height="${BOARD_HEIGHT}"><defs>${relationships.map((rel) => `<marker id="arrow-${escapeAttr(rel.id)}" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" fill="${escapeAttr(relationshipColor(rel))}"></path></marker>`).join("")}</defs>${relationships.map((rel) => this.renderEdge(rel, map)).join("")}</svg>`;
  }

  private renderEdge(rel: Relationship, map: Map<string, BoardNode>): string {
    const source = map.get(entityKey(rel.sourceType, rel.sourceId));
    const target = map.get(entityKey(rel.targetType, rel.targetId));
    if (!source || !target) return "";
    const sourceCenter = nodeCenter(source, CARD_WIDTH, CARD_HEIGHT);
    const targetCenter = nodeCenter(target, CARD_WIDTH, CARD_HEIGHT);
    const start = rectangleBoundaryPoint(source, targetCenter, CARD_WIDTH, CARD_HEIGHT);
    const end = rectangleBoundaryPoint(target, sourceCenter, CARD_WIDTH, CARD_HEIGHT);
    const markerStart = rel.arrowDirection === "target-to-source" ? `marker-start="url(#arrow-${escapeAttr(rel.id)})"` : "";
    const markerEnd = rel.arrowDirection === "source-to-target" ? `marker-end="url(#arrow-${escapeAttr(rel.id)})"` : "";
    const color = relationshipColor(rel);
    return `<g data-board-edge data-id="${escapeAttr(rel.id)}" data-action="edit-board-edge"><line class="whiteboard-link custom-edge ${rel.lineStyle === "dashed" ? "dashed" : ""}" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" style="--edge-color:${escapeAttr(color)}" ${markerStart} ${markerEnd}><title>${escapeHtml(`${rel.relationLabel}${rel.notes ? `\n${rel.notes}` : ""}`)}</title></line><text class="whiteboard-link-label custom-edge-label" x="${(start.x + end.x) / 2}" y="${(start.y + end.y) / 2 - 7}" text-anchor="middle" style="--edge-color:${escapeAttr(color)}">${escapeHtml(rel.relationLabel || "связано")}</text></g>`;
  }

  private renderAddPanel(board: InvestigationBoard): string {
    const query = this.search.trim().toLocaleLowerCase("ru");
    const onBoard = new Set(board.items.map((item) => entityKey(item.entity, item.id)));
    const allTypes = [...this.choices.boardPrimary, ...this.choices.boardMore];
    const types = this.addType === "all" ? allTypes : [this.addType];
    const candidates = types.flatMap((entity) => this.store.records(entity).map((record) => ({ entity, record }))).filter(({ entity, record }) => !onBoard.has(entityKey(entity, record.id)) && (!query || this.registry.get(entity).title(record).toLocaleLowerCase("ru").includes(query) || JSON.stringify(record).toLocaleLowerCase("ru").includes(query)));
    return `<aside class="board-side-panel"><section class="board-panel-section"><h2>Добавить на доску</h2><label class="field"><span>Поиск</span><input data-board-search value="${escapeAttr(this.search)}" placeholder="Название, описание, источник..."></label><label class="field"><span>Тип</span><select data-board-type><option value="all">Все типы</option>${allTypes.map((entity) => `<option value="${entity}" ${this.addType === entity ? "selected" : ""}>${escapeHtml(this.registry.get(entity).label)}</option>`).join("")}</select></label><div class="board-suggestion-list">${candidates.map(({ entity, record }) => this.renderSuggestion(entity, record)).join("") || `<p class="muted">Подходящих объектов нет.</p>`}</div></section></aside>`;
  }

  private renderSuggestion(entity: EntityType, record: ChronicleRecord): string {
    const key = entityKey(entity, record.id);
    return `<article class="board-suggestion" draggable="true" data-board-drag="${escapeAttr(key)}"><div><span class="tiny muted">${escapeHtml(this.registry.get(entity).singular)}</span><strong>${escapeHtml(this.registry.get(entity).title(record))}</strong></div><div class="actions"><button class="btn primary small" data-action="add-board-item" data-key="${escapeAttr(key)}">Добавить</button><button class="btn ghost small" data-action="open-record" data-entity="${entity}" data-id="${escapeAttr(record.id)}">Открыть</button><button class="btn ghost small" data-action="edit-record" data-entity="${entity}" data-id="${escapeAttr(record.id)}">Изменить</button></div></article>`;
  }

  private renderSuggestionPopover(board: InvestigationBoard): string {
    if (!this.suggestionKey) return "";
    const anchor = board.items.find((item) => entityKey(item.entity, item.id) === this.suggestionKey);
    if (!anchor) return "";
    const related = this.relatedNotOnBoard(board, this.suggestionKey).slice(0, 6);
    if (!related.length) return "";
    return `<div class="board-mini-suggestions" style="left:${anchor.x + (anchor.width ?? CARD_WIDTH) + 18}px;top:${anchor.y}px">${related.map(({ entity, record, label }) => `<article class="board-mini-item"><button class="board-mini-main" data-action="open-record" data-entity="${entity}" data-id="${escapeAttr(record.id)}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(this.registry.get(entity).title(record))}</strong></button><button class="btn primary small" data-action="add-board-item" data-key="${escapeAttr(entityKey(entity, record.id))}">Добавить</button></article>`).join("")}</div>`;
  }

  private relatedNotOnBoard(board: InvestigationBoard, anchorKey: string): Array<{ entity: EntityType; record: ChronicleRecord; label: string }> {
    const onBoard = new Set(board.items.map((item) => entityKey(item.entity, item.id)));
    const result: Array<{ entity: EntityType; record: ChronicleRecord; label: string }> = [];
    for (const rel of this.store.getState().snapshot.relationships) {
      let key = "";
      if (entityKey(rel.sourceType, rel.sourceId) === anchorKey) key = entityKey(rel.targetType, rel.targetId);
      else if (entityKey(rel.targetType, rel.targetId) === anchorKey) key = entityKey(rel.sourceType, rel.sourceId);
      if (!key || onBoard.has(key)) continue;
      const ref = parseEntityKey(key);
      const record = this.store.record(ref.entityType, ref.entityId);
      if (record) result.push({ entity: ref.entityType, record, label: rel.relationLabel || "связано" });
    }
    return result;
  }

  private selectCard(event: MouseEvent): void {
    const card = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-board-card]") : null;
    if (!card || (event.target instanceof Element && event.target.closest("button"))) return;
    this.selectedKey = card.dataset.key ?? "";
    this.suggestionKey = this.selectedKey;
    window.clearTimeout(this.suggestionTimer);
    this.suggestionTimer = window.setTimeout(() => { this.suggestionKey = ""; this.host.navigate("board"); }, 4200);
    this.host.navigate("board");
  }

  private pointerDown(event: PointerEvent, root: HTMLElement, frame: HTMLElement, world: HTMLElement): void {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest("[data-board-connector]"))) return;
    const board = this.currentBoard();
    if (!board) return;
    const card = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-board-card]") : null;
    const group = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-board-group]") : null;
    const cardResize = event.target instanceof Element ? event.target.closest("[data-card-resize]") : null;
    const groupResize = event.target instanceof Element ? event.target.closest("[data-group-resize]") : null;
    const start = { x: event.clientX, y: event.clientY };
    if (card) {
      const key = card.dataset.key ?? "";
      const item = board.items.find((node) => entityKey(node.entity, node.id) === key);
      if (!item) return;
      this.selectedKey = key;
      const original = cloneNode(item);
      const mode = cardResize ? "resize" : event.target instanceof Element && event.target.closest("[data-card-drag]") ? "drag" : "";
      if (!mode) return;
      this.interaction.begin(mode);
      event.preventDefault();
      card.classList.add(mode === "drag" ? "dragging" : "resizing");
      this.trackPointer(event, (move) => {
        const dx = (move.clientX - start.x) / board.viewport.zoom;
        const dy = (move.clientY - start.y) / board.viewport.zoom;
        if (mode === "drag") { item.x = Math.max(0, original.x + dx); item.y = Math.max(0, original.y + dy); card.style.left = `${item.x}px`; card.style.top = `${item.y}px`; }
        else { item.width = Math.max(MIN_CARD_WIDTH, (original.width ?? CARD_WIDTH) + dx); item.height = Math.max(MIN_CARD_HEIGHT, (original.height ?? CARD_HEIGHT) + dy); card.style.width = `${item.width}px`; card.style.height = `${item.height}px`; }
        this.updateLinks(root, board);
      }, () => { this.interaction.finish(); card.classList.remove("dragging", "resizing"); void this.saveBoard(board, { items: board.items }); });
      return;
    }
    if (group) {
      const groupData = board.groups.find((item) => item.id === group.dataset.groupId);
      if (!groupData) return;
      this.selectedKey = `group:${groupData.id}`;
      const original = { ...groupData };
      const contained = board.items.filter((item) => {
        const center = { x: item.x + (item.width ?? CARD_WIDTH) / 2, y: item.y + (item.height ?? CARD_HEIGHT) / 2 };
        return center.x >= original.x && center.x <= original.x + original.width && center.y >= original.y && center.y <= original.y + original.height;
      }).map((item) => ({ item, x: item.x, y: item.y }));
      const mode = groupResize ? "resize" : event.target instanceof Element && event.target.closest("[data-group-drag]") ? "drag" : "";
      if (!mode) return;
      this.interaction.begin(mode);
      event.preventDefault();
      this.trackPointer(event, (move) => {
        const dx = (move.clientX - start.x) / board.viewport.zoom;
        const dy = (move.clientY - start.y) / board.viewport.zoom;
        if (mode === "drag") { groupData.x = original.x + dx; groupData.y = original.y + dy; group.style.left = `${groupData.x}px`; group.style.top = `${groupData.y}px`; for (const entry of contained) { entry.item.x = entry.x + dx; entry.item.y = entry.y + dy; const node = root.querySelector<HTMLElement>(`[data-board-card][data-key="${CSS.escape(entityKey(entry.item.entity, entry.item.id))}"]`); if (node) { node.style.left = `${entry.item.x}px`; node.style.top = `${entry.item.y}px`; } } }
        else { groupData.width = Math.max(300, original.width + dx); groupData.height = Math.max(220, original.height + dy); group.style.width = `${groupData.width}px`; group.style.height = `${groupData.height}px`; }
        this.updateLinks(root, board);
      }, () => { this.interaction.finish(); void this.saveBoard(board, { groups: board.groups, items: board.items }); });
      return;
    }
    if (event.target === frame || event.target instanceof Element && (event.target.matches("[data-board-canvas]") || event.target.matches("[data-board-world]"))) {
      event.preventDefault();
      this.interaction.begin("pan");
      const original = { ...board.viewport };
      frame.classList.add("panning");
      this.trackPointer(event, (move) => { board.viewport.x = original.x + move.clientX - start.x; board.viewport.y = original.y + move.clientY - start.y; world.style.transform = this.worldTransform(board); }, () => { this.interaction.finish(); frame.classList.remove("panning"); this.saveViewport(board); });
    }
  }

  private startConnection(event: PointerEvent, frame: HTMLElement): void {
    event.preventDefault();
    event.stopPropagation();
    const source = event.currentTarget as HTMLElement;
    const sourceKey = source.dataset.key;
    if (!sourceKey) return;
    this.interaction.begin("connect");
    frame.classList.add("connecting");
    const rect = source.getBoundingClientRect();
    const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const preview = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    preview.setAttribute("class", "board-connection-preview");
    preview.innerHTML = `<line class="board-connection-preview-line" x1="${start.x}" y1="${start.y}" x2="${event.clientX}" y2="${event.clientY}"></line>`;
    document.body.append(preview);
    const line = preview.querySelector("line")!;
    const move = (moveEvent: PointerEvent) => { line.setAttribute("x2", String(moveEvent.clientX)); line.setAttribute("y2", String(moveEvent.clientY)); };
    const up = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      preview.remove();
      frame.classList.remove("connecting");
      this.interaction.finish();
      const target = document.elementFromPoint(upEvent.clientX, upEvent.clientY)?.closest<HTMLElement>("[data-board-connector]");
      const targetKey = target?.dataset.key;
      if (!targetKey || targetKey === sourceKey) return;
      const sourceRef = parseEntityKey(sourceKey);
      const targetRef = parseEntityKey(targetKey);
      const existing = this.store.getState().snapshot.relationships.find((rel) => {
        const pair = new Set([entityKey(rel.sourceType, rel.sourceId), entityKey(rel.targetType, rel.targetId)]);
        return pair.has(sourceKey) && pair.has(targetKey);
      });
      this.entities.openRelationshipEditor(sourceRef.entityType, sourceRef.entityId, existing, { entityType: targetRef.entityType, entityId: targetRef.entityId });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  private openContextMenu(event: MouseEvent, root: HTMLElement, frame: HTMLElement): void {
    event.preventDefault();
    document.querySelector("[data-board-context]")?.remove();
    const card = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-board-card]") : null;
    const group = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-board-group]") : null;
    const edge = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-board-edge]") : null;
    const menu = document.createElement("div");
    menu.className = "board-context-menu";
    menu.dataset.boardContext = "";
    menu.style.left = `${Math.min(event.clientX, window.innerWidth - 280)}px`;
    menu.style.top = `${Math.min(event.clientY, window.innerHeight - 360)}px`;
    const createButtons = `<div class="board-context-section"><strong>Создать</strong><div class="board-context-create-grid">${(["notes", "clues", "artifacts", "facts", "theories"] as EntityType[]).map((entity) => `<button data-create-entity="${entity}">${escapeHtml(this.registry.get(entity).singular)}</button>`).join("")}</div></div>`;
    if (card) {
      const key = card.dataset.key ?? "";
      const item = this.currentBoard()?.items.find((node) => entityKey(node.entity, node.id) === key);
      menu.innerHTML = `${createButtons}<div class="board-context-section board-context-color"><label>Карточка<input type="color" data-node-color value="${escapeAttr(item?.color || "#c8a85a")}">${this.renderColorSwatches("node-color")}</label><label>Текст<input type="color" data-node-text-color value="${escapeAttr(item?.textColor || "#eee8dc")}">${this.renderColorSwatches("node-text-color")}</label><label>Рамка<input type="color" data-node-border-color value="${escapeAttr(item?.borderColor || "#c8a85a")}">${this.renderColorSwatches("node-border-color")}</label></div><div class="board-context-actions"><button data-open-card>Открыть карточку</button><button data-edit-card>Редактировать объект</button><button class="danger" data-remove-card>Убрать с доски</button></div>`;
      this.bindColorSwatches(menu);
      menu.addEventListener("input", () => { if (!item) return; item.color = (menu.querySelector("[data-node-color]") as HTMLInputElement).value; item.textColor = (menu.querySelector("[data-node-text-color]") as HTMLInputElement).value; item.borderColor = (menu.querySelector("[data-node-border-color]") as HTMLInputElement).value; void this.saveBoard(this.currentBoard()!, { items: this.currentBoard()!.items }, true); });
      menu.querySelector("[data-open-card]")?.addEventListener("click", () => { const ref = parseEntityKey(key); menu.remove(); this.host.navigate(`detail:${ref.entityType}:${ref.entityId}`); });
      menu.querySelector("[data-edit-card]")?.addEventListener("click", () => { const ref = parseEntityKey(key); menu.remove(); this.entities.openEntityForm(ref.entityType, ref.entityId); });
      menu.querySelector("[data-remove-card]")?.addEventListener("click", () => { menu.remove(); void this.removeNode(key); });
      this.bindCreateContext(menu, this.clientToBoard(frame, event.clientX, event.clientY), key);
    } else if (group) {
      const data = this.currentBoard()?.groups.find((item) => item.id === group.dataset.groupId);
      menu.innerHTML = `<div class="board-context-section"><strong>${escapeHtml(data?.name || "Группа")}</strong></div><div class="board-context-color"><label>Цвет<input type="color" data-group-color value="${escapeAttr(data?.color || "#6f91c4")}">${this.renderColorSwatches("group-color")}</label><label>Рамка<input type="color" data-group-border value="${escapeAttr(data?.borderColor || "#6f91c4")}">${this.renderColorSwatches("group-border")}</label><label>Стиль<select data-group-style><option value="dashed">Пунктир</option><option value="solid">Сплошная</option><option value="dotted">Точки</option></select></label></div><div class="board-context-actions"><button data-rename-group>Переименовать</button><button class="danger" data-delete-group>Удалить рамку</button></div>`;
      this.bindColorSwatches(menu);
      const style = menu.querySelector<HTMLSelectElement>("[data-group-style]"); if (style && data) style.value = data.borderStyle || "dashed";
      menu.addEventListener("input", () => { if (!data) return; data.color = (menu.querySelector("[data-group-color]") as HTMLInputElement).value; data.borderColor = (menu.querySelector("[data-group-border]") as HTMLInputElement).value; data.borderStyle = (menu.querySelector("[data-group-style]") as HTMLSelectElement).value as BoardGroup["borderStyle"]; void this.saveBoard(this.currentBoard()!, { groups: this.currentBoard()!.groups }, true); });
      menu.querySelector("[data-rename-group]")?.addEventListener("click", () => { if (!data) return; const name = window.prompt("Название группы", data.name); if (name) { data.name = name; void this.saveBoard(this.currentBoard()!, { groups: this.currentBoard()!.groups }); } menu.remove(); });
      menu.querySelector("[data-delete-group]")?.addEventListener("click", () => { const board = this.currentBoard(); if (board && data) { board.groups = board.groups.filter((item) => item.id !== data.id); void this.saveBoard(board, { groups: board.groups }); } menu.remove(); });
    } else if (edge?.dataset.id) {
      const rel = this.relationship(edge.dataset.id);
      menu.innerHTML = `${createButtons}<div class="board-context-actions"><button data-edit-edge>Редактировать связь</button><button class="danger" data-delete-edge>Удалить связь</button></div>`;
      menu.querySelector("[data-edit-edge]")?.addEventListener("click", () => { menu.remove(); if (rel) this.entities.openRelationshipEditor(rel.sourceType, rel.sourceId, rel); });
      menu.querySelector("[data-delete-edge]")?.addEventListener("click", async () => { menu.remove(); if (rel && await this.modal.confirm("Удалить эту связь?")) { await this.gateway.deleteRelationship(rel.id); await this.host.reload(); } });
      this.bindCreateContext(menu, this.clientToBoard(frame, event.clientX, event.clientY), "", rel?.id);
    } else {
      menu.innerHTML = `${createButtons}<div class="board-context-actions"><button data-new-group>Новая группа здесь</button></div>`;
      const position = this.clientToBoard(frame, event.clientX, event.clientY);
      this.bindCreateContext(menu, position);
      menu.querySelector("[data-new-group]")?.addEventListener("click", () => { menu.remove(); void this.addGroup(position); });
    }
    document.body.append(menu);
    window.setTimeout(() => document.addEventListener("pointerdown", (closeEvent) => { if (!(closeEvent.target instanceof Node) || !menu.contains(closeEvent.target)) menu.remove(); }, { once: true }), 0);
  }

  private bindCreateContext(menu: HTMLElement, position: Point, relatedKey = "", relationshipId = ""): void {
    for (const button of menu.querySelectorAll<HTMLElement>("[data-create-entity]")) button.addEventListener("click", () => {
      const entity = button.dataset.createEntity as EntityType;
      menu.remove();
      this.entities.openEntityForm(entity, undefined, {}, async (record, resultingEntity) => {
        if (relationshipId) await this.gateway.updateRecord(resultingEntity, record.id, { attachedRelationshipIds: [relationshipId] });
        if (relatedKey) { const ref = parseEntityKey(relatedKey); await this.gateway.upsert({ sourceType: ref.entityType, sourceId: ref.entityId, targetType: resultingEntity, targetId: record.id, relationLabel: "связано" }); }
        await this.host.reload();
        await this.addNode(resultingEntity, record.id, position);
      });
    });
  }

  private usedObjectColors(): string[] {
    const graphColors = this.store.records("graphLayouts").flatMap((record) => Array.isArray(record.nodes) ? record.nodes.map((node) => typeof node === "object" && node && "color" in node ? String(node.color || "") : "") : []);
    const boardColors = this.store.records("investigationBoards").flatMap((record) => [
      ...(Array.isArray(record.items) ? record.items.map((node) => typeof node === "object" && node && "color" in node ? String(node.color || "") : "") : []),
      ...(Array.isArray(record.groups) ? record.groups.map((group) => typeof group === "object" && group && "color" in group ? String(group.color || "") : "") : []),
    ]);
    return [...new Set(["#aeb6c2", "#62b5e5", "#8f1d2c", "#6f91c4", ...graphColors, ...boardColors])]
      .filter((color) => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 14);
  }

  private renderColorSwatches(target: string): string {
    return `<div class="used-color-swatches">${this.usedObjectColors().map((color) => `<button type="button" class="used-color-swatch" data-board-color-target="${escapeAttr(target)}" data-board-color-value="${escapeAttr(color)}" style="--swatch-color:${escapeAttr(color)}" title="${escapeAttr(color)}"></button>`).join("")}</div>`;
  }

  private bindColorSwatches(menu: HTMLElement): void {
    for (const swatch of menu.querySelectorAll<HTMLButtonElement>("[data-board-color-target][data-board-color-value]")) swatch.addEventListener("click", () => {
      const input = menu.querySelector<HTMLInputElement>(`[data-${swatch.dataset.boardColorTarget}]`);
      if (!input) return;
      input.value = swatch.dataset.boardColorValue ?? input.value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  private async addNode(entity: EntityType, id: string, position?: Point): Promise<void> {
    const board = this.currentBoard();
    if (!board || board.items.some((item) => item.entity === entity && item.id === id)) { if (board) this.toast.show("Этот объект уже находится на доске."); return; }
    const offset = board.items.length * 26;
    board.items.push({ entity, id, x: position?.x ?? 80 + offset % 600, y: position?.y ?? 80 + offset % 420, width: CARD_WIDTH, height: CARD_HEIGHT });
    await this.saveBoard(board, { items: board.items });
  }

  private async removeNode(key: string): Promise<void> {
    const board = this.currentBoard();
    if (!board) return;
    board.items = board.items.filter((item) => entityKey(item.entity, item.id) !== key);
    this.selectedKey = "";
    await this.saveBoard(board, { items: board.items });
  }

  private async addGroup(position: Point = { x: 120, y: 120 }): Promise<void> {
    const board = this.currentBoard();
    if (!board) return;
    board.groups.push({ id: `group_${crypto.randomUUID()}`, name: `Группа ${board.groups.length + 1}`, x: position.x, y: position.y, width: 640, height: 420, color: "#6f91c4", borderStyle: "dashed" });
    await this.saveBoard(board, { groups: board.groups });
  }

  private openBoardEditor(board?: InvestigationBoard): void {
    const root = this.modal.open(board ? "Настройки доски" : "Новая доска", `<form data-board-form><div class="form-grid"><label class="field"><span>Название</span><input name="name" required value="${escapeAttr(board?.name ?? "")}"></label><label class="field"><span>Статус</span><select name="status"><option>Активна</option><option>Архив</option></select></label><label class="field wide"><span>Описание</span><textarea name="description">${escapeHtml(board?.description ?? "")}</textarea></label></div><p class="form-error" data-form-error hidden></p><div class="modal-actions"><button class="btn ghost" type="button" data-modal-close>Отмена</button><button class="btn primary" type="submit">Сохранить</button></div></form>`);
    const form = root.querySelector<HTMLFormElement>("[data-board-form]");
    if (!form) return;
    (form.elements.namedItem("status") as HTMLSelectElement).value = board?.status ?? "Активна";
    form.addEventListener("submit", (event) => { event.preventDefault(); void (async () => { try { const data = new FormData(form); const payload = { name: String(data.get("name") ?? ""), status: String(data.get("status") ?? "Активна"), description: String(data.get("description") ?? "") }; const saved = board ? await this.gateway.updateBoard(board.id, payload) : await this.gateway.createBoard(payload); this.activeId = saved.id; this.modal.close(); await this.host.reload(); } catch (error) { const message = error instanceof Error ? error.message : "Ошибка"; const target = form.querySelector<HTMLElement>("[data-form-error]"); if (target) { target.textContent = message; target.hidden = false; } } })(); });
  }

  private zoom(event: WheelEvent, frame: HTMLElement, world: HTMLElement): void {
    event.preventDefault();
    const board = this.currentBoard(); if (!board) return;
    const rect = frame.getBoundingClientRect();
    const sx = event.clientX - rect.left; const sy = event.clientY - rect.top;
    const old = board.viewport.zoom; const next = Math.min(2.5, Math.max(0.35, old * (event.deltaY < 0 ? 1.1 : 0.9)));
    const wx = (sx - board.viewport.x) / old; const wy = (sy - board.viewport.y) / old;
    board.viewport.x = sx - wx * next; board.viewport.y = sy - wy * next; board.viewport.zoom = next;
    world.style.transform = this.worldTransform(board); this.saveViewport(board);
  }

  private worldTransform(board: InvestigationBoard): string { return `translate(${board.viewport.x}px, ${board.viewport.y}px) scale(${board.viewport.zoom})`; }
  private clientToBoard(frame: HTMLElement, clientX: number, clientY: number): Point { const board = this.currentBoard(); const rect = frame.getBoundingClientRect(); if (!board) return { x: 0, y: 0 }; return { x: Math.max(0, (clientX - rect.left - board.viewport.x) / board.viewport.zoom), y: Math.max(0, (clientY - rect.top - board.viewport.y) / board.viewport.zoom) }; }
  private trackPointer(initial: PointerEvent, move: (event: PointerEvent) => void, end: () => void): void { const onMove = (event: PointerEvent) => move(event); const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); end(); }; window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp, { once: true }); initial.preventDefault(); }
  private updateLinks(root: HTMLElement, board: InvestigationBoard): void { const current = root.querySelector<SVGElement>("[data-board-links]"); if (!current) return; const wrapper = document.createElement("div"); wrapper.innerHTML = this.renderLinks(board); current.replaceWith(wrapper.firstElementChild!); }
  private relationship(id: string): Relationship | undefined { return this.store.getState().snapshot.relationships.find((rel) => rel.id === id); }
  private saveViewport(board: InvestigationBoard): void { window.clearTimeout(this.saveTimer); this.saveTimer = window.setTimeout(() => void this.saveBoard(board, { viewport: board.viewport }, true), 240); }
  private async saveBoard(board: InvestigationBoard, patch: Record<string, unknown>, quiet = false): Promise<void> { try { await this.gateway.updateBoard(board.id, patch); if (!quiet) { await this.host.reload(); this.host.navigate("board"); } } catch (error) { this.toast.show(error instanceof Error ? error.message : "Не удалось сохранить доску", "error"); } }
}
