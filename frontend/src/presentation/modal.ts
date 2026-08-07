import { escapeHtml } from "../ui/dom";

export class ModalService {
  private backdrop: HTMLElement | null = null;

  open(title: string, body: string, className = ""): HTMLElement {
    this.close();
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <section class="modal ${className}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <header class="modal-head">
          <h2>${escapeHtml(title)}</h2>
          <button class="icon-button" type="button" data-modal-close aria-label="Закрыть">×</button>
        </header>
        <div class="modal-body">${body}</div>
      </section>`;
    let backdropPressed = false;
    backdrop.addEventListener("pointerdown", (event) => { backdropPressed = event.target === backdrop; });
    backdrop.addEventListener("pointerup", (event) => {
      if (backdropPressed && event.target === backdrop) this.dismiss(backdrop);
      backdropPressed = false;
    });
    backdrop.addEventListener("pointercancel", () => { backdropPressed = false; });
    backdrop.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("[data-modal-close]")) this.dismiss(backdrop);
    });
    document.body.append(backdrop);
    this.backdrop = backdrop;
    return backdrop;
  }

  async confirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      const root = this.open("Подтверждение", `
        <p>${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" data-confirm="no">Отмена</button>
          <button class="btn danger" type="button" data-confirm="yes">Удалить</button>
        </div>`);
      root.addEventListener("click", (event) => {
        const button = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-confirm]") : null;
        if (!button) return;
        const result = button.dataset.confirm === "yes";
        this.close();
        resolve(result);
      });
    });
  }

  close(): void {
    this.backdrop?.remove();
    this.backdrop = null;
  }

  private dismiss(backdrop: HTMLElement): void {
    if (this.backdrop !== backdrop) return;
    backdrop.dispatchEvent(new CustomEvent("modalcancel"));
    this.close();
  }
}

export class ToastService {
  show(message: string, tone: "normal" | "error" = "normal"): void {
    const toast = document.createElement("div");
    toast.className = `toast ${tone === "error" ? "toast-error" : ""}`;
    toast.textContent = message;
    document.body.append(toast);
    requestAnimationFrame(() => toast.classList.add("visible"));
    window.setTimeout(() => {
      toast.classList.remove("visible");
      window.setTimeout(() => toast.remove(), 200);
    }, 2600);
  }
}

