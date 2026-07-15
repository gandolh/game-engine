

import type {
  SimInbound,
  SimOutbound,
  SimInitMsg,
  SimStaticLayerMsg,
  RenderSnapshot,
  SnapshotSprite,
  SnapshotRivalry,
  SnapshotWealthSeries,
  FinalStandingRow,
  RunRecap,
  RelationshipMatrixData,
  ObserverSnapshot,
  LeaderboardRow,
} from "@farm/sim-core/snapshot";
import type { ProfileReport } from "@engine/core";
import type { ShopOffer } from "@farm/sim-core/agents/shop-slate";
import { clamp, lerp, smoothstep, copySprite } from "./interp";

const MAX_LERP_DIST_PX = 2 * 16;
const MAX_LERP_DIST_SQ = MAX_LERP_DIST_PX * MAX_LERP_DIST_PX;

function resolveServerUrl(): string {
  if (typeof location === "undefined") return "ws://localhost:8787";
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const base = import.meta.env.BASE_URL ?? "/";
  return `${scheme}://${location.host}${base}sim`;
}

export class SimClient {
  private readonly ws: WebSocket;

  private readonly pending: SimInbound[] = [];
  private conned = false;
  private connectionLostCallback: (() => void) | null = null;

  private docListener: (() => void) | null = null;

  private prevSnapshot: RenderSnapshot | null = null;
  private currentSnapshot: RenderSnapshot | null = null;

  private cachedWealthSeries: SnapshotWealthSeries[] = [];

  private lastSnapshotArrivalMs = 0;

  private msPerTick = 50;

  private get renderDelayMs(): number {
    return 2 * this.msPerTick;
  }

  private staticLayerCallback: ((msg: SimStaticLayerMsg) => void) | null = null;
  private snapshotCallback: ((snap: RenderSnapshot) => void) | null = null;
  private profileCallback: ((tick: number, report: ProfileReport) => void) | null = null;
  private attachCallback: ((owner: boolean) => void) | null = null;

  private isOwner = true;

  private readonly prevById = new Map<number, SnapshotSprite>();
  private interpOut: SnapshotSprite[] = [];

  private hitstopFramesLeft = 0;
  private hitstopAlpha = 0;

  constructor(url: string = resolveServerUrl()) {
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.conned = true;

      for (const msg of this.pending) this.ws.send(JSON.stringify(msg));
      this.pending.length = 0;
    };

    this.ws.onmessage = (event: MessageEvent) => {
      let msg: SimOutbound;
      try {
        msg = JSON.parse(event.data as string) as SimOutbound;
      } catch {
        return; 
      }
      if (msg.type === "static-layer") {
        this.staticLayerCallback?.(msg);
      } else if (msg.type === "snapshot") {
        this.prevSnapshot = this.currentSnapshot;
        this.currentSnapshot = msg.snapshot;
        this.lastSnapshotArrivalMs = performance.now();

        if (msg.snapshot.wealthSeries !== null) {
          this.cachedWealthSeries = msg.snapshot.wealthSeries;
        }

        this.prevById.clear();
        const prev = this.prevSnapshot;
        if (prev !== null) {
          for (const s of prev.sprites) {
            if (s.interpolate && s.id !== null) this.prevById.set(s.id, s);
          }
        }

        if (typeof document !== "undefined" && document.hidden) {
          this.prevSnapshot = null;
          this.prevById.clear();
        }
        this.snapshotCallback?.(msg.snapshot);
      } else if (msg.type === "profile") {
        this.profileCallback?.(msg.tick, msg.report);
      } else if (msg.type === "attach") {

        this.isOwner = msg.owner;
        this.attachCallback?.(msg.owner);
      }
    };

    this.ws.onclose = () => {
      this.conned = false;
      this.connectionLostCallback?.();
    };
    this.ws.onerror = () => {

      this.connectionLostCallback?.();
    };

