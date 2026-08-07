import { AppStore } from "../application/store";
import { CoterieDispositionPolicy } from "../domain/coterie-disposition";
import { MentionIndex, SearchIndex, type SearchDocument } from "../domain/knowledge-search";
import { EntityChoicePolicy, EntityRegistry, RelationshipLabelPolicy, type FieldDefinition } from "../domain/registry";
import { defaultRelationshipColor, relationshipColor } from "../domain/relationship-style";
import { projectedSystemTagPaths } from "../domain/structured-tags";
import type { ChronicleRecord, EntityType, Relationship } from "../domain/types";
import { HttpChronicleGateway } from "../infrastructure/gateway";
import { asString, asStringArray, escapeAttr, escapeHtml, truncate } from "../ui/dom";
import { EntityFormRenderer } from "./forms";
import { ModalService, ToastService } from "./modal";

export interface EntityControllerHost {
  reload(): Promise<void>;
  navigate(route: string): void;
  currentRoute(): string;
  returnRoute(fallback: string): string;
}

interface RelationshipDraft {
  targetType: EntityType;
  targetId: string;
  relationLabel: string;
  notes: string;
  edgeColor: string;
  arrowDirection: Relationship["arrowDirection"];
  lineStyle: Relationship["lineStyle"];
}

export class EntityController {
  private readonly forms: EntityFormRenderer;
  private readonly dispositionPolicy = new CoterieDispositionPolicy();

  constructor(
    private readonly store: AppStore,
    private readonly registry: EntityRegistry,
    private readonly choices: EntityChoicePolicy,
    private readonly labels: RelationshipLabelPolicy,
    private readonly gateway: HttpChronicleGateway,
    private readonly modal: ModalService,
    private readonly toast: ToastService,
    private readonly host: EntityControllerHost,
  ) {
    this.forms = new EntityFormRenderer(store, registry, gateway);
  }

  renderList(entity: EntityType): string {
    const definition = this.registry.get(entity);
    const records = this.store.records(entity);
    return `
      <header class="view-head">
        <div><h1>${escapeHtml(definition.label)}</h1><p>${escapeHtml(definition.description)}</p></div>
        <button class="btn primary" data-action="new-record" data-entity="${entity}">Добавить</button>
      </header>
      <div class="grid cards">
        ${records.map((record) => this.renderCard(entity, record)).join("") || `<div class="empty-state"><h3>Пока пусто</h3><p>Добавьте первый объект.</p></div>`}
      </div>`;
  }

