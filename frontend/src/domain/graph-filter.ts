import type { ChronicleRecord, EntityType } from "./types";

export interface GraphRecordFilters {
  importance: ReadonlySet<string>;
  contentTypes: ReadonlySet<string>;
}

export function matchesGraphRecordFilters(entity: EntityType, record: ChronicleRecord, filters: GraphRecordFilters): boolean {
  const importance = String(record.importance || "Обычная");
  if (!filters.importance.has(importance)) return false;
  if (entity !== "events" && entity !== "facts") return true;
  const contentType = String(record.contentType ?? "");
  return filters.contentTypes.has(contentType || "Без типа");
}
