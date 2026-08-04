import { entityKey, type Relationship } from "./types";

export function collapseSecondaryFactionRelationships(
  relationships: Relationship[],
  mainFactionBySecondary: ReadonlyMap<string, string>,
): Relationship[] {
  const projected: Relationship[] = [];
  const seen = new Set<string>();
  for (const relationship of relationships) {
    const sourceId = relationship.sourceType === "factions" ? mainFactionBySecondary.get(relationship.sourceId) ?? relationship.sourceId : relationship.sourceId;
    const targetId = relationship.targetType === "factions" ? mainFactionBySecondary.get(relationship.targetId) ?? relationship.targetId : relationship.targetId;
    if (relationship.sourceType === relationship.targetType && sourceId === targetId) continue;
    const pair = [entityKey(relationship.sourceType, sourceId), entityKey(relationship.targetType, targetId)].sort().join("|");
    const dedupeKey = `${pair}|${relationship.relationLabel}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    projected.push({ ...relationship, sourceId, targetId });
  }
  return projected;
}

export function reachableNodeKeys(
  relationships: readonly Relationship[],
  focusKey: string,
  depth: number,
): Set<string> {
  if (!focusKey) return new Set();
  const reached = new Set([focusKey]);
  let frontier = new Set([focusKey]);
  for (let step = 0; step < depth; step += 1) {
    const next = new Set<string>();
    for (const relationship of relationships) {
      const source = entityKey(relationship.sourceType, relationship.sourceId);
      const target = entityKey(relationship.targetType, relationship.targetId);
      if (frontier.has(source) && !reached.has(target)) next.add(target);
      if (frontier.has(target) && !reached.has(source)) next.add(source);
    }
    for (const key of next) reached.add(key);
    frontier = next;
    if (!frontier.size) break;
  }
  return reached;
}
