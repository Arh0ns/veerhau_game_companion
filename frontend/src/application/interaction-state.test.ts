import { describe, expect, it } from "vitest";
import { InteractionStateMachine } from "./interaction-state";

describe("InteractionStateMachine", () => {
  it("does not allow two gestures at once", () => {
    const state = new InteractionStateMachine();
    state.begin("drag");
    expect(() => state.begin("pan")).toThrow();
    state.finish();
    state.begin("pan");
    expect(state.mode).toBe("pan");
  });
});

