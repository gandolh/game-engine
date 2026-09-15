

import { describe, it, expect, vi, afterEach } from "vitest";
import { SimClient } from "./client";

type WsEventHandler = ((event: MessageEvent) => void) | null;

interface StubWs {
  onopen: (() => void) | null;
  onmessage: WsEventHandler;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  readyState: number;
  close(): void;
  send(_data: string): void;
  deliver(data: unknown): void;
}

function makeStubWebSocket(): StubWs {
  const ws: StubWs = {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    readyState: WebSocket.OPEN,
    close() { this.readyState = WebSocket.CLOSED; },
    send(_data: string) {  },
    deliver(data: unknown) {
      const event = new MessageEvent("message", { data: JSON.stringify(data) });
      this.onmessage?.(event);
    },
  };
  return ws;
}

function makeClient(): { client: SimClient; ws: StubWs } {
  const ws = makeStubWebSocket();
  vi.stubGlobal("WebSocket", function() { return ws; });
  const client = new SimClient("ws://test-stub");
  ws.onopen?.();
  return { client, ws };
}

describe("SimClient — tick-fault terminal state (audit-17)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.getElementById("sim-fault-banner")?.remove();
  });

  it("marks the client faulted and carries the tick + message once a fault message arrives", () => {
    const { client, ws } = makeClient();

    expect(client.faulted).toBe(false);
    expect(client.faultMessage).toBeNull();

    ws.deliver({ type: "fault", tick: 17, message: "boom: system X threw" });

    expect(client.faulted).toBe(true);
    expect(client.faultMessage).toBe("boom: system X threw");

    client.terminate();
  });

  it("invokes the onFault callback with tick and message", () => {
    const { client, ws } = makeClient();
    const cb = vi.fn();
    client.onFault(cb);

    ws.deliver({ type: "fault", tick: 20, message: "oops" });

    expect(cb).toHaveBeenCalledWith(20, "oops");

    client.terminate();
  });

  it("shows a visible DOM banner so a viewer sees the run crashed, not a frozen screen", () => {
    const { client, ws } = makeClient();

    expect(document.getElementById("sim-fault-banner")).toBeNull();

    ws.deliver({ type: "fault", tick: 5, message: "system threw" });

    const banner = document.getElementById("sim-fault-banner");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("tick 5");
    expect(banner!.textContent).toContain("system threw");

    client.terminate();
  });
});
