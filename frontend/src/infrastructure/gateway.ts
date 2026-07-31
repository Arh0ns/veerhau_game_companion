import type {
  ChronicleRecord,
  ChronicleSnapshot,
  EntityType,
  InvestigationBoard,
  Relationship,
  TagSummary,
} from "../domain/types";

export interface SessionGateway {
  session(): Promise<boolean>;
  login(password: string): Promise<void>;
  logout(): Promise<void>;
}

export interface RecordGateway {
  bootstrap(): Promise<ChronicleSnapshot>;
  create(entity: EntityType, payload: Record<string, unknown>): Promise<ChronicleRecord>;
  updateRecord(entity: EntityType, id: string, patch: Record<string, unknown>): Promise<ChronicleRecord>;
  delete(entity: EntityType, id: string): Promise<void>;
}

export interface RelationshipGateway {
  upsert(payload: Partial<Relationship>): Promise<Relationship>;
  updateRelationship(id: string, patch: Partial<Relationship>): Promise<Relationship>;
  deleteRelationship(id: string): Promise<void>;
}

export interface BoardGateway {
  createBoard(payload: Record<string, unknown>): Promise<InvestigationBoard>;
  updateBoard(id: string, patch: Record<string, unknown>): Promise<InvestigationBoard>;
  deleteBoard(id: string): Promise<void>;
}

export interface TagGateway {
  listTags(): Promise<TagSummary[]>;
  createTag(payload: { name: string; description?: string; recommended?: boolean }): Promise<ChronicleRecord>;
  renameTag(source: string, target: string, merge?: boolean): Promise<{ updatedRecords: number; tags: TagSummary[] }>;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export class HttpChronicleGateway implements SessionGateway, RecordGateway, RelationshipGateway, BoardGateway, TagGateway {
  constructor(private readonly baseUrl = "/api/v1") {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      ...init,
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string } & T;
    if (!response.ok) throw new ApiError(data.error ?? `Ошибка HTTP ${response.status}`, response.status);
    return data;
  }

  async session(): Promise<boolean> {
    return (await this.request<{ authenticated: boolean }>("/session")).authenticated;
  }

  async login(password: string): Promise<void> {
    await this.request("/session", { method: "POST", body: JSON.stringify({ password }) });
  }

  async logout(): Promise<void> {
    await this.request("/session", { method: "DELETE" });
  }

  bootstrap(): Promise<ChronicleSnapshot> {
    return this.request("/bootstrap");
  }

  create(entity: EntityType, payload: Record<string, unknown>): Promise<ChronicleRecord> {
    return this.request(`/records/${entity}`, { method: "POST", body: JSON.stringify(payload) });
  }

  updateRecord(entity: EntityType, id: string, patch: Record<string, unknown>): Promise<ChronicleRecord> {
    return this.request(`/records/${entity}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  }

  async delete(entity: EntityType, id: string): Promise<void> {
    await this.request(`/records/${entity}/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  upsert(payload: Partial<Relationship>): Promise<Relationship> {
    return this.request("/relationships", { method: "POST", body: JSON.stringify(payload) });
  }

  updateRelationship(id: string, patch: Partial<Relationship>): Promise<Relationship> {
    return this.request(`/relationships/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  }

  async deleteRelationship(id: string): Promise<void> {
    await this.request(`/relationships/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  createBoard(payload: Record<string, unknown>): Promise<InvestigationBoard> {
    return this.request("/boards", { method: "POST", body: JSON.stringify(payload) });
  }

  updateBoard(id: string, patch: Record<string, unknown>): Promise<InvestigationBoard> {
    return this.request(`/boards/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  }

  async deleteBoard(id: string): Promise<void> {
    await this.request(`/boards/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  listTags(): Promise<TagSummary[]> {
    return this.request("/tags");
  }

  createTag(payload: { name: string; description?: string; recommended?: boolean }): Promise<ChronicleRecord> {
    return this.request("/tags", { method: "POST", body: JSON.stringify(payload) });
  }

  renameTag(source: string, target: string, merge = false): Promise<{ updatedRecords: number; tags: TagSummary[] }> {
    return this.request(`/tags/${merge ? "merge" : "rename"}`, { method: "POST", body: JSON.stringify({ source, target }) });
  }
}
