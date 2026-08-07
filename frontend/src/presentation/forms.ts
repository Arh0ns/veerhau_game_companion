import { AppStore } from "../application/store";
import { COTERIE_DISPOSITIONS, CoterieDispositionPolicy } from "../domain/coterie-disposition";
import { EntityRegistry, type FieldDefinition } from "../domain/registry";
import { mergeSystemTags, projectedSystemTagPaths, readSystemTags } from "../domain/structured-tags";
import type { ChronicleRecord, EntityType, Relationship, SystemTag } from "../domain/types";
import type { HttpChronicleGateway } from "../infrastructure/gateway";
import { asString, asStringArray, escapeAttr, escapeHtml } from "../ui/dom";

export interface CollectedForm {
  payload: Record<string, unknown>;
  relationships: Map<string, string[]>;
}

export class EntityFormRenderer {
  private readonly dispositionPolicy = new CoterieDispositionPolicy();
  constructor(
    private readonly store: AppStore,
    private readonly registry: EntityRegistry,
    private readonly gateway: HttpChronicleGateway,
  ) {}

  render(
    entity: EntityType,
    record?: ChronicleRecord,
    preset: Record<string, unknown> = {},
    relationshipPreset: ReadonlyMap<string, readonly string[]> = new Map(),
  ): string {
    const definition = this.registry.get(entity);
    const values = { ...(record ?? {}), ...preset } as ChronicleRecord;
    return `
      <form class="entity-form" data-entity-form data-entity="${entity}" data-id="${escapeAttr(record?.id ?? "")}">
        <div class="form-grid">
          ${definition.fields.map((field) => this.renderField(entity, field, values, relationshipPreset)).join("")}
        </div>
        <p class="form-error" data-form-error hidden></p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" data-modal-close>Отмена</button>
          <button class="btn primary" type="submit">Сохранить</button>
        </div>
      </form>`;
  }

  collect(form: HTMLFormElement): CollectedForm {
    const entity = form.dataset.entity as EntityType;
    const definition = this.registry.get(entity);
    const data = new FormData(form);
    const payload: Record<string, unknown> = {};
    const relationships = new Map<string, string[]>();
    const original = form.dataset.id ? this.store.record(entity, form.dataset.id) : undefined;
    const replacedNamespaces = new Set<string>();
    const generatedSystemTags: SystemTag[] = [];
    const addFieldTags = (field: FieldDefinition, values: string[]) => {
      const namespace = `field:${field.key}`;
      replacedNamespaces.add(namespace);
      for (const value of values.filter(Boolean)) {
        const linked = field.entity ? this.store.record(field.entity, value) : undefined;
        const label = linked && field.entity ? this.registry.get(field.entity).title(linked) : value;
        generatedSystemTags.push({ namespace, value, label, color: "" });
      }
    };
    for (const field of definition.fields) {
      if (field.kind === "relationshipSet") {
        const values = data.getAll(field.key).map(String);
        relationships.set(field.key, values);
        addFieldTags(field, values);
      } else if (field.kind === "multiRef") {
        const values = data.getAll(field.key).map(String);
        payload[field.key] = values;
        addFieldTags(field, values);
      } else if (field.kind === "tokenList") {
        const values = String(data.get(field.key) ?? "").split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
        payload[field.key] = values;
        addFieldTags(field, values);
      } else if (field.kind === "checkbox") {
        const checked = data.get(field.key) === "true";
        payload[field.key] = checked;
        addFieldTags(field, checked ? ["Да"] : []);
      } else if (field.kind === "disposition") {
        replacedNamespaces.add(CoterieDispositionPolicy.namespace);
        generatedSystemTags.push(...this.dispositionPolicy.toSystemTags(
          String(data.get("dispositionValue") ?? "unknown"),
          String(data.get("dispositionLabel") ?? ""),
          String(data.get("dispositionColor") ?? ""),
        ));
      } else {
        const value = String(data.get(field.key) ?? "").trim();
        payload[field.key] = value;
        if (["select", "searchSelect", "ref"].includes(field.kind)) addFieldTags(field, value ? [value] : []);
        if (field.kind === "ref" && field.relationLabel && field.currentRole) relationships.set(field.key, value ? [value] : []);
      }
    }
    if (entity === "factions" && payload.isSecondary !== true) {
      payload.mainFactionId = "";
      const namespace = "field:mainFactionId";
      replacedNamespaces.add(namespace);
      for (let index = generatedSystemTags.length - 1; index >= 0; index -= 1) {
        if (generatedSystemTags[index]?.namespace === namespace) generatedSystemTags.splice(index, 1);
      }
    }
    if (replacedNamespaces.size) payload.systemTags = mergeSystemTags(readSystemTags(original), replacedNamespaces, generatedSystemTags);
    return { payload, relationships };
  }

