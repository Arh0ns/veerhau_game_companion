import { CoterieDispositionPolicy } from "./coterie-disposition";
import { readSystemTags, systemTagPath } from "./structured-tags";
import type { ChronicleRecord, EntityType, Relationship } from "./types";

export interface SearchDocument {
  entity: EntityType;
  record: ChronicleRecord;
  title: string;
  typeLabel: string;
  text: string;
  tags: string[];
  aliases: string[];
  status: string;
  disposition: string;
  fields: Record<string, string>;
}

export interface SearchResult extends SearchDocument {
  snippet: string;
}

export interface MentionResult {
  document: SearchDocument;
  field: string;
  snippet: string;
}

export interface MentionSuggestion extends MentionResult {
  target: SearchDocument;
  pairKey: string;
}

export function mentionPairKey(source: SearchDocument, target: SearchDocument): string {
  return [`${source.entity}:${source.record.id}`, `${target.entity}:${target.record.id}`].sort().join("|");
}

type Token = { type: "term" | "or" | "not" | "left" | "right" | "property"; value: string };
type Predicate = (document: SearchDocument) => boolean;

const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("ru");
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function recordFields(record: ChronicleRecord): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") result[key.toLocaleLowerCase("ru")] = value;
    else if (Array.isArray(value) && value.every((item) => typeof item === "string")) result[key.toLocaleLowerCase("ru")] = value.join(" ");
  }
  return result;
}

function excerpt(text: string, query: string, radius = 72): string {
  const plain = text.replace(/\s+/g, " ").trim();
  if (!plain) return "";
  const index = normalize(plain).indexOf(normalize(query));
  if (index < 0) return plain.slice(0, radius * 2) + (plain.length > radius * 2 ? "…" : "");
  const start = Math.max(0, index - radius);
  const end = Math.min(plain.length, index + query.length + radius);
  return `${start ? "…" : ""}${plain.slice(start, end)}${end < plain.length ? "…" : ""}`;
}

export class SearchIndex {
  private readonly documents: SearchDocument[];
  private readonly relationshipsByKey = new Map<string, Relationship[]>();

  constructor(
    records: Array<{ entity: EntityType; record: ChronicleRecord; title: string; typeLabel: string; structuredTags?: string[] }>,
    private readonly relationships: Relationship[],
    private readonly titleFor: (entity: EntityType, id: string) => string,
  ) {
    const dispositions = new CoterieDispositionPolicy();
    this.documents = records.map(({ entity, record, title, typeLabel, structuredTags = [] }) => {
      const fields = recordFields(record);
      const aliases = strings(record.aliases);
      const tags = [...new Set([...strings(record.tags), ...readSystemTags(record).map(systemTagPath), ...structuredTags])];
      const disposition = dispositions.read(record);
      return {
        entity,
        record,
        title,
        typeLabel,
        aliases,
        tags,
        status: String(record.status ?? ""),
        disposition: disposition ? `${disposition.value} ${disposition.label}` : "",
        fields,
        text: [title, typeLabel, ...aliases, ...tags, ...Object.values(fields)].join(" \n"),
      };
    });
    for (const relationship of relationships) {
      for (const key of [`${relationship.sourceType}:${relationship.sourceId}`, `${relationship.targetType}:${relationship.targetId}`]) {
        const list = this.relationshipsByKey.get(key) ?? [];
        list.push(relationship);
        this.relationshipsByKey.set(key, list);
      }
    }
  }

  all(): SearchDocument[] {
    return this.documents;
  }

