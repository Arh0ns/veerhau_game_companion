import type { AppStore } from "../application/store";
import { OPTIONS, type EntityRegistry } from "../domain/registry";
import { graphNodeVisual, regularPolygonPoints, starPoints, type GraphShape } from "../domain/graph-visuals";
import { activeGraphModeLayout, shouldPinMovedGraphNode } from "../domain/graph-layout-state";
import { matchesGraphRecordFilters } from "../domain/graph-filter";
import { GRAPH_CONTENT_TYPES, GRAPH_IMPORTANCE, GRAPH_UNCLASSIFIED, GraphStyleResolver, defaultGraphModeStyle, globalGraphStyleTargets, knownGraphSubtypes, type GraphStyleTarget } from "../domain/graph-style";
import { collapseSecondaryFactionRelationships, reachableNodeKeys } from "../domain/graph-projection";
import { relationshipColor } from "../domain/relationship-style";
import { projectedSystemTagPaths } from "../domain/structured-tags";
import {
  entityKey,
  parseEntityKey,
  type ChronicleRecord,
  type EntityType,
  type GraphLayout,
  type GraphModeStyle,
  type GraphMode,
  type GraphModeLayout,
  type GraphNodePlacement,
  type Relationship,
} from "../domain/types";
import type { HttpChronicleGateway } from "../infrastructure/gateway";
import { asString, asStringArray, escapeAttr, escapeHtml, truncate } from "../ui/dom";
import type { EntityController, EntityControllerHost } from "./entity-controller";
import type { ModalService, ToastService } from "./modal";
import { SvgGraphScene, type SvgGraphNode } from "./svg-graph-scene";

const GRAPH_WIDTH = 1100;
const GRAPH_HEIGHT = 640;
type RuntimeNode = SvgGraphNode & GraphNodePlacement & {
  record: ChronicleRecord;
  shape: GraphShape;
  color: string;
  textColor: string;
  borderColor: string;
  fontFamily: string;
  labelSize: number;
  labelWeight: number;
  searchText: string;
  mass: number;
};

