export type SurfaceMode = "idle" | "pan" | "drag" | "resize" | "connect";

export class InteractionStateMachine {
  private currentMode: SurfaceMode = "idle";

  get mode(): SurfaceMode {
    return this.currentMode;
  }

  begin(mode: Exclude<SurfaceMode, "idle">): void {
    if (this.currentMode !== "idle") throw new Error(`Нельзя начать ${mode} из режима ${this.currentMode}`);
    this.currentMode = mode;
  }

  finish(): void {
    this.currentMode = "idle";
  }

  cancel(): void {
    this.currentMode = "idle";
  }
}