  search(query: string): SearchResult[] {
    const predicate = new SearchQueryParser(this.relationshipsByKey, this.titleFor).parse(query);
    const bareQuery = query.replace(/(?:^|\s)(?:тег|tag|тип|type|статус|status|отношение|disposition|связано|linked):[^\s]+/gi, "").replace(/[()\[\]"-]/g, " ").trim();
    return this.documents.filter(predicate).sort((a, b) => String(b.record.updatedAt).localeCompare(String(a.record.updatedAt))).map((document) => ({
      ...document,
      snippet: excerpt(document.text, bareQuery || document.title),
    }));
  }
}

export class SearchQueryParser {
  private tokens: Token[] = [];
  private cursor = 0;

  constructor(
    private readonly relationshipsByKey = new Map<string, Relationship[]>(),
    private readonly titleFor: (entity: EntityType, id: string) => string = (_, id) => id,
  ) {}

  parse(query: string): Predicate {
    this.tokens = this.tokenize(query);
    this.cursor = 0;
    if (!this.tokens.length) return () => true;
    return this.parseOr();
  }

  private parseOr(): Predicate {
    let left = this.parseAnd();
    while (this.peek()?.type === "or") {
      this.cursor += 1;
      const right = this.parseAnd();
      const previous = left;
      left = (document) => previous(document) || right(document);
    }
    return left;
  }

  private parseAnd(): Predicate {
    const predicates: Predicate[] = [];
    while (this.cursor < this.tokens.length && !["or", "right"].includes(this.peek()!.type)) predicates.push(this.parseUnary());
    return (document) => predicates.every((predicate) => predicate(document));
  }

  private parseUnary(): Predicate {
    if (this.peek()?.type === "not") {
      this.cursor += 1;
      const inner = this.parseUnary();
      return (document) => !inner(document);
    }
    if (this.peek()?.type === "left") {
      this.cursor += 1;
      const inner = this.parseOr();
      if (this.peek()?.type === "right") this.cursor += 1;
      return inner;
    }
    const token = this.tokens[this.cursor++] ?? { type: "term", value: "" };
    return this.termPredicate(token);
  }

  private termPredicate(token: Token): Predicate {
    if (token.type === "property") {
      const [field, ...rest] = token.value.split(":");
      const expected = normalize(rest.join(":"));
      return (document) => normalize(document.fields[normalize(field)]).includes(expected);
    }
    const colon = token.value.indexOf(":");
    if (colon > 0) {
      const operator = normalize(token.value.slice(0, colon));
      const expected = normalize(token.value.slice(colon + 1).replace(/^"|"$/g, ""));
      const tagExpected = expected.replace(/^#/, "");
      if (["тег", "tag"].includes(operator)) return (document) => document.tags.some((tag) => normalize(tag) === tagExpected || normalize(tag).startsWith(`${tagExpected}/`));
      if (["тип", "type"].includes(operator)) return (document) => normalize(document.entity).includes(expected) || normalize(document.typeLabel).includes(expected);
      if (["статус", "status"].includes(operator)) return (document) => normalize(document.status).includes(expected);
      if (["отношение", "disposition"].includes(operator)) return (document) => normalize(document.disposition).includes(expected);
      if (["связано", "linked"].includes(operator)) return (document) => this.linkedText(document).includes(expected);
    }
    const expected = normalize(token.value.replace(/^"|"$/g, ""));
    return (document) => normalize(document.text).includes(expected);
  }

  private linkedText(document: SearchDocument): string {
    const key = `${document.entity}:${document.record.id}`;
    return normalize((this.relationshipsByKey.get(key) ?? []).map((relationship) => {
      const source = relationship.sourceType === document.entity && relationship.sourceId === document.record.id;
      return `${relationship.relationLabel} ${this.titleFor(source ? relationship.targetType : relationship.sourceType, source ? relationship.targetId : relationship.sourceId)}`;
    }).join(" "));
  }

  private peek(): Token | undefined {
    return this.tokens[this.cursor];
  }

  private tokenize(query: string): Token[] {
    const tokens: Token[] = [];
    let index = 0;
    while (index < query.length) {
      if (/\s/.test(query[index]!)) { index += 1; continue; }
      const char = query[index]!;
      if (char === "(") { tokens.push({ type: "left", value: char }); index += 1; continue; }
      if (char === ")") { tokens.push({ type: "right", value: char }); index += 1; continue; }
      if (char === "-") { tokens.push({ type: "not", value: char }); index += 1; continue; }
      if (char === "[") {
        const end = query.indexOf("]", index + 1);
        const value = query.slice(index + 1, end < 0 ? query.length : end);
        tokens.push({ type: "property", value });
        index = end < 0 ? query.length : end + 1;
        continue;
      }
      let value = "";
      let quoted = false;
      while (index < query.length) {
        const current = query[index]!;
        if (current === "\"") { quoted = !quoted; value += current; index += 1; continue; }
        if (!quoted && (/\s/.test(current) || current === "(" || current === ")")) break;
        value += current;
        index += 1;
      }
      tokens.push({ type: normalize(value) === "or" ? "or" : "term", value });
    }
    return tokens;
  }
}

export class MentionIndex {
  constructor(private readonly documents: SearchDocument[], private readonly relationships: Relationship[]) {}

  mentionsFor(target: SearchDocument): MentionResult[] {
    const linked = new Set(this.relationships.map((relationship) => [
      `${relationship.sourceType}:${relationship.sourceId}`,
      `${relationship.targetType}:${relationship.targetId}`,
    ].sort().join("|")));
    const targetKey = `${target.entity}:${target.record.id}`;
    const terms = [target.title, ...target.aliases].map((item) => item.trim()).filter((item) => item.length >= 3);
    if (!terms.length) return [];
    const results: MentionResult[] = [];
    for (const document of this.documents) {
      const sourceKey = `${document.entity}:${document.record.id}`;
      if (sourceKey === targetKey || linked.has([sourceKey, targetKey].sort().join("|"))) continue;
      for (const [field, value] of Object.entries(document.fields)) {
        for (const term of terms) {
          const expression = new RegExp(`(?<![\\p{L}\\p{N}_])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "iu");
          if (!expression.test(value)) continue;
          results.push({ document, field, snippet: excerpt(value, term) });
          break;
        }
        if (results.at(-1)?.document === document) break;
      }
    }
    return results;
  }

  allSuggestions(): MentionSuggestion[] {
    const seen = new Set<string>();
    const result: MentionSuggestion[] = [];
    for (const target of this.documents) {
      for (const mention of this.mentionsFor(target)) {
        const pairKey = mentionPairKey(mention.document, target);
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        result.push({ ...mention, target, pairKey });
      }
    }
    return result;
  }
}