  async syncRelationships(entity: EntityType, recordId: string, selections: Map<string, string[]>): Promise<void> {
    const definition = this.registry.get(entity);
    for (const field of definition.fields.filter((item) => item.kind === "relationshipSet" || (item.kind === "ref" && item.relationLabel))) {
      if (!field.entity || !field.relationLabel || !field.currentRole) continue;
      const desired = new Set(selections.get(field.key) ?? []);
      const existing = this.matchingRelationships(entity, recordId, field);
      for (const relationship of existing) {
        const candidateId = field.currentRole === "source" ? relationship.targetId : relationship.sourceId;
        if (!desired.has(candidateId)) await this.gateway.deleteRelationship(relationship.id);
      }
      const existingIds = new Set(existing.map((relationship) => field.currentRole === "source" ? relationship.targetId : relationship.sourceId));
      for (const candidateId of desired) {
        if (existingIds.has(candidateId) || candidateId === recordId) continue;
        await this.gateway.upsert(field.currentRole === "source" ? {
          sourceType: entity, sourceId: recordId, targetType: field.entity, targetId: candidateId, relationLabel: field.relationLabel,
        } : {
          sourceType: field.entity, sourceId: candidateId, targetType: entity, targetId: recordId, relationLabel: field.relationLabel,
        });
      }
    }
  }

  bindConditionalFields(root: HTMLElement): void {
    const form = root.querySelector<HTMLFormElement>("[data-entity-form]");
    if (!form) return;
    const refresh = () => {
      const data = new FormData(form);
      for (const row of form.querySelectorAll<HTMLElement>("[data-visible-field]")) {
        const controller = row.dataset.visibleField ?? "";
        const allowed = (row.dataset.visibleValues ?? "").split("|");
        row.hidden = !allowed.includes(String(data.get(controller) ?? ""));
      }
      const disposition = String(data.get("dispositionValue") ?? "unknown");
      const custom = form.querySelector<HTMLElement>("[data-disposition-custom]");
      if (custom) custom.hidden = disposition !== "custom";
    };
    form.addEventListener("change", refresh);
    for (const swatch of form.querySelectorAll<HTMLButtonElement>("[data-disposition-color]")) swatch.addEventListener("click", () => {
      const input = form.elements.namedItem("dispositionColor") as HTMLInputElement | null;
      if (input) input.value = swatch.dataset.dispositionColor ?? input.value;
    });
    refresh();
  }