    if (typeof document !== "undefined") {
      this.docListener = () => this.onVisibilityChange();
      document.addEventListener("visibilitychange", this.docListener);
    }
  }

  private onVisibilityChange(): void {
    if (document.hidden) {
      this.prevSnapshot = null;
      this.prevById.clear();
    } else {
      this.lastSnapshotArrivalMs = performance.now();
    }
  }

  private sendMsg(msg: SimInbound): void {
    if (this.conned && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.pending.push(msg);
    }
  }

  onConnectionLost(cb: () => void): void {
    this.connectionLostCallback = cb;
  }

  init(opts: Omit<SimInitMsg, "type">): void {
    this.msPerTick = 1000 / opts.tickRateHz;
    this.sendMsg({ type: "init", ...opts });
  }

  stop(): void {
    this.sendMsg({ type: "stop" });
  }

  setPaused(paused: boolean): void {
    this.sendMsg({ type: "pause", paused });
  }

  setSpeed(multiplier: number): void {
    this.sendMsg({ type: "speed", multiplier });
  }

  step(): void {
    this.sendMsg({ type: "step" });
  }

  skipToHighlight(): void {
    this.sendMsg({ type: "skipToHighlight" });
  }

  sendInput(
    moveX: "left" | "right" | null,
    moveY: "up" | "down" | null,
    action: boolean,
    selectSlot: number | null = null,
    actionTile: { x: number; y: number } | null = null,
  ): void {
    this.sendMsg({ type: "input", moveX, moveY, action, selectSlot, actionTile });
  }

  swapSlots(a: number, b: number): void {
    this.sendMsg({ type: "swap-slots", a, b });
  }

  terminate(): void {

    if (this.docListener !== null && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.docListener);
      this.docListener = null;
    }
    this.ws.close();
  }

  setProfiling(enabled: boolean): void {
    this.sendMsg({ type: "profile", enabled });
  }

  onStaticLayer(cb: (msg: SimStaticLayerMsg) => void): void {
    this.staticLayerCallback = cb;
  }

  onSnapshot(cb: (snap: RenderSnapshot) => void): void {
    this.snapshotCallback = cb;
  }

  onProfile(cb: (tick: number, report: ProfileReport) => void): void {
    this.profileCallback = cb;
  }

  onAttach(cb: (owner: boolean) => void): void {
    this.attachCallback = cb;
  }

  get owner(): boolean {
    return this.isOwner;
  }

  latestSnapshot(): RenderSnapshot | null {
    return this.currentSnapshot;
  }

  freezeInterp(frames: number): void {
    if (frames <= 0) return;
    const now = performance.now();
    const rawAlpha = clamp(
      (now - this.lastSnapshotArrivalMs - this.renderDelayMs) / this.msPerTick,
      0,
      1,
    );
    this.hitstopAlpha = smoothstep(rawAlpha);
    this.hitstopFramesLeft = frames;
  }

  getInterpolatedSprites(): SnapshotSprite[] {
    const current = this.currentSnapshot;
    if (current === null) {
      this.interpOut.length = 0;
      return this.interpOut;
    }

    let alpha: number;

    if (this.hitstopFramesLeft > 0) {
      this.hitstopFramesLeft -= 1;
      alpha = this.hitstopAlpha;
    } else {
      const now = performance.now();

      const rawAlpha = clamp(
        (now - this.lastSnapshotArrivalMs - this.renderDelayMs) / this.msPerTick,
        0,
        1,
      );
      alpha = smoothstep(rawAlpha);
    }

    const prev = this.prevSnapshot;
    const src = current.sprites;
    const out = this.interpOut;

    for (let i = 0; i < src.length; i += 1) {
      const s = src[i]!;
      let dst = out[i];
      if (dst === undefined) {

        dst = { ...s };
        out[i] = dst;
      } else {
        copySprite(dst, s);
      }
      if (s.interpolate && s.id !== null && prev !== null) {
        const p = this.prevById.get(s.id);
        if (p !== undefined) {

          const dx = s.x - p.x;
          const dy = s.y - p.y;
          if (dx * dx + dy * dy <= MAX_LERP_DIST_SQ) {
            dst.x = lerp(p.x, s.x, alpha);
            dst.y = lerp(p.y, s.y, alpha);
          }
        }
      }
    }

    if (out.length !== src.length) out.length = src.length;
    return out;
  }

  getFarmerInterpolatedPos(id: number): { x: number; y: number } | null {
    const sprites = this.getInterpolatedSprites();
    for (const s of sprites) {
      if (s.id === id && s.interpolate) {
        return { x: s.x, y: s.y };
      }
    }
    return null;
  }

  get observer(): ObserverSnapshot | null {
    return this.currentSnapshot?.observer ?? null;
  }

  get leaderboard(): LeaderboardRow[] {
    return this.currentSnapshot?.leaderboard ?? [];
  }

  get slate(): ShopOffer[] {
    return (this.currentSnapshot?.slate ?? []) as ShopOffer[];
  }

  get meets(): RenderSnapshot["meets"] {
    return this.currentSnapshot?.meets ?? [];
  }

  get events(): RenderSnapshot["events"] {
    return this.currentSnapshot?.events ?? [];
  }

  get day(): number {
    return this.currentSnapshot?.day ?? 0;
  }

  get tick(): number {
    return this.currentSnapshot?.tick ?? 0;
  }

  get entityCount(): number {
    return this.currentSnapshot?.entityCount ?? 0;
  }

  get gameOver(): boolean {
    return this.currentSnapshot?.gameOver ?? false;
  }

  get finalSummary(): FinalStandingRow[] | null {
    return this.currentSnapshot?.finalSummary ?? null;
  }

  get recap(): RunRecap | null {
    return this.currentSnapshot?.recap ?? null;
  }

  get shock(): RenderSnapshot["shock"] {
    return this.currentSnapshot?.shock ?? null;
  }

  get playerHotbar(): RenderSnapshot["playerHotbar"] {
    return this.currentSnapshot?.playerHotbar ?? null;
  }

  get playerInventory(): RenderSnapshot["playerInventory"] {
    return this.currentSnapshot?.playerInventory ?? null;
  }

  get relationships(): RelationshipMatrixData {
    return this.currentSnapshot?.relationships ?? { farmers: [], trust: {} };
  }

  get rivalries(): SnapshotRivalry[] {
    return this.currentSnapshot?.rivalries ?? [];
  }

  get wealthSeries(): SnapshotWealthSeries[] {
    return this.cachedWealthSeries;
  }
}