  renderDetail(entity: EntityType, id: string): string {
    const record = this.store.record(entity, id);
    const returnRoute = this.host.returnRoute(`entity:${entity}`);
    if (!record) return `<div class="empty-state"><h2>Объект не найден</h2><button class="btn" data-action="navigate" data-route="${escapeAttr(returnRoute)}">Назад</button></div>`;
    const definition = this.registry.get(entity);
    const relationships = this.relationshipsFor(entity, id);
    const outgoing = relationships.filter((relationship) => relationship.sourceType === entity && relationship.sourceId === id);
    const incoming = relationships.filter((relationship) => relationship.targetType === entity && relationship.targetId === id);
    const attached = this.attachedRelationships(record).filter((relationship) => !relationships.some((direct) => direct.id === relationship.id));
    const structural = this.structuralReferences(entity, id);
    const mentions = this.unlinkedMentions(entity, id);
    return `
      <header class="view-head">
        <div>
          <button class="text-button" data-action="navigate" data-route="${escapeAttr(returnRoute)}">← Назад</button>
          <h1>${escapeHtml(definition.title(record))}</h1>
          <p>${escapeHtml(definition.singular)}</p>
        </div>
        <div class="toolbar">
          <button class="btn" data-action="bookmark-entity" data-entity="${entity}" data-id="${escapeAttr(id)}" data-title="${escapeAttr(definition.title(record))}">В закладки</button>
          <button class="btn" data-action="save-as-template" data-entity="${entity}" data-id="${escapeAttr(id)}">Сохранить как шаблон</button>
          <button class="btn" data-action="edit-record" data-entity="${entity}" data-id="${escapeAttr(id)}">Редактировать</button>
          ${entity !== "campaigns" ? `<button class="btn danger" data-action="delete-record" data-entity="${entity}" data-id="${escapeAttr(id)}">Удалить</button>` : ""}
        </div>
      </header>
      <div class="detail-layout">
        <section class="detail-panel">
          ${this.renderSystemTags(entity, record)}
          <dl class="detail-list">${definition.fields.filter((field) => field.kind !== "relationshipSet").map((field) => this.renderFieldValue(field, record)).join("")}</dl>
        </section>
        <aside class="relationship-panel">
          <div class="panel-head"><h2>Связи</h2><button class="btn small" data-action="add-relationship" data-entity="${entity}" data-id="${escapeAttr(id)}">Добавить</button></div>
          <div class="relationship-list"><h3>Исходящие</h3>${outgoing.map((relationship) => this.renderRelationship(relationship, entity, id)).join("") || `<p class="muted">Нет исходящих связей.</p>`}<h3>Обратные ссылки</h3>${incoming.map((relationship) => this.renderRelationship(relationship, entity, id)).join("") || `<p class="muted">Нет входящих связей.</p>`}<h3>Привязано к связям</h3>${attached.map((relationship) => this.renderAttachedRelationship(relationship)).join("") || `<p class="muted">Нет привязок к связям.</p>`}<h3>Структурные ссылки</h3>${structural.map((document) => `<article class="relationship-item"><button class="linked-title" data-action="open-record" data-entity="${document.entity}" data-id="${escapeAttr(document.record.id)}">${escapeHtml(document.title)}</button><span>${escapeHtml(document.typeLabel)}</span><button class="btn small ghost" data-action="edit-record" data-entity="${document.entity}" data-id="${escapeAttr(document.record.id)}">Изменить</button></article>`).join("") || `<p class="muted">Нет структурных ссылок.</p>`}<h3>Несвязанные упоминания</h3>${mentions.map((mention) => `<article class="relationship-item mention-item"><button class="linked-title" data-action="open-record" data-entity="${mention.document.entity}" data-id="${escapeAttr(mention.document.record.id)}">${escapeHtml(mention.document.title)}</button><p>${escapeHtml(mention.snippet)}</p><div class="inline-actions"><button class="btn small ghost" data-action="edit-record" data-entity="${mention.document.entity}" data-id="${escapeAttr(mention.document.record.id)}">Изменить</button><button class="btn small" data-action="link-mention" data-source-entity="${mention.document.entity}" data-source-id="${escapeAttr(mention.document.record.id)}" data-target-entity="${entity}" data-target-id="${escapeAttr(id)}">Создать связь</button></div></article>`).join("") || `<p class="muted">Несвязанных упоминаний нет.</p>`}</div>
        </aside>
      </div>
      ${entity === "characters" ? this.renderMemoirs(id) : ""}`;
  }

  async handleAction(element: HTMLElement): Promise<boolean> {
    const action = element.dataset.action;
    const entity = element.dataset.entity as EntityType | undefined;
    const id = element.dataset.id;
    if (action === "new-record" && entity) {
      this.openEntityForm(entity);
      return true;
    }
    if (action === "open-record" && entity && id) {
      this.host.navigate(`detail:${entity}:${id}`);
      return true;
    }
    if (action === "edit-record" && entity && id) {
      this.openEntityForm(entity, id);
      return true;
    }
    if (action === "delete-record" && entity && id) {
      if (await this.modal.confirm("Удалить объект и все его связи?")) {
        const returnRoute = this.host.returnRoute(`entity:${entity}`);
        await this.run(async () => {
          await this.gateway.delete(entity, id);
          await this.host.reload();
          this.host.navigate(returnRoute);
        });
      }
      return true;
    }
    if (action === "add-relationship" && entity && id) {
      this.openRelationshipEditor(entity, id);
      return true;
    }
    if (action === "edit-relationship" && id) {
      const relationship = this.store.getState().snapshot.relationships.find((item) => item.id === id);
      if (relationship) this.openRelationshipEditor(relationship.sourceType, relationship.sourceId, relationship);
      return true;
    }
    if (action === "delete-relationship" && id) {
      if (await this.modal.confirm("Удалить эту связь?")) await this.run(async () => { await this.gateway.deleteRelationship(id); await this.host.reload(); });
      return true;
    }
    if (action === "add-memoir" && id) {
      this.openEntityForm("memoirs", undefined, { authorId: id });
      return true;
    }
    if (action === "link-mention" && element.dataset.sourceEntity && element.dataset.sourceId && element.dataset.targetEntity && element.dataset.targetId) {
      this.openRelationshipEditor(
        element.dataset.sourceEntity as EntityType,
        element.dataset.sourceId,
        undefined,
        { entityType: element.dataset.targetEntity as EntityType, entityId: element.dataset.targetId },
      );
      return true;
    }
    if (action === "save-as-template" && entity && id) {
      const record = this.store.record(entity, id);
      if (record) this.openTemplateForm(entity, record);
      return true;
    }
    return false;
  }

