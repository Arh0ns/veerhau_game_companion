import { ENTITY_TYPES, type ChronicleRecord, type ChronicleSnapshot, type EntityType } from "../domain/types";

export interface AppState {
  authenticated: boolean;
  loading: boolean;
  route: string;
  snapshot: ChronicleSnapshot;
  search: string;
}

type Listener = (state: Readonly<AppState>) => void;

function emptySnapshot(): ChronicleSnapshot {
  const snapshot = Object.fromEntries(ENTITY_TYPES.map((type) => [type, []])) as unknown as ChronicleSnapshot;
  snapshot.relationships = [];
  return snapshot;
}

export class AppStore {
  private state: AppState = {
    authenticated: false,
    loading: true,
    route: "dashboard",
    snapshot: emptySnapshot(),
    search: "",
  };

  private readonly listeners = new Set<Listener>();

  getState(): Readonly<AppState> {
    return this.state;
  }

  patch(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  setSnapshot(snapshot: ChronicleSnapshot): void {
    this.patch({ snapshot });
  }

  records(entityType: EntityType): ChronicleRecord[] {
    return this.state.snapshot[entityType] ?? [];
  }

  record(entityType: EntityType, id: string): ChronicleRecord | undefined {
    return this.records(entityType).find((record) => record.id === id);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}

