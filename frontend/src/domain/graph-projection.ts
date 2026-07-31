import { entityKey, type Relationship } from "./types";

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