  openEntityForm(
    entity: EntityType,
    id?: string,
    preset: Record<string, unknown> = {},
    afterSave?: (record: ChronicleRecord) => Promise<void> | void,
    afterCancel?: () => void,
    relationshipPreset: ReadonlyMap<string, readonly string[]> = new Map(),
  ): void {
    const record = id ? this.store.record(entity, id) : undefined;
    const effectivePreset = record ? preset : {
      ...(this.registry.get(entity).graphable ? { importance: "Обычная" } : {}),
      ...(entity === "factions" ? { sect: "Не известно" } : {}),
      ...preset,
    };
    const returnRoute = this.host.returnRoute(`entity:${entity}`);
    const root = this.modal.open(
      record ? `Редактировать: ${this.registry.get(entity).title(record)}` : `Новый объект: ${this.registry.get(entity).singular}`,
      this.forms.render(entity, record, effectivePreset, relationshipPreset),
      "modal-wide",
    );
    if (!record) this.bindTemplatePicker(root, entity, effectivePreset);
    if (afterCancel) root.addEventListener("click", (event) => {
      const target = event.target;
      if (target === root || (target instanceof Element && target.closest("[data-modal-close]"))) queueMicrotask(afterCancel);
    });
    this.forms.bindConditionalFields(root);
    const form = root.querySelector<HTMLFormElement>("[data-entity-form]");
    for (const button of root.querySelectorAll<HTMLButtonElement>("[data-create-related]")) button.addEventListener("click", () => {
      if (!form) return;
      const targetEntity = button.dataset.targetEntity as EntityType | undefined;
      const fieldKey = button.dataset.fieldKey ?? "";
      if (!targetEntity || !fieldKey) return;
      const draft = this.forms.collect(form);
      const selections = new Map([...draft.relationships].map(([key, ids]) => [key, [...ids]]));
      const reopen = (created?: ChronicleRecord) => {
        if (created) selections.set(fieldKey, [...new Set([...(selections.get(fieldKey) ?? []), created.id])]);
        this.openEntityForm(entity, id, draft.payload, afterSave, afterCancel, selections);
      };
      this.openEntityForm(targetEntity, undefined, {}, (created) => reopen(created), () => reopen());
    });
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.run(async () => {
        if (!form.reportValidity()) return;
        if (entity === "factions") {
          const isSecondary = (form.elements.namedItem("isSecondary") as HTMLInputElement | null)?.checked;
          const mainFactionId = String((form.elements.namedItem("mainFactionId") as HTMLSelectElement | null)?.value ?? "");
          if (isSecondary && !mainFactionId) throw new Error("Для второстепенной фракции выберите основную фракцию.");
        }
        const submit = form.querySelector<HTMLButtonElement>("[type=submit]");
        if (submit) submit.disabled = true;
        const collected = this.forms.collect(form);
        try {
          const saved = record
            ? await this.gateway.updateRecord(entity, record.id, collected.payload)
            : await this.gateway.create(entity, collected.payload);
          await this.forms.syncRelationships(entity, saved.id, collected.relationships);
          this.modal.close();
          await this.host.reload();
          await afterSave?.(saved);
          if (!afterSave) this.host.navigate(returnRoute);
        } finally {
          if (submit) submit.disabled = false;
        }
      }, form);
    });
  }

  openRecordPreview(entity: EntityType, id: string): void {
    const record = this.store.record(entity, id);
    if (!record) return;
    const definition = this.registry.get(entity);
    const description = asString(record.description).trim();
    const fields = definition.fields
      .filter((field) => field.kind !== "relationshipSet" && field.key !== "description")
      .map((field) => this.renderFieldValue(field, record))
      .filter(Boolean)
      .slice(0, 6)
      .join("");
    const root = this.modal.open(definition.title(record), `
      <div class="record-preview">
        <div class="card-kicker">${escapeHtml(definition.singular)}</div>
        <section class="record-preview-description"><h3>Описание</h3><p class="${description ? "" : "muted"}">${escapeHtml(description) || "Описание пока не заполнено."}</p></section>
        ${fields ? `<dl class="detail-list">${fields}</dl>` : ""}
        <div class="modal-actions">
          <button class="btn ghost" type="button" data-preview-edit>Изменить</button>
          <button class="btn primary" type="button" data-preview-open>Открыть полностью</button>
        </div>
      </div>`);
    root.querySelector<HTMLElement>("[data-preview-open]")?.addEventListener("click", () => {
      this.modal.close();
      this.host.navigate(`detail:${entity}:${id}`);
    });
    root.querySelector<HTMLElement>("[data-preview-edit]")?.addEventListener("click", () => {
      this.modal.close();
      this.openEntityForm(entity, id);
    });
  }

  openRelationshipEditor(
    sourceType: EntityType,
    sourceId: string,
    relationship?: Relationship,
    fixedTarget?: { entityType: EntityType; entityId: string },
    draft?: RelationshipDraft,
  ): void {
    const sourceTitle = this.title(sourceType, sourceId);
    const root = this.modal.open(relationship ? "Редактировать связь" : `Новая связь: ${sourceTitle}`, `
      <form data-relationship-form>
        <div class="form-grid">
          <label class="field"><span>Тип объекта</span><select name="targetType" ${relationship || fixedTarget ? "disabled" : ""}></select></label>
          <label class="field"><span>Объект</span><select name="targetId" ${relationship || fixedTarget ? "disabled" : ""}></select><button class="btn small ghost relationship-create-target" type="button" data-create-target hidden>Создать</button></label>
          <label class="field"><span>Название связи</span><select name="labelPreset"></select></label>
          <label class="field" data-custom-label hidden><span>Своё название</span><input name="customLabel" placeholder="Введите название связи"></label>
          <label class="field wide"><span>Подробности</span><textarea name="notes">${escapeHtml(draft?.notes ?? relationship?.notes ?? "")}</textarea></label>
          <label class="field"><span>Цвет</span><input type="color" name="edgeColor" value="${escapeAttr(draft?.edgeColor || relationship?.edgeColor || defaultRelationshipColor(relationship?.relationLabel ?? "связано"))}">${this.renderColorSwatches(this.usedRelationshipColors(), "edgeColor")}</label>
          <label class="field"><span>Стрелка</span><select name="arrowDirection"><option value="">Без стрелки</option><option value="source-to-target">От первого ко второму</option><option value="target-to-source">От второго к первому</option></select></label>
          <label class="field"><span>Тип линии</span><select name="lineStyle"><option value="solid">Сплошная</option><option value="dashed">Пунктирная</option></select></label>
        </div>
        <p class="form-error" data-form-error hidden></p>
        <div class="modal-actions"><button class="btn ghost" type="button" data-modal-close>Отмена</button><button class="btn primary" type="submit">Сохранить</button></div>
      </form>`);
    const form = root.querySelector<HTMLFormElement>("[data-relationship-form]");
    if (!form) return;
    const targetTypeSelect = form.elements.namedItem("targetType") as HTMLSelectElement;
    const targetIdSelect = form.elements.namedItem("targetId") as HTMLSelectElement;
    const createTargetButton = form.querySelector<HTMLButtonElement>("[data-create-target]");
    const labelSelect = form.elements.namedItem("labelPreset") as HTMLSelectElement;
    const customInput = form.elements.namedItem("customLabel") as HTMLInputElement;
    const customRow = form.querySelector<HTMLElement>("[data-custom-label]");
    const arrowSelect = form.elements.namedItem("arrowDirection") as HTMLSelectElement;
    const lineStyleSelect = form.elements.namedItem("lineStyle") as HTMLSelectElement;
    const edgeColorInput = form.elements.namedItem("edgeColor") as HTMLInputElement;
    for (const swatch of root.querySelectorAll<HTMLButtonElement>("[data-color-input][data-color-value]")) swatch.addEventListener("click", () => {
      const input = form.elements.namedItem(swatch.dataset.colorInput ?? "") as HTMLInputElement | null;
      if (input) input.value = swatch.dataset.colorValue ?? input.value;
    });

    const targetGroups = this.choices.targets(sourceType);
    const initialTargetType = fixedTarget?.entityType ?? draft?.targetType ?? (relationship ? (relationship.sourceType === sourceType && relationship.sourceId === sourceId ? relationship.targetType : relationship.sourceType) : targetGroups.recommended[0] ?? "characters");
    targetTypeSelect.innerHTML = `${this.typeOptions(targetGroups.recommended, "Рекомендуемые", initialTargetType)}${this.typeOptions(targetGroups.more, "Ещё", initialTargetType)}`;
    targetTypeSelect.value = initialTargetType;

    const updateTargets = () => {
      const targetType = targetTypeSelect.value as EntityType;
      const currentTargetId = fixedTarget?.entityId ?? draft?.targetId ?? (relationship ? (relationship.sourceType === sourceType && relationship.sourceId === sourceId ? relationship.targetId : relationship.sourceId) : "");
      const definition = this.registry.get(targetType);
      const createOption = relationship || fixedTarget ? "" : `<option value="__new__">＋ Новый объект…</option>`;
      targetIdSelect.innerHTML = createOption + this.store.records(targetType).filter((record) => !(targetType === sourceType && record.id === sourceId)).map((record) => `<option value="${escapeAttr(record.id)}">${escapeHtml(definition.title(record))}</option>`).join("");
      if (currentTargetId) targetIdSelect.value = currentTargetId;
      if (createTargetButton) createTargetButton.hidden = targetIdSelect.value !== "__new__";
      updateLabels();
    };
    const updateLabels = () => {
      const targetType = targetTypeSelect.value as EntityType;
      const presets = [...new Set([
        ...this.labels.presets(sourceType, targetType),
        ...this.store.getState().snapshot.relationships
          .filter((item) => (
            (item.sourceType === sourceType && item.targetType === targetType)
            || (item.sourceType === targetType && item.targetType === sourceType)
          ))
          .map((item) => item.relationLabel.trim())
          .filter(Boolean),
      ])];
      const currentLabel = draft?.relationLabel || relationship?.relationLabel || presets[0] || "связано";
      const mode = presets.includes(currentLabel) ? currentLabel : "__custom";
      labelSelect.innerHTML = `${presets.map((label) => `<option value="${escapeAttr(label)}">${escapeHtml(label)}</option>`).join("")}<option value="__custom">Своё название...</option>`;
      labelSelect.value = mode;
      customInput.value = mode === "__custom" ? draft?.relationLabel ?? relationship?.relationLabel ?? "" : "";
      if (customRow) customRow.hidden = mode !== "__custom";
      if (!relationship && mode !== "__custom") edgeColorInput.value = defaultRelationshipColor(labelSelect.value);
    };
    targetTypeSelect.addEventListener("change", updateTargets);
    targetIdSelect.addEventListener("change", () => {
      if (createTargetButton) createTargetButton.hidden = targetIdSelect.value !== "__new__";
    });
    createTargetButton?.addEventListener("click", () => {
      if (targetIdSelect.value !== "__new__") return;
      const targetType = targetTypeSelect.value as EntityType;
      const relationLabel = labelSelect.value === "__custom" ? customInput.value.trim() : labelSelect.value;
      const savedDraft: RelationshipDraft = {
        targetType,
        targetId: "",
        relationLabel,
        notes: String((form.elements.namedItem("notes") as HTMLTextAreaElement).value),
        edgeColor: edgeColorInput.value,
        arrowDirection: arrowSelect.value as Relationship["arrowDirection"],
        lineStyle: lineStyleSelect.value as Relationship["lineStyle"],
      };
      this.openEntityForm(
        targetType,
        undefined,
        {},
        (saved) => this.openRelationshipEditor(sourceType, sourceId, relationship, undefined, { ...savedDraft, targetId: saved.id }),
        () => this.openRelationshipEditor(sourceType, sourceId, relationship, undefined, savedDraft),
      );
    });
    labelSelect.addEventListener("change", () => {
      if (customRow) customRow.hidden = labelSelect.value !== "__custom";
      if (labelSelect.value !== "__custom" && (!relationship || ["#c8a85a", "#737982"].includes(edgeColorInput.value.toLocaleLowerCase("ru")))) edgeColorInput.value = defaultRelationshipColor(labelSelect.value);
    });
    updateTargets();
    arrowSelect.value = draft?.arrowDirection ?? relationship?.arrowDirection ?? "";
    lineStyleSelect.value = draft?.lineStyle ?? relationship?.lineStyle ?? "solid";

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.run(async () => {
        const targetType = targetTypeSelect.value as EntityType;
        const targetId = targetIdSelect.value;
        const relationLabel = labelSelect.value === "__custom" ? customInput.value.trim() : labelSelect.value;
        if (!targetId || !relationLabel) throw new Error("Выберите объект и название связи.");
        const payload: Partial<Relationship> = {
          sourceType,
          sourceId,
          targetType,
          targetId,
          relationLabel,
          notes: String((form.elements.namedItem("notes") as HTMLTextAreaElement).value),
          edgeColor: String((form.elements.namedItem("edgeColor") as HTMLInputElement).value),
          arrowDirection: arrowSelect.value as Relationship["arrowDirection"],
          lineStyle: lineStyleSelect.value as Relationship["lineStyle"],
        };
        if (relationship) await this.gateway.updateRelationship(relationship.id, payload);
        else await this.gateway.upsert(payload);
        this.modal.close();
        await this.host.reload();
      }, form);
    });
  }

  private renderCard(entity: EntityType, record: ChronicleRecord): string {
    const definition = this.registry.get(entity);
    const tags = [...asStringArray(record.tags), ...this.structuredTags(entity, record)].slice(0, 6);
    return `<article class="record-card" data-action="open-record" data-entity="${entity}" data-id="${escapeAttr(record.id)}" tabindex="0">
      <div class="card-kicker">${escapeHtml(definition.singular)}</div>
      <h3>${escapeHtml(definition.title(record))}</h3>
      <p>${escapeHtml(truncate(definition.summary(record), 180)) || "Описание пока не заполнено."}</p>
      ${tags.length ? `<div class="tag-row">${tags.map((tag) => `<button class="tag-chip" data-action="search-tag" data-tag="${escapeAttr(tag)}">#${escapeHtml(tag)}</button>`).join("")}</div>` : ""}
      <div class="card-actions"><button class="btn small ghost" data-action="edit-record" data-entity="${entity}" data-id="${escapeAttr(record.id)}">Изменить</button></div>
    </article>`;
  }

  private usedRelationshipColors(): string[] {
    return [...new Set([
      "#737982",
      "#b23a48",
      "#2f8f5b",
      ...this.store.getState().snapshot.relationships.map(relationshipColor),
    ])].filter((color) => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 14);
  }

  private renderColorSwatches(colors: string[], inputName: string): string {
    return `<div class="used-color-swatches" aria-label="Уже используемые цвета">${colors.map((color) => `<button type="button" class="used-color-swatch" data-color-input="${escapeAttr(inputName)}" data-color-value="${escapeAttr(color)}" style="--swatch-color:${escapeAttr(color)}" title="${escapeAttr(color)}"></button>`).join("")}</div>`;
  }

  private renderSystemTags(entity: EntityType, record: ChronicleRecord): string {
    const tags = this.structuredTags(entity, record);
    if (!tags.length) return "";
    return `<div class="tag-row structured-tag-row">${tags.map((tag) => `<button class="tag-chip system-tag-chip" data-action="search-tag" data-tag="${escapeAttr(tag)}">#${escapeHtml(tag)}</button>`).join("")}</div>`;
  }

  private structuredTags(entity: EntityType, record: ChronicleRecord): string[] {
    return projectedSystemTagPaths(entity, record, this.registry.get(entity).fields, this.store.getState().snapshot.relationships, (type, id) => this.title(type, id));
  }

  private renderFieldValue(field: FieldDefinition, record: ChronicleRecord): string {
    if (field.visibleWhen && !field.visibleWhen.values.includes(asString(record[field.visibleWhen.field]))) return "";
    const raw = record[field.key];
    let rendered = asString(raw);
    if (field.kind === "disposition") rendered = this.dispositionPolicy.read(record)?.label ?? "";
    if (field.kind === "tokenList") rendered = asStringArray(raw).join(", ");
    if (field.kind === "ref" && field.entity && rendered) rendered = this.title(field.entity, rendered);
    if (field.kind === "multiRef" && field.entity) rendered = asStringArray(raw).map((id) => this.title(field.entity!, id)).join(", ");
    if (!rendered) return "";
    return `<div><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(rendered)}</dd></div>`;
  }

  private renderRelationship(relationship: Relationship, currentType: EntityType, currentId: string): string {
    const currentIsSource = relationship.sourceType === currentType && relationship.sourceId === currentId;
    const otherType = currentIsSource ? relationship.targetType : relationship.sourceType;
    const otherId = currentIsSource ? relationship.targetId : relationship.sourceId;
    return `<article class="relationship-item">
      <button class="linked-title" data-action="open-record" data-entity="${otherType}" data-id="${escapeAttr(otherId)}">${escapeHtml(this.title(otherType, otherId))}</button>
      <span>${escapeHtml(relationship.relationLabel || "связано")}</span>
      ${relationship.notes ? `<p>${escapeHtml(relationship.notes)}</p>` : ""}
      <div class="inline-actions"><button class="icon-button" data-action="edit-record" data-entity="${otherType}" data-id="${escapeAttr(otherId)}" title="Редактировать объект">✎ объект</button><button class="icon-button" data-action="edit-relationship" data-id="${escapeAttr(relationship.id)}" title="Редактировать связь">✎ связь</button><button class="icon-button danger" data-action="delete-relationship" data-id="${escapeAttr(relationship.id)}" title="Удалить">×</button></div>
    </article>`;
  }

  private renderAttachedRelationship(relationship: Relationship): string {
    return `<article class="relationship-item"><strong>${escapeHtml(this.title(relationship.sourceType, relationship.sourceId))} ↔ ${escapeHtml(this.title(relationship.targetType, relationship.targetId))}</strong><span>${escapeHtml(relationship.relationLabel || "связано")}</span>${relationship.notes ? `<p>${escapeHtml(relationship.notes)}</p>` : ""}<div class="inline-actions"><button class="icon-button" data-action="edit-relationship" data-id="${escapeAttr(relationship.id)}" title="Редактировать связь">✎</button><button class="icon-button danger" data-action="delete-relationship" data-id="${escapeAttr(relationship.id)}" title="Удалить">×</button></div></article>`;
  }

  private attachedRelationships(record: ChronicleRecord): Relationship[] {
    const ids = new Set(asStringArray(record.attachedRelationshipIds));
    return this.store.getState().snapshot.relationships.filter((relationship) => ids.has(relationship.id));
  }

  private renderMemoirs(characterId: string): string {
    const memoirs = this.store.records("memoirs").filter((record) => asString(record.authorId) === characterId).sort((a, b) => asString(b.entryDate).localeCompare(asString(a.entryDate)));
    return `<section class="memoir-section"><div class="panel-head"><div><h2>Мемуары</h2><p class="muted">Личные записи этого персонажа.</p></div><button class="btn" data-action="add-memoir" data-id="${escapeAttr(characterId)}">Новая запись</button></div>
      <div class="memoir-list">${memoirs.map((memoir) => `<article class="memoir-entry"><div class="card-kicker">${escapeHtml(asString(memoir.entryDate) || "Без даты")} · ${escapeHtml(asString(memoir.mood))}</div><p>${escapeHtml(asString(memoir.text))}</p><div class="card-actions"><button class="btn small ghost" data-action="edit-record" data-entity="memoirs" data-id="${escapeAttr(memoir.id)}">Редактировать</button></div></article>`).join("") || `<p class="muted">Записей пока нет.</p>`}</div></section>`;
  }

  private relationshipsFor(entity: EntityType, id: string): Relationship[] {
    return this.store.getState().snapshot.relationships.filter((relationship) => (relationship.sourceType === entity && relationship.sourceId === id) || (relationship.targetType === entity && relationship.targetId === id));
  }

  private searchIndex(): SearchIndex {
    return new SearchIndex(
      this.registry.searchable().flatMap((definition) => this.store.records(definition.type).map((record) => ({ entity: definition.type, record, title: definition.title(record), typeLabel: definition.singular, structuredTags: this.structuredTags(definition.type, record) }))),
      this.store.getState().snapshot.relationships,
      (entity, id) => this.title(entity, id),
    );
  }

  private structuralReferences(entity: EntityType, id: string): SearchDocument[] {
    return this.searchIndex().all().filter((document) => {
      if (document.entity === entity && document.record.id === id) return false;
      return Object.values(document.record).some((value) => value === id || (Array.isArray(value) && value.includes(id)));
    });
  }

  private unlinkedMentions(entity: EntityType, id: string) {
    const index = this.searchIndex();
    const target = index.all().find((document) => document.entity === entity && document.record.id === id);
    return target ? new MentionIndex(index.all(), this.store.getState().snapshot.relationships).mentionsFor(target) : [];
  }

  private bindTemplatePicker(root: HTMLElement, entity: EntityType, preset: Record<string, unknown>): void {
    const templates = this.store.records("entityTemplates").filter((template) => asString(template.targetType) === entity);
    if (!templates.length) return;
    const form = root.querySelector<HTMLFormElement>("[data-entity-form]");
    if (!form) return;
    form.insertAdjacentHTML("afterbegin", `<label class="field template-picker"><span>Шаблон</span><select data-template-picker><option value="">Без шаблона</option>${templates.map((template) => `<option value="${escapeAttr(template.id)}">${escapeHtml(asString(template.name))}</option>`).join("")}</select></label>`);
    form.querySelector<HTMLSelectElement>("[data-template-picker]")?.addEventListener("change", (event) => {
      const template = this.store.record("entityTemplates", (event.target as HTMLSelectElement).value);
      if (!template || !template.payload || typeof template.payload !== "object") return;
      this.modal.close();
      this.openEntityForm(entity, undefined, { ...(template.payload as Record<string, unknown>), ...preset });
    });
  }

  private openTemplateForm(entity: EntityType, record: ChronicleRecord): void {
    const definition = this.registry.get(entity);
    const payload: Record<string, unknown> = {};
    const excluded = new Set(["relationshipSet", "disposition", "ref", "multiRef", "date", "time"]);
    for (const field of definition.fields) if (!excluded.has(field.kind) && record[field.key] !== undefined) payload[field.key] = record[field.key];
    const root = this.modal.open("Сохранить как шаблон", `<form data-template-form><label class="field"><span>Название шаблона</span><input name="name" required value="${escapeAttr(definition.title(record))}"></label><p class="muted">Будут сохранены обычные поля, теги и псевдонимы. Даты, ссылки, связи и отношение к котерии не копируются.</p><div class="modal-actions"><button class="btn ghost" type="button" data-modal-close>Отмена</button><button class="btn primary" type="submit">Сохранить</button></div></form>`);
    root.querySelector<HTMLFormElement>("[data-template-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      void this.run(async () => {
        await this.gateway.create("entityTemplates", { name: String(new FormData(form).get("name") ?? ""), targetType: entity, payload });
        this.modal.close();
        await this.host.reload();
        this.toast.show("Шаблон сохранён");
      });
    });
  }

  private title(entity: EntityType, id: string): string {
    const record = this.store.record(entity, id);
    return record ? this.registry.get(entity).title(record) : id;
  }

  private typeOptions(types: EntityType[], label: string, selected: EntityType): string {
    return `<optgroup label="${escapeAttr(label)}">${types.map((type) => `<option value="${type}" ${type === selected ? "selected" : ""}>${escapeHtml(this.registry.get(type).label)}</option>`).join("")}</optgroup>`;
  }

  private async run(action: () => Promise<void>, form?: HTMLFormElement): Promise<void> {
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Неизвестная ошибка";
      const target = form?.querySelector<HTMLElement>("[data-form-error]");
      if (target) { target.textContent = message; target.hidden = false; }
      else this.toast.show(message, "error");
    }
  }
}
