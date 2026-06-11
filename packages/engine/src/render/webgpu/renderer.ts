/// <reference types="@webgpu/types" />
// TODO(wave-2): implement WebGpuRenderer body (orchestrates all collaborators)
// TODO(wave-1): collaborator stubs below are filled by Wave 1a–1e
import type { Camera2D } from "../camera";
import type { LoadedAtlasImage } from "../../assets/loader";
import type { ParticleSystem } from "../particles";
import type { RendererLike, WashOptions, WeatherLike, DecorateFn, Sprite } from "../renderer";
import { EDG } from "../palette";
import { GpuContext } from "./gpu-context"; // TODO(wave-1a)
import { GpuAtlasStore } from "./texture-atlas"; // TODO(wave-1b)
import { SpriteBatch } from "./sprite-batch"; // TODO(wave-1c)
import { Overlay2D } from "./overlay-2d"; // TODO(wave-1d)
import { StaticLayerPass, WaterPass } from "./static-layer-pass"; // TODO(wave-1e)

export class WebGpuRenderer implements RendererLike {
  readonly camera: Camera2D;
  clearColor: string;
  pixelSnap: boolean;

  // Collaborators — set by Wave 2 after GpuContext is created
  private _gpuCtx: GpuContext | null = null; // TODO(wave-2)
  private _atlasStore: GpuAtlasStore | null = null; // TODO(wave-2)
  private _spriteBatch: SpriteBatch | null = null; // TODO(wave-2)
  private _overlay: Overlay2D | null = null; // TODO(wave-2)
  private _staticPass: StaticLayerPass | null = null; // TODO(wave-2)
  private _waterPass: WaterPass | null = null; // TODO(wave-2)

  // CPU-side atlas store for getAtlas() (must survive GPU-side uploads)
  private readonly atlases: Map<string, LoadedAtlasImage> = new Map();

  constructor(canvas: HTMLCanvasElement, camera: Camera2D) {
    this.camera = camera;
    this.clearColor = EDG.black;
    this.pixelSnap = true;
    // Suppress unused-variable lint until Wave 2 uses these
    void canvas;
  }

  addAtlas(atlas: LoadedAtlasImage): void {
    this.atlases.set(atlas.manifest.id, atlas);
    this._atlasStore?.add(atlas); // TODO(wave-2)
  }

  setAtlas(atlas: LoadedAtlasImage): void {
    this.addAtlas(atlas);
  }

  getAtlas(id: string): LoadedAtlasImage | undefined {
    return this.atlases.get(id);
  }

  bakeStaticLayer(
    _sprites: readonly Sprite[],
    _worldWidth: number,
    _worldHeight: number,
    _decorate?: DecorateFn,
  ): void {
    throw new Error("WebGpuRenderer.bakeStaticLayer: not implemented (Wave 2)");
  }

  bakeWaterPattern(_frame: string, _atlasId: string, _tileSize: number, _pixelScale?: number): void {
    throw new Error("WebGpuRenderer.bakeWaterPattern: not implemented (Wave 2)");
  }

  setWaterScroll(_offsetX: number, _offsetY: number): void {
    throw new Error("WebGpuRenderer.setWaterScroll: not implemented (Wave 2)");
  }

  setWaterSwell(_alpha: number, _offsetX: number, _offsetY: number): void {
    throw new Error("WebGpuRenderer.setWaterSwell: not implemented (Wave 2)");
  }

  clearStaticLayer(): void {
    throw new Error("WebGpuRenderer.clearStaticLayer: not implemented (Wave 2)");
  }

  beginFrame(): void {
    throw new Error("WebGpuRenderer.beginFrame: not implemented (Wave 2)");
  }

  push(_sprite: Sprite): void {
    throw new Error("WebGpuRenderer.push: not implemented (Wave 2)");
  }

  pushShadow(_x: number, _y: number, _rx: number, _ry: number, _alpha: number): void {
    throw new Error("WebGpuRenderer.pushShadow: not implemented (Wave 2)");
  }

  endFrame(_wash?: WashOptions, _particles?: ParticleSystem, _weather?: WeatherLike): void {
    throw new Error("WebGpuRenderer.endFrame: not implemented (Wave 2)");
  }

  // Suppress lint on unused private collaborators until Wave 2
  private _unusedRef(): void {
    // Keep references so tsc doesn't complain about unused imports
    void this._gpuCtx;
    void this._atlasStore;
    void this._spriteBatch;
    void this._overlay;
    void this._staticPass;
    void this._waterPass;
  }
}

/**
 * Async factory — called by createRenderer when navigator.gpu is available.
 * Currently throws "not implemented"; Wave 2 fills the body.
 */
export async function tryCreateWebGpuRenderer(
  _canvas: HTMLCanvasElement,
  _camera: Camera2D,
): Promise<RendererLike> {
  throw new Error("tryCreateWebGpuRenderer: not implemented (Wave 2)");
}
