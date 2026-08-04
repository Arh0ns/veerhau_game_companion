import { entityKey, type GraphMode, type GraphPhysicsStyle, type Relationship, type Viewport } from "../domain/types";

export interface SvgGraphNode {
  key: string;
  x: number;
  y: number;
  radius: number;
  pinned: boolean;
  title: string;
  subtitle: string;
  searchText?: string;
  labelSize?: number;
  mass?: number;
}

function nodeMass(node: SvgGraphNode): number {
  return Math.max(0.25, Math.min(8, node.mass ?? 1));
}

export function weightedGraphForce(component: number, influenced: SvgGraphNode, influencer: SvgGraphNode): number {
  return component * nodeMass(influencer) / nodeMass(influenced);
}

export interface SvgGraphCallbacks {
  onSelectNode(key: string): void;
  onPreviewNode(key: string): void;
  onSelectEdge(id: string): void;
  onContextNode(key: string, clientX: number, clientY: number): void;
  onMoveNode(key: string, x: number, y: number): void;
  onViewportChange(viewport: Viewport): void;
  onPositionsChanged(nodes: SvgGraphNode[]): void;
}

const WIDTH = 1100;
const HEIGHT = 640;

export class SvgGraphScene {
  private readonly svg: SVGSVGElement | null;
  private readonly world: SVGGElement | null;
  private readonly wrap: HTMLElement | null;
  private simulationToken = 0;
  private disposed = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly nodes: SvgGraphNode[],
    private readonly relationships: Relationship[],
    private readonly viewport: Viewport,
    private readonly mode: GraphMode,
    private readonly physics: GraphPhysicsStyle,
    private readonly callbacks: SvgGraphCallbacks,
  ) {
    this.svg = root.querySelector("[data-graph-svg]");
    this.world = root.querySelector("[data-graph-world]");
    this.wrap = root.querySelector("[data-graph-wrap]");
  }

  bind(): void {
    if (!this.svg || !this.world || !this.wrap) return;
    this.svg.addEventListener("wheel", this.handleWheel, { passive: false });
    this.svg.addEventListener("pointerdown", this.handlePointerDown);
    this.svg.addEventListener("click", this.handleClick);
    this.svg.addEventListener("contextmenu", this.handleContextMenu);
    this.updateLabelVisibility();
    if (this.mode === "obsidian") this.runSimulation();
  }

  dispose(): void {
    this.disposed = true;
    this.simulationToken += 1;
    this.svg?.removeEventListener("wheel", this.handleWheel);
    this.svg?.removeEventListener("pointerdown", this.handlePointerDown);
    this.svg?.removeEventListener("click", this.handleClick);
    this.svg?.removeEventListener("contextmenu", this.handleContextMenu);
  }

  setSearch(query: string): void {
    const normalized = query.trim().toLocaleLowerCase("ru");
    for (const node of this.nodes) {
      const element = this.root.querySelector<SVGGElement>(`[data-graph-node][data-key="${CSS.escape(node.key)}"]`);
      if (!element) continue;
      const matched = !normalized || (node.searchText ?? `${node.title} ${node.subtitle}`).toLocaleLowerCase("ru").includes(normalized);
      element.classList.toggle("search-dimmed", !matched);
      element.classList.toggle("search-match", Boolean(normalized) && matched);
    }
  }

  focusNode(key: string): void {
    const node = this.nodes.find((item) => item.key === key);
    if (!node || !this.world) return;
    this.viewport.x = WIDTH / 2 - node.x * this.viewport.zoom;
    this.viewport.y = HEIGHT / 2 - node.y * this.viewport.zoom;
    this.world.setAttribute("transform", this.worldTransform());
    this.callbacks.onViewportChange(this.viewport);
  }

  private readonly handleWheel = (event: WheelEvent): void => {
    if (!this.svg || !this.world) return;
    event.preventDefault();
    const rect = this.svg.getBoundingClientRect();
    const screenX = (event.clientX - rect.left) / rect.width * WIDTH;
    const screenY = (event.clientY - rect.top) / rect.height * HEIGHT;
    const oldZoom = this.viewport.zoom;
    const nextZoom = Math.min(3, Math.max(0.32, oldZoom * (event.deltaY < 0 ? 1.1 : 0.9)));
    const worldX = (screenX - this.viewport.x) / oldZoom;
    const worldY = (screenY - this.viewport.y) / oldZoom;
    this.viewport.x = screenX - worldX * nextZoom;
    this.viewport.y = screenY - worldY * nextZoom;
    this.viewport.zoom = nextZoom;
    this.world.setAttribute("transform", this.worldTransform());
    this.updateLabelVisibility();
    this.callbacks.onViewportChange(this.viewport);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.svg || !this.world) return;
    const nodeElement = event.target instanceof Element ? event.target.closest<SVGGElement>("[data-graph-node]") : null;
    const start = { x: event.clientX, y: event.clientY };
    if (nodeElement?.dataset.key) {
      event.preventDefault();
      event.stopPropagation();
      this.simulationToken += 1;
      const key = nodeElement.dataset.key;
      const node = this.nodes.find((item) => item.key === key);
      if (!node) return;
      const original = { x: node.x, y: node.y };
      let moved = false;
      nodeElement.classList.add("dragging");
      this.track(event, (move) => {
        const dx = move.clientX - start.x;
        const dy = move.clientY - start.y;
        moved ||= Math.hypot(dx, dy) > 3;
        node.x = original.x + dx / this.viewport.zoom;
        node.y = original.y + dy / this.viewport.zoom;
        node.pinned = true;
        this.updateDom();
      }, () => {
        nodeElement.classList.remove("dragging");
        this.callbacks.onMoveNode(node.key, node.x, node.y);
        if (!moved) {
          if (this.mode === "obsidian") this.callbacks.onPositionsChanged(this.nodes);
          this.callbacks.onSelectNode(node.key);
        } else if (this.mode === "obsidian") {
          this.runSimulation();
        }
      });
      return;
    }
    if (event.target === this.svg || (event.target instanceof SVGElement && !event.target.closest("[data-graph-node],[data-graph-edge]"))) {
      event.preventDefault();
      const original = { ...this.viewport };
      this.wrap?.classList.add("panning");
      this.track(event, (move) => {
        this.viewport.x = original.x + move.clientX - start.x;
        this.viewport.y = original.y + move.clientY - start.y;
        this.world?.setAttribute("transform", this.worldTransform());
      }, () => {
        this.wrap?.classList.remove("panning");
        this.callbacks.onViewportChange(this.viewport);
      });
    }
  };

  private readonly handleClick = (event: MouseEvent): void => {
    const edge = event.target instanceof Element ? event.target.closest<SVGGElement>("[data-graph-edge]") : null;
    if (edge?.dataset.id) this.callbacks.onSelectEdge(edge.dataset.id);
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    const node = event.target instanceof Element ? event.target.closest<SVGGElement>("[data-graph-node]") : null;
    if (!node?.dataset.key) return;
    event.preventDefault();
    event.stopPropagation();
    this.callbacks.onContextNode(node.dataset.key, event.clientX, event.clientY);
  };

  private runSimulation(): void {
    const token = ++this.simulationToken;
    const nodeByKey = new Map(this.nodes.map((node) => [node.key, node]));
    const edges = this.relationships.map((relationship) => ({
      source: nodeByKey.get(entityKey(relationship.sourceType, relationship.sourceId)),
      target: nodeByKey.get(entityKey(relationship.targetType, relationship.targetId)),
    })).filter((edge): edge is { source: SvgGraphNode; target: SvgGraphNode } => Boolean(edge.source && edge.target));
    const degree = new Set<string>();
    for (const edge of edges) { degree.add(edge.source.key); degree.add(edge.target.key); }
    const ideal = Math.max(20, this.physics.linkDistance);
    const maxFrames = this.mode === "custom" ? 100 : 170;
    let frame = 0;
    const tick = () => {
      if (this.disposed || token !== this.simulationToken || frame++ > maxFrames) {
        this.callbacks.onPositionsChanged(this.nodes);
        return;
      }
      const forces = new Map<string, { x: number; y: number }>();
      const forceFor = (key: string) => {
        const found = forces.get(key);
        if (found) return found;
        const created = { x: 0, y: 0 };
        forces.set(key, created);
        return created;
      };
      for (const edge of edges) {
        const dx = edge.target.x - edge.source.x;
        const dy = edge.target.y - edge.source.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const strength = (distance - ideal) * 0.015 * Math.max(0, this.physics.linkForce);
        const fx = dx / distance * strength;
        const fy = dy / distance * strength;
        const sourceForce = forceFor(edge.source.key);
        const targetForce = forceFor(edge.target.key);
        sourceForce.x += weightedGraphForce(fx, edge.source, edge.target);
        sourceForce.y += weightedGraphForce(fy, edge.source, edge.target);
        targetForce.x -= weightedGraphForce(fx, edge.target, edge.source);
        targetForce.y -= weightedGraphForce(fy, edge.target, edge.source);
      }
      const collisionNodes = this.mode === "custom" ? this.nodes.filter((node) => degree.has(node.key)) : this.nodes;
      for (let index = 0; index < collisionNodes.length; index += 1) {
        for (let otherIndex = index + 1; otherIndex < collisionNodes.length; otherIndex += 1) {
          const first = collisionNodes[index]!;
          const second = collisionNodes[otherIndex]!;
          const dx = second.x - first.x;
          const dy = second.y - first.y;
          const distance = Math.max(1, Math.hypot(dx, dy));
          const firstSpace = this.mode === "custom" ? 59 : Math.min(105, first.radius + first.title.length * (first.labelSize ?? 11) * 0.24);
          const secondSpace = this.mode === "custom" ? 59 : Math.min(105, second.radius + second.title.length * (second.labelSize ?? 11) * 0.24);
          const collision = firstSpace + secondSpace;
          if (distance >= collision) continue;
          const strength = (collision - distance) * 0.025 * Math.max(0, this.physics.repelForce);
          const fx = dx / distance * strength;
          const fy = dy / distance * strength;
          const firstForce = forceFor(first.key);
          const secondForce = forceFor(second.key);
          firstForce.x -= weightedGraphForce(fx, first, second);
          firstForce.y -= weightedGraphForce(fy, first, second);
          secondForce.x += weightedGraphForce(fx, second, first);
          secondForce.y += weightedGraphForce(fy, second, first);
        }
      }
      for (const node of this.nodes) {
        const force = forces.get(node.key);
        if (node.pinned) continue;
        const center = Math.max(0, this.physics.centerForce);
        const centerX = (WIDTH / 2 - node.x) * 0.0025 * center / nodeMass(node);
        const centerY = (HEIGHT / 2 - node.y) * 0.0025 * center / nodeMass(node);
        const fx = (force?.x ?? 0) + centerX;
        const fy = (force?.y ?? 0) + centerY;
        if (!fx && !fy) continue;
        node.x = Math.max(24, Math.min(WIDTH - 24, node.x + Math.max(-5, Math.min(5, fx))));
        node.y = Math.max(24, Math.min(HEIGHT - 24, node.y + Math.max(-5, Math.min(5, fy))));
      }
      this.updateDom();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private updateDom(): void {
    const nodeByKey = new Map(this.nodes.map((node) => [node.key, node]));
    for (const node of this.nodes) {
      this.root.querySelector<SVGGElement>(`[data-graph-node][data-key="${CSS.escape(node.key)}"]`)?.setAttribute("transform", `translate(${node.x},${node.y})`);
    }
    for (const edgeElement of this.root.querySelectorAll<SVGGElement>("[data-graph-edge]")) {
      const relationship = this.relationships.find((item) => item.id === edgeElement.dataset.id);
      if (!relationship) continue;
      const source = nodeByKey.get(entityKey(relationship.sourceType, relationship.sourceId));
      const target = nodeByKey.get(entityKey(relationship.targetType, relationship.targetId));
      if (!source || !target) continue;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const x1 = source.x + dx / length * source.radius;
      const y1 = source.y + dy / length * source.radius;
      const x2 = target.x - dx / length * target.radius;
      const y2 = target.y - dy / length * target.radius;
      const line = edgeElement.querySelector("line");
      const label = edgeElement.querySelector("text");
      line?.setAttribute("x1", String(x1)); line?.setAttribute("y1", String(y1));
      line?.setAttribute("x2", String(x2)); line?.setAttribute("y2", String(y2));
      label?.setAttribute("x", String((x1 + x2) / 2)); label?.setAttribute("y", String((y1 + y2) / 2 - 7));
    }
  }

  private worldTransform(): string {
    return `translate(${this.viewport.x} ${this.viewport.y}) scale(${this.viewport.zoom})`;
  }

  private updateLabelVisibility(): void {
    this.wrap?.classList.toggle("labels-hidden", this.viewport.zoom < 0.58);
  }

  private track(initial: PointerEvent, move: (event: PointerEvent) => void, end: () => void): void {
    const onMove = (event: PointerEvent) => move(event);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      end();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    initial.preventDefault();
  }
}
