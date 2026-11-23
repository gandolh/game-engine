import { describe, it, expect } from "vitest";
import { enterState, type FsmState } from "./components";

describe("enterState", () => {
  it("keeps enteredTick when the state is unchanged", () => {
    const fsm: FsmState<"A" | "B"> = { current: "A", enteredTick: 3 };
    enterState(fsm, "A", 10);
    expect(fsm).toEqual({ current: "A", enteredTick: 3 });
  });

  it("sets enteredTick to the given tick on a change", () => {
    const fsm: FsmState<"A" | "B"> = { current: "A", enteredTick: 3 };
    enterState(fsm, "B", 10);
    expect(fsm).toEqual({ current: "B", enteredTick: 10 });
  });
});
