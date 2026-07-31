export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export const escapeAttr = escapeHtml;

export function asString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function truncate(value: unknown, max = 150): string {
  const text = String(value ?? "").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function closestAction(event: Event): HTMLElement | null {
  return event.target instanceof Element ? event.target.closest<HTMLElement>("[data-action]") : null;
}

export function formDataObject(form: HTMLFormElement): Record<string, FormDataEntryValue> {
  return Object.fromEntries(new FormData(form).entries());
}