export class GraphController {
  private readonly styleResolver = new GraphStyleResolver();
  private selectedNodeKey = "";
  private selectedEdgeId = "";
  private contextNodeKey = "";
  private focusKey = "";
  private depth = 2;
  private statuses = new Set<string>(OPTIONS.characterStatus);
  private entityTypes = new Set<EntityType>();
  private importance = new Set<string>(GRAPH_IMPORTANCE);
  private contentTypes = new Set<string>([...GRAPH_CONTENT_TYPES, GRAPH_UNCLASSIFIED]);
  private collapseSecondaryFactions = false;
  private graphSearch = "";
  private preferencesKey = "";
  private saveTimer = 0;
  private scene: SvgGraphScene | null = null;
  private contextMenu: HTMLElement | null = null;
  private contextDismissHandler: ((event: PointerEvent) => void) | null = null;
  private renderedNodes: RuntimeNode[] = [];
  private renderedRelationships: Relationship[] = [];

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
    const layout = this.layout();
    if (!layout) return `<div class="empty-state"><h2>Раскладка графа не найдена</h2><p>Перезапустите приложение, чтобы выполнить миграцию.</p></div>`;
    this.loadPreferences(layout);
    const modeStyle = this.modeStyle(layout, layout.mode);
    const allNodes = this.ensureNodes(layout, modeStyle);
    const allRelationships = this.projectedRelationships();
    const visibleKeys = this.visibleKeys(allNodes, layout.mode, allRelationships);
    const nodes = allNodes.filter((node) => visibleKeys.has(node.key));
    const nodeKeys = new Set(nodes.map((node) => node.key));
    const relationships = allRelationships.filter((edge) =>
      nodeKeys.has(entityKey(edge.sourceType, edge.sourceId)) && nodeKeys.has(entityKey(edge.targetType, edge.targetId)),
    );
    this.renderedNodes = nodes;
    this.renderedRelationships = relationships;
    const customActions = `<button class="btn" data-action="open-graph-style">Дефолтные стили</button>${layout.mode === "custom" ? `<button class="btn" data-action="reset-graph-layout">Пересобрать</button>` : ""}`;
    const space = activeGraphModeLayout(layout, layout.mode);
    return `<header class="view-head graph-view-head"><div><h1>Граф связей</h1><p>${layout.mode === "obsidian" ? "Свободный граф: связанные узлы притягиваются, подписи автоматически освобождают место." : "Крупные узлы, фильтры, индивидуальные стили и закреплённые позиции."}</p></div><div class="toolbar"><div class="segmented-control" aria-label="Режим графа"><button class="${layout.mode === "custom" ? "active" : ""}" data-action="set-graph-mode" data-mode="custom">Настраиваемый</button><button class="${layout.mode === "obsidian" ? "active" : ""}" data-action="set-graph-mode" data-mode="obsidian">Obsidian</button></div><button class="btn" data-action="bookmark-graph">В закладки</button>${customActions}</div></header>
      <div class="graph-layout graph-2d-layout"><div class="graph-wrap graph-2d-wrap" data-graph-wrap style="--graph-bg:${escapeAttr(modeStyle.backgroundColor)};--graph-grid:${escapeAttr(modeStyle.gridColor)};--graph-grid-opacity:${modeStyle.gridOpacity};--graph-edge-width:${modeStyle.edgeWidth};--graph-edge-opacity:${modeStyle.edgeOpacity};--graph-edge-label-size:${modeStyle.edgeLabelSize}px"><svg class="graph-svg" data-graph-svg viewBox="0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}" aria-label="Граф связей"><defs>${this.renderMarkers(relationships, modeStyle)}</defs><g data-graph-world transform="${this.worldTransform(space)}">${this.renderEdges(relationships, nodes, modeStyle, layout.mode)}${nodes.map((node) => this.renderNode(node, layout.mode, modeStyle)).join("")}</g></svg><div class="graph-hint">Перетащите фон для перемещения, колесо для масштаба.${layout.mode === "obsidian" ? " Перетащите узел, чтобы перестроить связанное окружение; после отпускания он остаётся свободным. Нажмите узел, чтобы выделить его окружение; ПКМ открывает действия." : " Перетащите узел, чтобы закрепить его позицию."}</div></div>${this.renderPanel(layout.mode, allNodes, relationships)}</div>`;
  }

  bind(root: HTMLElement): void {
    const layout = this.layout();
    if (!layout) return;
    const modeStyle = this.modeStyle(layout, layout.mode);
    const space = activeGraphModeLayout(layout, layout.mode);
    this.scene = new SvgGraphScene(root, this.renderedNodes, this.renderedRelationships, space.viewport, layout.mode, modeStyle.physics, {
      onSelectNode: (key) => { this.selectedNodeKey = this.selectedNodeKey === key && layout.mode === "obsidian" ? "" : key; this.selectedEdgeId = ""; this.host.navigate("graph"); },
      onPreviewNode: (key) => {
        const ref = parseEntityKey(key);
        this.entities.openRecordPreview(ref.entityType, ref.entityId);
      },
      onSelectEdge: (id) => { this.selectedEdgeId = id; this.selectedNodeKey = ""; this.host.navigate("graph"); },
      onContextNode: (key, clientX, clientY) => this.showContextMenu(root, key, clientX, clientY),
      onMoveNode: (key, x, y) => this.moveNode(space, layout, key, x, y),
      onViewportChange: (viewport) => { space.viewport = { ...viewport }; this.scheduleSave(layout); },
      onPositionsChanged: (nodes) => {
        this.syncPositions(space, nodes);
        this.scheduleSave(layout);
      },
    });
    this.scene.bind();
    this.bindGraphSearch(root);
    this.bindGraphFilters(root, layout, layout.mode === "custom");
    root.querySelector<HTMLInputElement>("[data-obsidian-attraction]")?.addEventListener("change", (event) => {
      layout.modeStyles.obsidian = this.styleResolver.mode(layout.modeStyles.obsidian, "obsidian");
      layout.modeStyles.obsidian.physics.linkForce = Number((event.target as HTMLInputElement).value);
      this.scheduleSave(layout);
      this.host.navigate("graph");
    });
    for (const input of root.querySelectorAll<HTMLInputElement>("[data-graph-node-style]")) input.addEventListener("change", () => this.updateSelectedNodeStyle(root));
    root.querySelector<HTMLSelectElement>("[data-graph-edge-arrow]")?.addEventListener("change", (event) => void this.updateSelectedEdge({ arrowDirection: (event.target as HTMLSelectElement).value as Relationship["arrowDirection"] }));
    root.querySelector<HTMLInputElement>("[data-graph-edge-color]")?.addEventListener("change", (event) => void this.updateSelectedEdge({ edgeColor: (event.target as HTMLInputElement).value }));
    root.querySelector<HTMLSelectElement>("[data-graph-edge-line-style]")?.addEventListener("change", (event) => void this.updateSelectedEdge({ lineStyle: (event.target as HTMLSelectElement).value as Relationship["lineStyle"] }));
    this.bindGraphColorSwatches(root);
  }

  dispose(): void {
    this.scene?.dispose();
    this.scene = null;
    this.hideContextMenu();
  }

  async handleAction(element: HTMLElement): Promise<boolean> {
    const action = element.dataset.action;
    if (action === "set-graph-mode") {
      const layout = this.layout();
      const mode = element.dataset.mode as GraphMode | undefined;
      if (layout && (mode === "custom" || mode === "obsidian")) {
        layout.mode = mode;
        await this.saveLayout(layout);
        this.host.navigate("graph");
      }
      return true;
    }
    if (action === "open-graph-style") { this.openStyleEditor(); return true; }
    if (action === "reset-graph-layout") { if (this.layout()?.mode === "custom") await this.resetLayout(); return true; }
    if (action === "focus-graph-search" && element.dataset.key) {
      this.scene?.focusNode(element.dataset.key);
      return true;
    }
    if (action === "preview-graph-context" && this.contextNodeKey) {
      const ref = parseEntityKey(this.contextNodeKey);
      this.entities.openRecordPreview(ref.entityType, ref.entityId);
      this.hideContextMenu();
      return true;
    }
    if (action === "open-graph-context" && this.contextNodeKey) {
      const ref = parseEntityKey(this.contextNodeKey);
      this.hideContextMenu();
      this.host.navigate(`detail:${ref.entityType}:${ref.entityId}`);
      return true;
    }
    if (action === "open-graph-node" && this.selectedNodeKey) {
      const ref = parseEntityKey(this.selectedNodeKey);
      this.host.navigate(`detail:${ref.entityType}:${ref.entityId}`);
      return true;
    }
    if (action === "preview-graph-node" && this.selectedNodeKey) {
      const ref = parseEntityKey(this.selectedNodeKey);
      this.entities.openRecordPreview(ref.entityType, ref.entityId);
      return true;
    }
    if (action === "edit-graph-node" && this.selectedNodeKey) {
      const ref = parseEntityKey(this.selectedNodeKey);
      this.entities.openEntityForm(ref.entityType, ref.entityId);
      return true;
    }
    if (action === "edit-graph-context" && this.contextNodeKey) {
      const ref = parseEntityKey(this.contextNodeKey);
      this.hideContextMenu();
      this.entities.openEntityForm(ref.entityType, ref.entityId);
      return true;
    }
    if (action === "reset-graph-node-style" && this.selectedNodeKey) {
      const layout = this.layout();
      const placement = layout ? activeGraphModeLayout(layout, layout.mode).nodes.find((node) => entityKey(node.entity, node.id) === this.selectedNodeKey) : undefined;
      if (layout && placement) {
        delete placement.color; delete placement.textColor; delete placement.borderColor; placement.scale = 1;
        await this.saveLayout(layout);
        this.host.navigate("graph");
      }
      return true;
    }
    if (action === "unpin-graph-node" && this.selectedNodeKey) {
      const layout = this.layout();
      const placement = layout ? activeGraphModeLayout(layout, layout.mode).nodes.find((node) => entityKey(node.entity, node.id) === this.selectedNodeKey) : undefined;
      if (layout && placement) { placement.pinned = false; await this.saveLayout(layout); this.host.navigate("graph"); }
      return true;
    }
    if (action === "edit-graph-edge" && this.selectedEdgeId) {
      const edge = this.relationship(this.selectedEdgeId);
      if (edge) this.entities.openRelationshipEditor(edge.sourceType, edge.sourceId, edge);
      return true;
    }
    if (action === "delete-graph-edge" && this.selectedEdgeId) {
      if (await this.modal.confirm("Удалить выбранную связь?")) {
        await this.gateway.deleteRelationship(this.selectedEdgeId);
        this.selectedEdgeId = "";
        await this.host.reload();
      }
      return true;
    }
    return false;
  }

  private layout(): GraphLayout | undefined {
    return this.store.records("graphLayouts")[0] as GraphLayout | undefined;
  }

  private loadPreferences(layout: GraphLayout): void {
    const preferenceKey = `${layout.id}:${layout.mode}`;
    if (this.preferencesKey === preferenceKey) return;
    this.preferencesKey = preferenceKey;
    const filters = this.modeFilters(layout, layout.mode);
    this.focusKey = typeof filters.focusKey === "string" ? filters.focusKey : "";
    this.depth = typeof filters.depth === "number" ? filters.depth : 2;
    const statuses = Array.isArray(filters.statuses) ? filters.statuses.filter((item): item is string => typeof item === "string") : [];
    this.statuses = new Set(statuses.length ? statuses : OPTIONS.characterStatus);
    const entityTypes = Array.isArray(filters.entityTypes)
      ? filters.entityTypes.filter((item): item is EntityType => typeof item === "string" && this.registry.graphable().some((definition) => definition.type === item))
      : this.registry.graphable().map((definition) => definition.type);
    this.entityTypes = new Set(entityTypes);
    const importance = Array.isArray(filters.importance) ? filters.importance.filter((item): item is string => typeof item === "string") : [];
    const contentTypes = Array.isArray(filters.contentTypes) ? filters.contentTypes.filter((item): item is string => typeof item === "string") : [];
    this.importance = new Set(importance.length ? importance : GRAPH_IMPORTANCE);
    this.contentTypes = new Set(contentTypes.length ? contentTypes : [...GRAPH_CONTENT_TYPES, GRAPH_UNCLASSIFIED]);
    this.collapseSecondaryFactions = filters.collapseSecondaryFactions === true;
  }

  private ensureNodes(layout: GraphLayout, modeStyle: GraphModeStyle): RuntimeNode[] {
    const space = activeGraphModeLayout(layout, layout.mode);
    const placements = new Map(space.nodes.map((node) => [entityKey(node.entity, node.id), node]));
    const graphRecords = this.registry.graphable().flatMap((definition) => this.store.records(definition.type).map((record) => ({ entity: definition.type, record })));
    const coterie = graphRecords.find((item) => item.entity === "coteries");
    const memberIds = new Set<string>();
    if (coterie) for (const relationship of this.store.getState().snapshot.relationships) {
      if (relationship.relationLabel !== "член") continue;
      if (relationship.sourceType === "coteries" && relationship.sourceId === coterie.record.id && relationship.targetType === "characters") memberIds.add(relationship.targetId);
      if (relationship.targetType === "coteries" && relationship.targetId === coterie.record.id && relationship.sourceType === "characters") memberIds.add(relationship.sourceId);
    }
    let added = false;
    let pinStateChanged = false;
    const result: RuntimeNode[] = [];
    for (let index = 0; index < graphRecords.length; index += 1) {
      const { entity, record } = graphRecords[index]!;
      const key = entityKey(entity, record.id);
      let placement = placements.get(key);
      if (!placement) { placement = this.initialPlacement(entity, record.id, index, graphRecords.length, memberIds); space.nodes.push(placement); added = true; }
      const shouldBePinned = layout.mode === "obsidian" ? false : placement.pinned;
      if (placement.pinned !== shouldBePinned) { placement.pinned = shouldBePinned; pinStateChanged = true; }
      const runtimePlacement: GraphNodePlacement = placement;
      const definition = this.registry.get(entity);
      const title = definition.title(record);
      const structuredTags = projectedSystemTagPaths(
        entity,
        record,
        definition.fields,
        this.store.getState().snapshot.relationships,
        (targetEntity, targetId) => this.title(targetEntity, targetId),
      );
      const contextColor = entity === "coteries" || (entity === "characters" && memberIds.has(record.id)) ? "#62b5e5" : "";
      const resolved = this.styleResolver.node(entity, record, runtimePlacement, modeStyle, contextColor);
      const locationVariant = entity === "locations" && asString(record.level) === "Город" ? "city" : "";
      const visual = graphNodeVisual(entity, layout.mode, resolved.scale, locationVariant);
      result.push({
        ...runtimePlacement,
        key,
        record,
        title,
        subtitle: definition.singular,
        searchText: [title, definition.singular, ...asStringArray(record.tags), ...asStringArray(record.aliases), ...structuredTags].join(" "),
        radius: visual.radius,
        shape: visual.shape,
        color: resolved.color,
        textColor: resolved.textColor,
        borderColor: resolved.borderColor,
        fontFamily: resolved.fontFamily,
        labelSize: resolved.labelSize,
        labelWeight: resolved.labelWeight,
        mass: resolved.mass,
      });
    }
    if (added || pinStateChanged) this.scheduleSave(layout);
    return result;
  }

  private initialPlacement(entity: EntityType, id: string, index: number, total: number, memberIds: Set<string>): GraphNodePlacement {
    if (entity === "coteries") return { entity, id, x: GRAPH_WIDTH / 2, y: GRAPH_HEIGHT / 2, scale: 1.25, pinned: true };
    if (entity === "characters" && memberIds.has(id)) {
      const memberIndex = [...memberIds].indexOf(id);
      const angle = memberIndex / Math.max(1, memberIds.size) * Math.PI * 2;
      return { entity, id, x: GRAPH_WIDTH / 2 + Math.cos(angle) * 145, y: GRAPH_HEIGHT / 2 + Math.sin(angle) * 145, scale: 1, pinned: false };
    }
    const angle = index / Math.max(1, total) * Math.PI * 2;
    const ring = 220 + index % 3 * 55;
    return { entity, id, x: GRAPH_WIDTH / 2 + Math.cos(angle) * ring, y: GRAPH_HEIGHT / 2 + Math.sin(angle) * ring, scale: 1, pinned: false };
  }

  private projectedRelationships(): Relationship[] {
    const relationships = this.store.getState().snapshot.relationships;
    if (!this.collapseSecondaryFactions) return relationships;
    const direct = new Map<string, string>();
    for (const faction of this.store.records("factions")) {
      if (faction.isSecondary && typeof faction.mainFactionId === "string" && faction.mainFactionId) direct.set(faction.id, faction.mainFactionId);
    }
    const resolved = new Map<string, string>();
    for (const id of direct.keys()) {
      const visited = new Set([id]);
      let target = direct.get(id) ?? id;
      while (direct.has(target) && !visited.has(target)) { visited.add(target); target = direct.get(target)!; }
      resolved.set(id, target);
    }
    return collapseSecondaryFactionRelationships(relationships, resolved);
  }

  private visibleKeys(nodes: RuntimeNode[], mode: GraphMode, relationships: Relationship[]): Set<string> {
    const knownStatuses = new Set<string>(OPTIONS.characterStatus);
    const allowed = new Set(nodes.filter((node) => {
      if (!this.entityTypes.has(node.entity)) return false;
      if (this.collapseSecondaryFactions && node.entity === "factions" && node.record.isSecondary) return false;
      if (!matchesGraphRecordFilters(node.entity, node.record, { importance: this.importance, contentTypes: this.contentTypes })) return false;
      if (mode === "obsidian") return true;
      if (node.entity !== "characters") return true;
      const status = asString(node.record.status);
      return !knownStatuses.has(status) || this.statuses.has(status);
    }).map((node) => node.key));
    if (!this.focusKey) return allowed;
    const reached = reachableNodeKeys(relationships, this.focusKey, this.depth);
    return new Set([...reached].filter((key) => allowed.has(key)));
  }

  private renderNode(node: RuntimeNode, mode: GraphMode, modeStyle: GraphModeStyle): string {
    const selected = node.key === this.selectedNodeKey;
    const dimmed = mode === "obsidian" && this.selectedNodeKey && !this.highlightedNodeKeys().has(node.key);
    const shape = this.renderShape(node.shape, node.radius);
    const label = mode === "custom"
      ? `<text class="graph-node-label custom-node-label" text-anchor="middle" y="4">${escapeHtml(truncate(node.title, 22))}</text>`
      : `<text class="graph-node-label obsidian-node-label" x="${node.radius + 6}" y="4">${escapeHtml(truncate(node.title, 34))}</text>`;
    return `<g class="graph-node ${mode === "obsidian" ? "obsidian-node" : "custom-node"} ${selected ? "selected" : ""} ${dimmed ? "focus-dimmed" : ""} ${node.pinned ? "pinned" : ""} ${modeStyle.labelOutline ? "label-outline" : ""}" data-graph-node data-key="${escapeAttr(node.key)}" data-entity="${node.entity}" transform="translate(${node.x},${node.y})" style="--node-color:${escapeAttr(node.color)};--node-text-color:${escapeAttr(node.textColor)};--node-border-color:${escapeAttr(node.borderColor)};--node-font:${escapeAttr(node.fontFamily)};--node-label-size:${node.labelSize}px;--node-label-weight:${node.labelWeight};--node-label-style:${modeStyle.labelItalic ? "italic" : "normal"}">${shape}${label}<title>${escapeHtml(`${node.subtitle}: ${node.title}`)}</title></g>`;
  }

  private highlightedNodeKeys(): Set<string> {
    const highlighted = new Set<string>();
    if (!this.selectedNodeKey) return highlighted;
    highlighted.add(this.selectedNodeKey);
    for (const edge of this.renderedRelationships) {
      const source = entityKey(edge.sourceType, edge.sourceId);
      const target = entityKey(edge.targetType, edge.targetId);
      if (source === this.selectedNodeKey) highlighted.add(target);
      if (target === this.selectedNodeKey) highlighted.add(source);
    }
    return highlighted;
  }

  private renderShape(shape: GraphShape, radius: number): string {
    if (shape === "circle") return `<circle class="graph-node-shape" r="${radius}"></circle>`;
    if (shape === "square") { const side = radius * 1.45; return `<rect class="graph-node-shape" x="${-side / 2}" y="${-side / 2}" width="${side}" height="${side}" rx="1.5"></rect>`; }
    if (shape === "hexagon") return `<polygon class="graph-node-shape" points="${regularPolygonPoints(6, radius)}"></polygon>`;
    if (shape === "triangle") return `<polygon class="graph-node-shape" points="${regularPolygonPoints(3, radius)}"></polygon>`;
    if (shape === "star") return `<polygon class="graph-node-shape" points="${starPoints(radius)}"></polygon>`;
    return `<polygon class="graph-node-shape" points="0,${-radius} ${radius},0 0,${radius} ${-radius},0"></polygon>`;
  }

  private renderMarkers(relationships: Relationship[], modeStyle: GraphModeStyle): string {
    return relationships.map((edge) => `<marker id="graph-arrow-${escapeAttr(edge.id)}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="${escapeAttr(edge.edgeColor || relationshipColor(edge) || modeStyle.edgeColor)}"></path></marker>`).join("");
  }

  private renderEdges(relationships: Relationship[], nodes: RuntimeNode[], modeStyle: GraphModeStyle, mode: GraphMode): string {
    const nodeByKey = new Map(nodes.map((node) => [node.key, node]));
    return relationships.map((edge) => {
      const source = nodeByKey.get(entityKey(edge.sourceType, edge.sourceId));
      const target = nodeByKey.get(entityKey(edge.targetType, edge.targetId));
      if (!source || !target) return "";
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const x1 = source.x + dx / length * source.radius;
      const y1 = source.y + dy / length * source.radius;
      const x2 = target.x - dx / length * target.radius;
      const y2 = target.y - dy / length * target.radius;
      const markerStart = edge.arrowDirection === "target-to-source" ? `marker-start="url(#graph-arrow-${escapeAttr(edge.id)})"` : "";
      const markerEnd = edge.arrowDirection === "source-to-target" ? `marker-end="url(#graph-arrow-${escapeAttr(edge.id)})"` : "";
      const edgeColor = edge.edgeColor || relationshipColor(edge) || modeStyle.edgeColor;
      const highlighted = this.highlightedNodeKeys();
      const focusDimmed = mode === "obsidian" && this.selectedNodeKey && (!highlighted.has(source.key) || !highlighted.has(target.key));
      return `<g class="${focusDimmed ? "focus-dimmed" : ""}" data-graph-edge data-id="${escapeAttr(edge.id)}"><line class="graph-edge custom-edge ${edge.lineStyle === "dashed" ? "dashed" : ""} ${edge.id === this.selectedEdgeId ? "selected" : ""}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="--edge-color:${escapeAttr(edgeColor)}" ${markerStart} ${markerEnd}><title>${escapeHtml(`${edge.relationLabel}${edge.notes ? `\n${edge.notes}` : ""}`)}</title></line>${modeStyle.edgeLabels ? `<text class="graph-edge-label custom-edge-label ${edge.id === this.selectedEdgeId ? "selected" : ""}" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 7}" style="--edge-color:${escapeAttr(edgeColor)}">${escapeHtml(edge.relationLabel || "связано")}</text>` : ""}</g>`;
    }).join("");
  }

  private renderPanel(mode: GraphMode, allNodes: RuntimeNode[], relationships: Relationship[]): string {
    const selectedNode = allNodes.find((node) => node.key === this.selectedNodeKey);
    const selectedEdge = relationships.find((edge) => edge.id === this.selectedEdgeId) ?? this.relationship(this.selectedEdgeId);
    const controls = mode === "obsidian" ? this.renderObsidianControls(allNodes) : this.renderCustomControls(allNodes);
    return `<aside class="graph-panel"><section>${controls}</section>${selectedNode ? this.renderNodeInspector(selectedNode, mode) : ""}${selectedEdge ? this.renderEdgeInspector(selectedEdge) : `<div class="graph-inspector subtle"><p class="muted">${mode === "obsidian" ? "Нажмите на узел, чтобы выделить его окружение, или на связь для настройки." : "Выберите узел или связь для настройки."}</p></div>`}</aside>`;
  }

  private renderObsidianControls(nodes: RuntimeNode[]): string {
    const attraction = this.modeStyle(this.layout()!, "obsidian").physics.linkForce;
    return `<h2>Obsidian-граф</h2>${this.renderGraphSearch()}${this.renderLocalGraphControls(nodes)}${this.renderRecordFilters()}<label class="field"><span>Сила притяжения связанных узлов</span><input type="range" min="0" max="3" step="0.1" data-obsidian-attraction value="${attraction}"><small class="field-help">${attraction.toFixed(1)}</small></label>${this.renderGraphLegend()}`;
  }

  private renderCustomControls(nodes: RuntimeNode[]): string {
    return `<h2>Фильтры</h2>${this.renderGraphSearch()}${this.renderLocalGraphControls(nodes)}${this.renderRecordFilters()}<div><span class="field-label">Статусы персонажей</span><div class="graph-panel-list">${OPTIONS.characterStatus.map((status) => `<label class="check-pill"><input type="checkbox" data-graph-status value="${escapeAttr(status)}" ${this.statuses.has(status) ? "checked" : ""}>${escapeHtml(status)}</label>`).join("")}</div></div>${this.renderGraphLegend()}`;
  }

  private renderRecordFilters(): string {
    const contentTypes = [...GRAPH_CONTENT_TYPES, GRAPH_UNCLASSIFIED];
    return `<details class="graph-type-filter"><summary>Важность и назначение</summary><div class="graph-type-filter-menu"><span class="field-label">Важность всех объектов</span>${GRAPH_IMPORTANCE.map((value) => `<label class="check-pill"><input type="checkbox" data-graph-importance value="${escapeAttr(value)}" ${this.importance.has(value) ? "checked" : ""}>${escapeHtml(value)}</label>`).join("")}<span class="field-label">Тип материала событий и фактов</span>${contentTypes.map((value) => `<label class="check-pill"><input type="checkbox" data-graph-content-type value="${escapeAttr(value)}" ${this.contentTypes.has(value) ? "checked" : ""}>${escapeHtml(value)}</label>`).join("")}<label class="check-pill"><input type="checkbox" data-collapse-secondary-factions ${this.collapseSecondaryFactions ? "checked" : ""}>Сворачивать второстепенные фракции</label></div></details>`;
  }

  private renderGraphSearch(): string {
    return `<label class="field"><span>Поиск по узлам и тегам</span><input type="search" data-graph-search value="${escapeAttr(this.graphSearch)}" placeholder="Имя, #тег или тег:город/прага" autocomplete="off"></label><div class="graph-search-results" data-graph-search-results></div>`;
  }

  private renderEntityTypeFilter(): string {
    const graphable = this.registry.graphable();
    return `<details class="graph-type-filter"><summary>Выводимые объекты <span>${this.entityTypes.size}/${graphable.length}</span></summary><div class="graph-type-filter-menu">${graphable.map((definition) => `<label class="check-pill"><input type="checkbox" data-graph-entity-type value="${definition.type}" ${this.entityTypes.has(definition.type) ? "checked" : ""}>${escapeHtml(definition.label)}</label>`).join("")}</div></details>`;
  }

  private renderGraphLegend(): string {
    return `<div class="graph-legend"><span><i class="legend-circle faction"></i>Фракция</span><span><i class="legend-circle character"></i>Персонаж</span><span><i class="legend-hexagon"></i>Событие</span><span><i class="legend-square"></i>Факт</span><span><i class="legend-triangle"></i>Гипотеза</span><span><i class="legend-star">★</i>Локация</span></div>`;
  }

  private renderLocalGraphControls(nodes: RuntimeNode[]): string {
    return `${this.renderEntityTypeFilter()}<label class="field"><span>Узловая точка</span><select data-graph-focus><option value="">Все узлы</option>${nodes.map((node) => `<option value="${escapeAttr(node.key)}" ${node.key === this.focusKey ? "selected" : ""}>${escapeHtml(node.title)}</option>`).join("")}</select></label><label class="field"><span>Глубина локального графа</span><select data-graph-depth>${[1, 2, 3, 4, 5, 99].map((depth) => `<option value="${depth}" ${depth === this.depth ? "selected" : ""}>${depth === 99 ? "Без ограничения" : depth}</option>`).join("")}</select></label>`;
  }

  private renderNodeInspector(node: RuntimeNode, mode: GraphMode): string {
    const styleControls = `<label class="field"><span>Цвет узла</span><input type="color" data-graph-node-style data-style-key="color" value="${escapeAttr(node.color)}">${this.renderGraphColorSwatches(this.usedObjectColors(), '[data-style-key="color"]')}</label><label class="field"><span>Цвет текста</span><input type="color" data-graph-node-style data-style-key="textColor" value="${escapeAttr(node.textColor)}">${this.renderGraphColorSwatches(this.usedObjectColors(), '[data-style-key="textColor"]')}</label><label class="field"><span>Цвет контура</span><input type="color" data-graph-node-style data-style-key="borderColor" value="${escapeAttr(node.borderColor)}">${this.renderGraphColorSwatches(this.usedObjectColors(), '[data-style-key="borderColor"]')}</label><label class="field"><span>Размер</span><input type="range" min="60" max="220" step="5" data-graph-node-style data-style-key="scale" value="${Math.round((node.scale || 1) * 100)}"></label><button class="btn ghost" data-action="reset-graph-node-style">Сбросить стиль узла</button>`;
    return `<section class="graph-inspector"><h3>${escapeHtml(node.title)}</h3><p class="tiny muted">${escapeHtml(node.subtitle)}${mode === "obsidian" && node.pinned ? " · закреплён" : ""}</p>${styleControls}<div class="toolbar"><button class="btn" data-action="preview-graph-node">Карточка</button><button class="btn" data-action="edit-graph-node">Редактировать</button><button class="btn" data-action="open-graph-node">Открыть полностью</button></div></section>`;
  }

  private renderEdgeInspector(edge: Relationship): string {
    return `<section class="graph-inspector"><h3>${escapeHtml(edge.relationLabel || "связано")}</h3><p>${escapeHtml(this.title(edge.sourceType, edge.sourceId))} → ${escapeHtml(this.title(edge.targetType, edge.targetId))}</p>${edge.notes ? `<p class="muted">${escapeHtml(edge.notes)}</p>` : ""}<label class="field"><span>Цвет связи</span><input type="color" data-graph-edge-color value="${escapeAttr(relationshipColor(edge))}">${this.renderGraphColorSwatches(this.usedRelationshipColors(), "[data-graph-edge-color]")}</label><label class="field"><span>Тип линии</span><select data-graph-edge-line-style><option value="solid" ${edge.lineStyle !== "dashed" ? "selected" : ""}>Сплошная</option><option value="dashed" ${edge.lineStyle === "dashed" ? "selected" : ""}>Пунктирная</option></select></label><label class="field"><span>Стрелка</span><select data-graph-edge-arrow><option value="">Без стрелки</option><option value="source-to-target" ${edge.arrowDirection === "source-to-target" ? "selected" : ""}>От первого ко второму</option><option value="target-to-source" ${edge.arrowDirection === "target-to-source" ? "selected" : ""}>От второго к первому</option></select></label><div class="toolbar"><button class="btn" data-action="edit-graph-edge">Редактировать</button><button class="btn danger" data-action="delete-graph-edge">Удалить</button></div></section>`;
  }

  private usedRelationshipColors(): string[] {
    return [...new Set(["#737982", "#b23a48", "#2f8f5b", ...this.store.getState().snapshot.relationships.map(relationshipColor)])]
      .filter((color) => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 14);
  }

  private usedObjectColors(): string[] {
    const layoutColors = this.store.records("graphLayouts").flatMap((record) => {
      const legacy = Array.isArray(record.nodes) ? record.nodes : [];
      const spaces = record.modeLayouts && typeof record.modeLayouts === "object"
        ? Object.values(record.modeLayouts as Record<string, { nodes?: unknown[] }>).flatMap((space) => Array.isArray(space.nodes) ? space.nodes : [])
        : [];
      return [...legacy, ...spaces].map((node) => typeof node === "object" && node && "color" in node ? String(node.color || "") : "");
    });
    const boardColors = this.store.records("investigationBoards").flatMap((record) => Array.isArray(record.items) ? record.items.map((node) => typeof node === "object" && node && "color" in node ? String(node.color || "") : "") : []);
    return [...new Set(["#aeb6c2", "#62b5e5", "#8f1d2c", "#6f91c4", ...layoutColors, ...boardColors])]
      .filter((color) => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 14);
  }

  private renderGraphColorSwatches(colors: string[], target: string): string {
    return `<div class="used-color-swatches">${colors.map((color) => `<button type="button" class="used-color-swatch" data-graph-color-target="${escapeAttr(target)}" data-graph-color-value="${escapeAttr(color)}" style="--swatch-color:${escapeAttr(color)}" title="${escapeAttr(color)}"></button>`).join("")}</div>`;
  }

  private bindGraphColorSwatches(root: HTMLElement): void {
    for (const swatch of root.querySelectorAll<HTMLButtonElement>("[data-graph-color-value][data-graph-color-target]")) swatch.addEventListener("click", () => {
      const scope = swatch.closest<HTMLElement>("label") ?? root;
      const target = scope.querySelector<HTMLInputElement>(swatch.dataset.graphColorTarget ?? "")
        ?? root.querySelector<HTMLInputElement>(swatch.dataset.graphColorTarget ?? "");
      if (!target || target.disabled) return;
      target.value = swatch.dataset.graphColorValue ?? target.value;
      target.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  private bindGraphSearch(root: HTMLElement): void {
    const input = root.querySelector<HTMLInputElement>("[data-graph-search]");
    if (!input) return;
    const update = () => { this.graphSearch = input.value; this.scene?.setSearch(this.normalizedGraphSearch()); this.renderSearchResults(root); };
    input.addEventListener("input", update);
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const first = this.searchMatches()[0];
      if (first) { event.preventDefault(); this.scene?.focusNode(first.key); }
    });
    update();
  }

  private renderSearchResults(root: HTMLElement): void {
    const container = root.querySelector<HTMLElement>("[data-graph-search-results]");
    if (!container) return;
    const matches = this.searchMatches().slice(0, 8);
    container.innerHTML = this.graphSearch.trim() ? matches.map((node) => `<button data-action="focus-graph-search" data-key="${escapeAttr(node.key)}"><span>${escapeHtml(node.title)}</span><small>${escapeHtml(node.subtitle)}</small></button>`).join("") || `<p class="tiny muted">Ничего не найдено.</p>` : "";
  }

  private searchMatches(): RuntimeNode[] {
    const query = this.normalizedGraphSearch();
    if (!query) return [];
    return this.renderedNodes.filter((node) => node.searchText.toLocaleLowerCase("ru").includes(query));
  }

  private normalizedGraphSearch(): string {
    return this.graphSearch.trim().replace(/^(?:#|тег:|tag:)/iu, "").trim().toLocaleLowerCase("ru");
  }

  private bindGraphFilters(root: HTMLElement, layout: GraphLayout, includeStatuses: boolean): void {
    root.querySelector<HTMLSelectElement>("[data-graph-focus]")?.addEventListener("change", (event) => { this.focusKey = (event.target as HTMLSelectElement).value; this.savePreferences(layout); this.host.navigate("graph"); });
    root.querySelector<HTMLSelectElement>("[data-graph-depth]")?.addEventListener("change", (event) => { this.depth = Number((event.target as HTMLSelectElement).value); this.savePreferences(layout); this.host.navigate("graph"); });
    for (const checkbox of root.querySelectorAll<HTMLInputElement>("[data-graph-entity-type]")) checkbox.addEventListener("change", () => { if (checkbox.checked) this.entityTypes.add(checkbox.value as EntityType); else this.entityTypes.delete(checkbox.value as EntityType); this.savePreferences(layout); this.host.navigate("graph"); });
    for (const checkbox of root.querySelectorAll<HTMLInputElement>("[data-graph-importance]")) checkbox.addEventListener("change", () => { if (checkbox.checked) this.importance.add(checkbox.value); else this.importance.delete(checkbox.value); this.savePreferences(layout); this.host.navigate("graph"); });
    for (const checkbox of root.querySelectorAll<HTMLInputElement>("[data-graph-content-type]")) checkbox.addEventListener("change", () => { if (checkbox.checked) this.contentTypes.add(checkbox.value); else this.contentTypes.delete(checkbox.value); this.savePreferences(layout); this.host.navigate("graph"); });
    root.querySelector<HTMLInputElement>("[data-collapse-secondary-factions]")?.addEventListener("change", (event) => { this.collapseSecondaryFactions = (event.target as HTMLInputElement).checked; this.savePreferences(layout); this.host.navigate("graph"); });
    if (includeStatuses) for (const checkbox of root.querySelectorAll<HTMLInputElement>("[data-graph-status]")) checkbox.addEventListener("change", () => { if (checkbox.checked) this.statuses.add(checkbox.value); else this.statuses.delete(checkbox.value); this.savePreferences(layout); this.host.navigate("graph"); });
  }

  private showContextMenu(root: HTMLElement, key: string, clientX: number, clientY: number): void {
    this.hideContextMenu();
    this.contextNodeKey = key;
    const wrap = root.querySelector<HTMLElement>("[data-graph-wrap]");
    if (!wrap) return;
    const ref = parseEntityKey(key);
    const record = this.store.record(ref.entityType, ref.entityId);
    const title = record ? this.registry.get(ref.entityType).title(record) : ref.entityId;
    const rect = wrap.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.className = "graph-context-menu";
    menu.style.left = `${Math.max(6, Math.min(rect.width - 190, clientX - rect.left))}px`;
    menu.style.top = `${Math.max(6, Math.min(rect.height - 110, clientY - rect.top))}px`;
    menu.innerHTML = `<strong>${escapeHtml(title)}</strong><button data-action="preview-graph-context">Карточка</button><button data-action="edit-graph-context">Редактировать</button><button data-action="open-graph-context">Открыть полностью</button>`;
    wrap.append(menu);
    this.contextMenu = menu;
    this.contextDismissHandler = (event) => {
      if (!menu.contains(event.target as Node)) this.hideContextMenu();
    };
    window.setTimeout(() => {
      if (this.contextDismissHandler) document.addEventListener("pointerdown", this.contextDismissHandler);
    }, 0);
  }

  private hideContextMenu(): void {
    if (this.contextDismissHandler) document.removeEventListener("pointerdown", this.contextDismissHandler);
    this.contextDismissHandler = null;
    this.contextMenu?.remove();
    this.contextMenu = null;
  }

  private savePreferences(layout: GraphLayout): void {
    const filters = { focusKey: this.focusKey, depth: this.depth, statuses: [...this.statuses], entityTypes: [...this.entityTypes], importance: [...this.importance], contentTypes: [...this.contentTypes], collapseSecondaryFactions: this.collapseSecondaryFactions };
    const modeFilters = { ...((layout.filters.modeFilters as Record<string, unknown> | undefined) ?? {}), [layout.mode]: filters };
    layout.filters = { ...layout.filters, modeFilters, spaceVersion: 3 };
    this.scheduleSave(layout);
  }

  private modeFilters(layout: GraphLayout, mode: GraphMode): Record<string, unknown> {
    const byMode = layout.filters.modeFilters;
    if (byMode && typeof byMode === "object" && mode in byMode) return (byMode as Record<GraphMode, Record<string, unknown>>)[mode] ?? {};
    return layout.filters;
  }

  private modeStyle(layout: GraphLayout, mode: GraphMode): GraphModeStyle {
    layout.modeStyles ??= {
      custom: defaultGraphModeStyle("custom"),
      obsidian: defaultGraphModeStyle("obsidian"),
    };
    if (mode === "obsidian") {
      const fixed = defaultGraphModeStyle("obsidian");
      fixed.physics.linkForce = Number(layout.modeStyles.obsidian?.physics?.linkForce ?? fixed.physics.linkForce);
      fixed.entityTypeStyles = { ...(layout.modeStyles.custom?.entityTypeStyles ?? {}) };
      return fixed;
    }
    const resolved = this.styleResolver.mode(layout.modeStyles.custom, "custom");
    layout.modeStyles[mode] = resolved;
    return resolved;
  }

  private openStyleEditor(
    _activeMode?: GraphMode,
    working?: Record<GraphMode, GraphModeStyle>,
  ): void {
    const layout = this.layout();
    if (!layout) return;
    const styles = working ?? {
      custom: structuredClone(this.modeStyle(layout, "custom")),
      obsidian: defaultGraphModeStyle("obsidian"),
    };
    const root = this.modal.open("Настройка стиля графа", `
      <form data-graph-style-form>
        <p class="muted">Obsidian-режим использует фиксированное оформление и автоматическую физику.</p>
        ${this.renderStylePane("custom", styles.custom, true)}
        <div class="modal-actions split-actions"><button class="btn danger ghost" type="button" data-style-reset-all>Сбросить настройки</button><span></span><button class="btn ghost" type="button" data-modal-close>Отмена</button><button class="btn primary" type="submit">Сохранить</button></div>
      </form>`, "modal-wide graph-style-modal");
    const form = root.querySelector<HTMLFormElement>("[data-graph-style-form]");
    if (!form) return;
    this.bindGraphColorSwatches(root);
    for (const select of root.querySelectorAll<HTMLSelectElement>("[data-style-type-select]")) select.addEventListener("change", () => {
      const parent = select.closest<HTMLElement>("[data-style-pane]");
      for (const pane of parent?.querySelectorAll<HTMLElement>("[data-style-type-pane]") ?? []) pane.hidden = pane.dataset.styleTypePane !== select.value;
    });
    for (const enabled of root.querySelectorAll<HTMLInputElement>("[data-style-type-enabled]")) enabled.addEventListener("change", () => {
      const pane = enabled.closest<HTMLElement>("[data-style-type-pane]");
      for (const input of pane?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-type-style-control]") ?? []) input.disabled = !enabled.checked;
    });
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-style-reset-mode]")) button.addEventListener("click", () => {
      this.collectAllStyles(root, styles);
      const targetMode: GraphMode = "custom";
      styles.custom = defaultGraphModeStyle("custom");
      this.modal.close();
      this.openStyleEditor(targetMode, styles);
    });
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-style-reset-type]")) button.addEventListener("click", () => {
      this.collectAllStyles(root, styles);
      const targetMode: GraphMode = "custom";
      const styleKey = button.dataset.styleKey ?? "";
      delete styles[targetMode].entityTypeStyles[styleKey];
      this.modal.close();
      this.openStyleEditor(targetMode, styles);
    });
    root.querySelector<HTMLButtonElement>("[data-style-reset-all]")?.addEventListener("click", () => {
      this.modal.close();
      this.openStyleEditor("custom", { custom: defaultGraphModeStyle("custom"), obsidian: defaultGraphModeStyle("obsidian") });
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.collectAllStyles(root, styles);
      const obsidian = this.styleResolver.mode(layout.modeStyles.obsidian, "obsidian");
      obsidian.entityTypeStyles = { ...styles.custom.entityTypeStyles };
      layout.modeStyles = { custom: styles.custom, obsidian };
      this.modal.close();
      void this.saveLayout(layout).then(() => this.host.navigate("graph"));
    });
  }

  private renderStylePane(mode: GraphMode, style: GraphModeStyle, active: boolean): string {
    const graphable = this.registry.graphable();
    const targets: GraphStyleTarget[] = [...globalGraphStyleTargets(), ...graphable.flatMap((definition) => [
      { key: definition.type, label: definition.label, entity: definition.type, recordPatch: {} },
      ...knownGraphSubtypes(definition.type).map((target) => ({ ...target, label: `${definition.label} / ${target.label}` })),
    ])];
    const firstTarget = targets[0]?.key ?? "characters";
    const fonts = [
      "Inter, ui-sans-serif, system-ui, sans-serif",
      "Georgia, 'Times New Roman', serif",
      "ui-monospace, Consolas, monospace",
      "'Arial Narrow', Arial, sans-serif",
    ];
    const field = (key: string, label: string, control: string) => `<label class="field"><span>${label}</span>${control.replace("$key", key)}</label>`;
    return `<section class="graph-style-pane" data-style-pane="${mode}" ${active ? "" : "hidden"}>
      <div class="panel-head"><div><h3>${mode === "custom" ? "Настраиваемый режим" : "Obsidian-режим"}</h3><p class="muted">Настройки сохраняются для всех посетителей.</p></div><button class="btn ghost" type="button" data-style-reset-mode="${mode}">Сбросить режим</button></div>
      <div class="style-section"><h4>Текст и фон</h4><div class="form-grid compact-grid">
        ${field("fontFamily", "Шрифт", `<input data-mode-style="$key" list="font-stacks-${mode}" value="${escapeAttr(style.fontFamily)}"><datalist id="font-stacks-${mode}">${fonts.map((font) => `<option value="${escapeAttr(font)}"></option>`).join("")}</datalist>`)}
        ${field("labelSize", "Размер подписей", `<input type="number" min="7" max="32" data-mode-style="$key" value="${style.labelSize}">`)}
        ${field("labelWeight", "Насыщенность", `<select data-mode-style="$key">${[400, 500, 600, 700, 800].map((weight) => `<option value="${weight}" ${style.labelWeight === weight ? "selected" : ""}>${weight}</option>`).join("")}</select>`)}
        ${field("edgeLabelSize", "Размер подписей связей", `<input type="number" min="7" max="24" data-mode-style="$key" value="${style.edgeLabelSize}">`)}
        ${field("backgroundColor", "Фон", `<input type="color" data-mode-style="$key" value="${escapeAttr(style.backgroundColor)}">${this.renderGraphColorSwatches(this.usedObjectColors(), '[data-mode-style="backgroundColor"]')}`)}
        ${field("gridColor", "Сетка", `<input type="color" data-mode-style="$key" value="${escapeAttr(style.gridColor)}">${this.renderGraphColorSwatches(this.usedObjectColors(), '[data-mode-style="gridColor"]')}`)}
        ${field("gridOpacity", "Прозрачность сетки", `<input type="range" min="0" max="1" step="0.05" data-mode-style="$key" value="${style.gridOpacity}">`)}
        <label class="check-pill"><input type="checkbox" data-mode-style="labelItalic" ${style.labelItalic ? "checked" : ""}>Курсив</label><label class="check-pill"><input type="checkbox" data-mode-style="labelOutline" ${style.labelOutline ? "checked" : ""}>Обводка текста</label><label class="check-pill"><input type="checkbox" data-mode-style="edgeLabels" ${style.edgeLabels ? "checked" : ""}>Подписи связей</label>
      </div></div>
      <div class="style-section"><h4>Узлы, линии и физика</h4><div class="form-grid compact-grid">
        ${field("edgeColor", "Цвет линий", `<input type="color" data-mode-style="$key" value="${escapeAttr(style.edgeColor)}">${this.renderGraphColorSwatches(this.usedRelationshipColors(), '[data-mode-style="edgeColor"]')}`)}
        ${field("edgeWidth", "Толщина линий", `<input type="number" min="0.5" max="8" step="0.1" data-mode-style="$key" value="${style.edgeWidth}">`)}
        ${field("edgeOpacity", "Прозрачность линий", `<input type="range" min="0.1" max="1" step="0.05" data-mode-style="$key" value="${style.edgeOpacity}">`)}
        ${field("nodeScale", "Общий размер узлов", `<input type="number" min="0.4" max="2.5" step="0.1" data-mode-style="$key" value="${style.nodeScale}">`)}
        ${field("physics.linkDistance", "Длина связей", `<input type="number" min="30" max="360" step="5" data-mode-style="$key" value="${style.physics.linkDistance}">`)}
        ${field("physics.linkForce", "Притяжение связей", `<input type="number" min="0" max="3" step="0.1" data-mode-style="$key" value="${style.physics.linkForce}">`)}
        ${field("physics.repelForce", "Отталкивание", `<input type="number" min="0" max="3" step="0.1" data-mode-style="$key" value="${style.physics.repelForce}">`)}
        ${field("physics.centerForce", "Центрирование", `<input type="number" min="0" max="1" step="0.05" data-mode-style="$key" value="${style.physics.centerForce}">`)}
      </div></div>
      <div class="style-section"><div class="panel-head"><h4>Дефолтный стиль типа и подтипа</h4><select data-style-type-select>${targets.map((target) => `<option value="${escapeAttr(target.key)}">${escapeHtml(target.label)}</option>`).join("")}</select></div>
        ${targets.map((target) => this.renderTypeStylePane(mode, target, style, target.key === firstTarget)).join("")}
      </div>
    </section>`;
  }

  private renderTypeStylePane(mode: GraphMode, target: GraphStyleTarget, modeStyle: GraphModeStyle, visible: boolean): string {
    const current = modeStyle.entityTypeStyles[target.key];
    const fallbackPlacement: GraphNodePlacement = { entity: target.entity, id: "preview", x: 0, y: 0, scale: 1, pinned: false };
    const fallbackRecord = { id: "preview", createdAt: "", updatedAt: "", ...target.recordPatch } as ChronicleRecord;
    const inheritedStyles = target.key === target.entity ? {} : { [target.entity]: modeStyle.entityTypeStyles[target.entity] ?? {} };
    const fallback = this.styleResolver.node(target.entity, fallbackRecord, fallbackPlacement, { ...modeStyle, entityTypeStyles: inheritedStyles });
    const enabled = Boolean(current);
    const isImportance = target.key.startsWith("importance=");
    const identityControls = isImportance ? "" : `
      <label class="field"><span>Цвет</span><input type="color" data-type-style-control data-type-style="color" value="${escapeAttr(current?.color || fallback.color)}" ${enabled ? "" : "disabled"}>${this.renderGraphColorSwatches(this.usedObjectColors(), '[data-type-style="color"]')}</label>
      <label class="field"><span>Текст</span><input type="color" data-type-style-control data-type-style="textColor" value="${escapeAttr(current?.textColor || fallback.textColor)}" ${enabled ? "" : "disabled"}>${this.renderGraphColorSwatches(this.usedObjectColors(), '[data-type-style="textColor"]')}</label>
      <label class="field"><span>Шрифт</span><input data-type-style-control data-type-style="fontFamily" value="${escapeAttr(current?.fontFamily || modeStyle.fontFamily)}" ${enabled ? "" : "disabled"}></label>
      <label class="field"><span>Размер подписи</span><input type="number" min="7" max="32" data-type-style-control data-type-style="labelSize" value="${current?.labelSize || modeStyle.labelSize}" ${enabled ? "" : "disabled"}></label>
      <label class="field"><span>Насыщенность</span><select data-type-style-control data-type-style="labelWeight" ${enabled ? "" : "disabled"}>${[400, 500, 600, 700, 800].map((weight) => `<option value="${weight}" ${(current?.labelWeight || modeStyle.labelWeight) === weight ? "selected" : ""}>${weight}</option>`).join("")}</select></label>`;
    return `<div class="type-style-pane" data-style-type-pane="${escapeAttr(target.key)}" ${visible ? "" : "hidden"}><div class="panel-head"><label class="check-pill"><input type="checkbox" data-style-type-enabled ${enabled ? "checked" : ""}>Собственные настройки: ${escapeHtml(target.label)}</label><button class="btn ghost small" type="button" data-style-reset-type data-mode="${mode}" data-style-key="${escapeAttr(target.key)}">Сбросить</button></div><div class="form-grid compact-grid">
      <label class="field"><span>Контур</span><input type="color" data-type-style-control data-type-style="borderColor" value="${escapeAttr(current?.borderColor || fallback.borderColor)}" ${enabled ? "" : "disabled"}>${this.renderGraphColorSwatches(this.usedObjectColors(), '[data-type-style="borderColor"]')}</label>
      ${identityControls}
      <label class="field"><span>Множитель размера узла</span><input type="number" min="0.4" max="4" step="0.1" data-type-style-control data-type-style="scale" value="${current?.scale || 1}" ${enabled ? "" : "disabled"}><small class="field-help">Последовательно умножается на размер типа и другие стилевые слои.</small></label>
      <label class="field"><span>Множитель физической массы</span><input type="number" min="0.25" max="8" step="0.25" data-type-style-control data-type-style="mass" value="${current?.mass || 1}" ${enabled ? "" : "disabled"}><small class="field-help">Последовательно умножается; тяжёлый узел меньше смещается.</small></label>
    </div></div>`;
  }

  private collectAllStyles(root: HTMLElement, styles: Record<GraphMode, GraphModeStyle>): void {
    for (const mode of ["custom", "obsidian"] as GraphMode[]) {
      const pane = root.querySelector<HTMLElement>(`[data-style-pane="${mode}"]`);
      if (!pane) continue;
      const value = (key: string) => pane.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-mode-style="${CSS.escape(key)}"]`);
      const number = (key: string, fallback: number) => Number(value(key)?.value) || fallback;
      styles[mode] = {
        ...styles[mode],
        fontFamily: value("fontFamily")?.value.trim() || defaultGraphModeStyle(mode).fontFamily,
        labelSize: number("labelSize", 12),
        labelWeight: number("labelWeight", 500),
        labelItalic: (value("labelItalic") as HTMLInputElement | null)?.checked ?? false,
        labelOutline: (value("labelOutline") as HTMLInputElement | null)?.checked ?? false,
        edgeLabels: (value("edgeLabels") as HTMLInputElement | null)?.checked ?? true,
        edgeLabelSize: number("edgeLabelSize", 10),
        backgroundColor: value("backgroundColor")?.value || "#090b0f",
        gridColor: value("gridColor")?.value || "#28303b",
        gridOpacity: Number(value("gridOpacity")?.value ?? 0.3),
        edgeColor: value("edgeColor")?.value || "#737982",
        edgeWidth: number("edgeWidth", 1),
        edgeOpacity: Number(value("edgeOpacity")?.value ?? 0.7),
        nodeScale: number("nodeScale", 1),
        physics: {
          linkDistance: number("physics.linkDistance", mode === "custom" ? 155 : 78),
          linkForce: Number(value("physics.linkForce")?.value ?? 1),
          repelForce: Number(value("physics.repelForce")?.value ?? 1),
          centerForce: Number(value("physics.centerForce")?.value ?? 0),
        },
        entityTypeStyles: {},
      };
      for (const typePane of pane.querySelectorAll<HTMLElement>("[data-style-type-pane]")) {
        const styleKey = typePane.dataset.styleTypePane ?? "";
        if (!typePane.querySelector<HTMLInputElement>("[data-style-type-enabled]")?.checked) continue;
        const control = (key: string) => typePane.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-type-style="${key}"]`);
        styles[mode].entityTypeStyles[styleKey] = {
          color: control("color")?.value,
          borderColor: control("borderColor")?.value,
          textColor: control("textColor")?.value,
          fontFamily: control("fontFamily")?.value.trim(),
          labelSize: Number(control("labelSize")?.value),
          labelWeight: Number(control("labelWeight")?.value),
          scale: Number(control("scale")?.value),
          mass: Number(control("mass")?.value),
        };
      }
    }
  }

  private moveNode(space: GraphModeLayout, layout: GraphLayout, key: string, x: number, y: number): void {
    const placement = space.nodes.find((node) => entityKey(node.entity, node.id) === key);
    if (!placement) return;
    placement.x = x; placement.y = y; placement.pinned = shouldPinMovedGraphNode(layout.mode);
    this.scheduleSave(layout);
  }

  private syncPositions(space: GraphModeLayout, nodes: SvgGraphNode[]): void {
    const byKey = new Map(nodes.map((node) => [node.key, node]));
    for (const placement of space.nodes) {
      const node = byKey.get(entityKey(placement.entity, placement.id));
      if (!node) continue;
      placement.x = node.x; placement.y = node.y;
    }
  }

  private updateSelectedNodeStyle(root: HTMLElement): void {
    const layout = this.layout();
    if (!layout || !this.selectedNodeKey) return;
    const placement = activeGraphModeLayout(layout, layout.mode).nodes.find((node) => entityKey(node.entity, node.id) === this.selectedNodeKey);
    if (!placement) return;
    for (const input of root.querySelectorAll<HTMLInputElement>("[data-graph-node-style]")) {
      const key = input.dataset.styleKey;
      if (key === "scale") placement.scale = Number(input.value) / 100;
      else if (key === "color") placement.color = input.value;
      else if (key === "textColor") placement.textColor = input.value;
      else if (key === "borderColor") placement.borderColor = input.value;
    }
    placement.pinned = shouldPinMovedGraphNode(layout.mode);
    this.scheduleSave(layout);
    this.host.navigate("graph");
  }

  private async updateSelectedEdge(patch: Partial<Relationship>): Promise<void> {
    if (!this.selectedEdgeId) return;
    try { await this.gateway.updateRelationship(this.selectedEdgeId, patch); await this.host.reload(); }
    catch (error) { this.toast.show(error instanceof Error ? error.message : "Не удалось сохранить связь", "error"); }
  }

  private async resetLayout(): Promise<void> {
    const layout = this.layout();
    if (!layout || layout.mode !== "custom") return;
    const space = activeGraphModeLayout(layout, "custom");
    for (let index = 0; index < space.nodes.length; index += 1) {
      const node = space.nodes[index]!;
      if (node.entity === "coteries") { node.x = GRAPH_WIDTH / 2; node.y = GRAPH_HEIGHT / 2; node.pinned = true; continue; }
      const angle = index / Math.max(1, space.nodes.length) * Math.PI * 2;
      const ring = 230 + index % 3 * 48;
      node.x = GRAPH_WIDTH / 2 + Math.cos(angle) * ring;
      node.y = GRAPH_HEIGHT / 2 + Math.sin(angle) * ring;
      node.pinned = false;
    }
    space.viewport = { x: 0, y: 0, zoom: 1 };
    await this.saveLayout(layout);
    this.host.navigate("graph");
  }

  private worldTransform(space: GraphModeLayout): string {
    return `translate(${space.viewport.x} ${space.viewport.y}) scale(${space.viewport.zoom})`;
  }

  private scheduleSave(layout: GraphLayout): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.saveLayout(layout), 400);
  }

  private async saveLayout(layout: GraphLayout): Promise<void> {
    const custom = activeGraphModeLayout(layout, "custom");
    try { await this.gateway.updateRecord("graphLayouts", layout.id, { nodes: custom.nodes, viewport: custom.viewport, mode: layout.mode, filters: layout.filters, modeStyles: layout.modeStyles, modeLayouts: layout.modeLayouts }); }
    catch (error) { this.toast.show(error instanceof Error ? error.message : "Не удалось сохранить граф", "error"); }
  }

  private relationship(id: string): Relationship | undefined {
    return this.store.getState().snapshot.relationships.find((edge) => edge.id === id);
  }

  private title(entity: EntityType, id: string): string {
    const record = this.store.record(entity, id);
    return record ? this.registry.get(entity).title(record) : id;
  }

}