  private renderField(
    entity: EntityType,
    field: FieldDefinition,
    record: ChronicleRecord,
    relationshipPreset: ReadonlyMap<string, readonly string[]>,
  ): string {
    const visibleAttrs = field.visibleWhen
      ? `data-visible-field="${escapeAttr(field.visibleWhen.field)}" data-visible-values="${escapeAttr(field.visibleWhen.values.join("|"))}"`
      : "";
    const classes = `field ${field.wide ? "wide" : ""}`;
    const required = field.required ? "required" : "";
    if (field.kind === "disposition") return this.renderDisposition(field, record, visibleAttrs);
    const value = field.kind === "tokenList" ? asStringArray(record[field.key]).join(", ") : asString(record[field.key]);
    let control = "";
    if (field.kind === "checkbox") {
      return `<label class="${classes} checkbox-field" ${visibleAttrs}><input type="checkbox" name="${field.key}" value="true" ${record[field.key] ? "checked" : ""}><span>${escapeHtml(field.label)}</span></label>`;
    } else if (field.kind === "textarea") {
      control = `<textarea name="${field.key}" ${required}>${escapeHtml(value)}</textarea>`;
    } else if (field.kind === "select") {
      control = `<select name="${field.key}" ${required}><option value="">Не указано</option>${(field.options ?? []).map((option) => `<option value="${escapeAttr(option)}" ${value === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>`;
    } else if (field.kind === "searchSelect") {
      const listId = `options-${entity}-${field.key}`;
      control = `<input name="${field.key}" value="${escapeAttr(value)}" list="${listId}" ${required}><datalist id="${listId}">${(field.options ?? []).map((option) => `<option value="${escapeAttr(option)}"></option>`).join("")}</datalist>`;
    } else if (field.kind === "tokenList") {
      const listId = field.key === "tags" ? `known-tags-${entity}` : "";
      control = `<input name="${field.key}" value="${escapeAttr(value)}" ${listId ? `list="${listId}"` : ""} placeholder="${escapeAttr(field.placeholder ?? "")}" autocomplete="off">${listId ? `<datalist id="${listId}">${this.allTags().map((tag) => `<option value="${escapeAttr(tag)}"></option>`).join("")}</datalist>` : ""}<small class="field-help">Несколько значений разделяются запятыми.</small>`;
    } else if (field.kind === "ref") {
      control = this.renderRef(field, value, required, entity, record.id);
    } else if (field.kind === "multiRef") {
      control = this.renderMultiRef(field, asStringArray(record[field.key]));
    } else if (field.kind === "relationshipSet") {
      control = this.renderRelationshipSet(entity, record.id, field, relationshipPreset);
    } else {
      control = `<input type="${field.kind}" name="${field.key}" value="${escapeAttr(value)}" placeholder="${escapeAttr(field.placeholder ?? "")}" ${required}>`;
    }
    if (field.kind === "relationshipSet") return `<div class="${classes}" ${visibleAttrs}><span>${escapeHtml(field.label)}</span>${control}</div>`;
    return `<label class="${classes}" ${visibleAttrs}><span>${escapeHtml(field.label)}</span>${control}</label>`;
  }

  private renderDisposition(field: FieldDefinition, record: ChronicleRecord, visibleAttrs: string): string {
    const current = this.dispositionPolicy.read(record) ?? COTERIE_DISPOSITIONS.unknown;
    const labels: Record<string, string> = { ally: "Союзник", enemy: "Враг", neutral: "Нейтралитет", unknown: "Неизвестно", custom: "Своё значение" };
    return `<div class="field wide disposition-field" ${visibleAttrs}><span>${escapeHtml(field.label)}</span><select name="dispositionValue">${Object.entries(labels).map(([value, label]) => `<option value="${value}" ${current.value === value ? "selected" : ""}>${label}</option>`).join("")}</select><div class="disposition-custom-grid" data-disposition-custom ${current.value === "custom" ? "" : "hidden"}><label><span>Название</span><input name="dispositionLabel" value="${escapeAttr(current.value === "custom" ? current.label : "")}" placeholder="Например, должник"></label><label><span>Цвет</span><input type="color" name="dispositionColor" value="${escapeAttr(current.color)}">${this.renderDispositionColors()}</label></div></div>`;
  }

  private renderDispositionColors(): string {
    const colors = new Set(["#2f8f5b", "#b23a48", "#737982", "#f4f4f2", "#62b5e5"]);
    for (const entity of ["characters", "factions"] as EntityType[]) {
      for (const record of this.store.records(entity)) {
        for (const tag of readSystemTags(record)) if (tag.namespace === CoterieDispositionPolicy.namespace && /^#[0-9a-f]{6}$/i.test(tag.color)) colors.add(tag.color);
      }
    }
    return `<div class="used-color-swatches">${[...colors].map((color) => `<button type="button" class="used-color-swatch" data-disposition-color="${escapeAttr(color)}" style="--swatch-color:${escapeAttr(color)}" title="${escapeAttr(color)}"></button>`).join("")}</div>`;
  }

  private allTags(): string[] {
    const result = new Set<string>();
    for (const entity of ["coteries", "characters", "factions", "locations", "events", "facts", "clues", "artifacts", "storylines", "theories", "notes", "memoirs"] as EntityType[]) {
      for (const record of this.store.records(entity)) {
        for (const tag of asStringArray(record.tags)) result.add(tag);
        for (const tag of projectedSystemTagPaths(entity, record, this.registry.get(entity).fields, this.store.getState().snapshot.relationships, (type, id) => {
          const target = this.store.record(type, id);
          return target ? this.registry.get(type).title(target) : id;
        })) result.add(tag);
      }
    }
    for (const definition of this.store.records("tagDefinitions")) {
      const name = asString(definition.name);
      if (name) result.add(name);
    }
    return [...result].sort((a, b) => a.localeCompare(b, "ru"));
  }

  private renderRef(field: FieldDefinition, selected: string, required: string, currentEntity: EntityType, currentId: string): string {
    if (!field.entity) return "";
    const definition = this.registry.get(field.entity);
    const records = this.store.records(field.entity).filter((record) => !(field.entity === currentEntity && record.id === currentId) && (!field.filter || field.filter(record)));
    return `<select name="${field.key}" ${required}><option value="">Не указано</option>${records.map((record) => `<option value="${escapeAttr(record.id)}" ${selected === record.id ? "selected" : ""}>${escapeHtml(definition.title(record))}</option>`).join("")}</select>`;
  }

  private renderMultiRef(field: FieldDefinition, selected: string[]): string {
    if (!field.entity) return "";
    const definition = this.registry.get(field.entity);
    return `<div class="multi-select-list">${this.store.records(field.entity).filter((record) => !field.filter || field.filter(record)).map((record) => `<label><input type="checkbox" name="${field.key}" value="${escapeAttr(record.id)}" ${selected.includes(record.id) ? "checked" : ""}><span>${escapeHtml(definition.title(record))}</span></label>`).join("") || "<span class='muted'>Нет доступных объектов</span>"}</div>`;
  }

  private renderRelationshipSet(
    entity: EntityType,
    recordId: string,
    field: FieldDefinition,
    relationshipPreset: ReadonlyMap<string, readonly string[]>,
  ): string {
    if (!field.entity) return "";
    const preset = relationshipPreset.get(field.key);
    const selected = new Set(preset ?? this.matchingRelationships(entity, recordId, field).map((relationship) => field.currentRole === "source" ? relationship.targetId : relationship.sourceId));
    const definition = this.registry.get(field.entity);
    const records = this.store.records(field.entity).filter((record) => record.id !== recordId && (!field.filter || field.filter(record)));
    const create = field.allowCreate
      ? `<div class="relationship-set-actions"><button class="btn small ghost" type="button" data-create-related data-field-key="${escapeAttr(field.key)}" data-target-entity="${field.entity}">+ Создать ${escapeHtml(definition.singular.toLocaleLowerCase("ru"))}</button></div>`
      : "";
    return `<div class="relationship-set-control"><div class="multi-select-list relation-select">${records.map((record) => `<label><input type="checkbox" name="${field.key}" value="${escapeAttr(record.id)}" ${selected.has(record.id) ? "checked" : ""}><span>${escapeHtml(definition.title(record))}</span></label>`).join("") || "<span class='muted'>Нет доступных объектов</span>"}</div>${create}</div>`;
  }

  private matchingRelationships(entity: EntityType, recordId: string, field: FieldDefinition): Relationship[] {
    return this.store.getState().snapshot.relationships.filter((relationship) => {
      if (relationship.relationLabel !== field.relationLabel || relationship.sourceId === relationship.targetId) return false;
      if (field.currentRole === "source") return relationship.sourceType === entity && relationship.sourceId === recordId && relationship.targetType === field.entity;
      return relationship.targetType === entity && relationship.targetId === recordId && relationship.sourceType === field.entity;
    });
  }
}
