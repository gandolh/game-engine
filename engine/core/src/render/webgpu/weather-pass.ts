

import shaderSrc from "./shaders/weather.wgsl?raw";
import type { GpuContext } from "./gpu-context";
import type { RainField } from "../rain-field";
import { rgbOf } from "../palette";

const STREAK_FLOATS = 5; 
const SNOW_FLOATS   = 3; 

const INITIAL_CAPACITY = 512;

const STREAK_HALF_WIDTH = 0.35;

const WEATHER_UNIFORM_BYTES = 16;

export class WeatherPass {
  private readonly device: GPUDevice;

  private readonly rainPipeline: GPURenderPipeline;
  private readonly snowPipeline: GPURenderPipeline;

  private readonly weatherUniformBuffer: GPUBuffer;
  private readonly weatherUniformScratch: Float32Array;
  private readonly weatherBindGroupLayout: GPUBindGroupLayout;
  private readonly weatherBindGroup: GPUBindGroup;

  private rainInstanceBuffer: GPUBuffer;
  private rainInstanceCapacity: number;
  private rainStagingData: Float32Array;

  private snowInstanceBuffer: GPUBuffer;
  private snowInstanceCapacity: number;
  private snowStagingData: Float32Array;

  constructor(ctx: GpuContext) {
    this.device = ctx.device;

    this.weatherUniformBuffer = ctx.device.createBuffer({
      label: "WeatherPass weather-uniform buffer",
      size: WEATHER_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.weatherUniformScratch = new Float32Array(4);

    this.weatherBindGroupLayout = ctx.device.createBindGroupLayout({
      label: "WeatherPass weather-bgl",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    // Bind group references only the stable weatherUniformBuffer (contents
    // change via writeBuffer, not the binding), so it is safe to create once
    // here rather than per draw().
    this.weatherBindGroup = ctx.device.createBindGroup({
      label: "WeatherPass weather-bg",
      layout: this.weatherBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.weatherUniformBuffer } }],
    });

    const shaderModule = ctx.device.createShaderModule({
      label: "weather shader",
      code: shaderSrc,
    });

    const pipelineLayout = ctx.device.createPipelineLayout({
      label: "WeatherPass pipeline layout",
      bindGroupLayouts: [
        ctx.viewBindGroupLayout(),   
        this.weatherBindGroupLayout, 
      ],
    });

    const blendState: GPUBlendState = {
      color: {
        srcFactor:  "one",
        dstFactor:  "one-minus-src-alpha",
        operation:  "add",
      },
      alpha: {
        srcFactor:  "one",
        dstFactor:  "one-minus-src-alpha",
        operation:  "add",
      },
    };

    const rainInstanceLayout: GPUVertexBufferLayout = {
      arrayStride: STREAK_FLOATS * 4,
      stepMode: "instance",
      attributes: [

        { shaderLocation: 0, offset: 0,  format: "float32x2" },

        { shaderLocation: 1, offset: 8,  format: "float32x2" },

        { shaderLocation: 2, offset: 16, format: "float32" },
      ],
    };

    this.rainPipeline = ctx.device.createRenderPipeline({
      label: "WeatherPass rain pipeline",
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "vs_streak",
        buffers: [rainInstanceLayout],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [{ format: ctx.format, blend: blendState }],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
    });

    const snowInstanceLayout: GPUVertexBufferLayout = {
      arrayStride: SNOW_FLOATS * 4,
      stepMode: "instance",
      attributes: [

        { shaderLocation: 0, offset: 0, format: "float32x2" },

        { shaderLocation: 1, offset: 8, format: "float32" },
      ],
    };

    this.snowPipeline = ctx.device.createRenderPipeline({
      label: "WeatherPass snow pipeline",
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "vs_snow",
        buffers: [snowInstanceLayout],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [{ format: ctx.format, blend: blendState }],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
    });

    this.rainInstanceCapacity = INITIAL_CAPACITY;
    this.rainStagingData = new Float32Array(INITIAL_CAPACITY * STREAK_FLOATS);
    this.rainInstanceBuffer = this._createRainBuffer(INITIAL_CAPACITY);

    this.snowInstanceCapacity = INITIAL_CAPACITY;
    this.snowStagingData = new Float32Array(INITIAL_CAPACITY * SNOW_FLOATS);
    this.snowInstanceBuffer = this._createSnowBuffer(INITIAL_CAPACITY);
  }

  draw(pass: GPURenderPassEncoder, weather: RainField): void {
    const kind = weather.weatherKind;
    if (kind === "none" || weather.count === 0) return;

    const [r255, g255, b255] = rgbOf(weather.streakColor);

    const cr = (r255 ?? 0) / 255;
    const cg = (g255 ?? 0) / 255;
    const cb = (b255 ?? 0) / 255;
    const ca = weather.curtainAlpha;

    this.weatherUniformScratch[0] = cr;
    this.weatherUniformScratch[1] = cg;
    this.weatherUniformScratch[2] = cb;
    this.weatherUniformScratch[3] = ca;
    this.device.queue.writeBuffer(
      this.weatherUniformBuffer,
      0,
      this.weatherUniformScratch.buffer,
      0,
      WEATHER_UNIFORM_BYTES,
    );

    if (kind === "rain") {
      this._drawRain(pass, weather, this.weatherBindGroup);
    } else {
      this._drawSnow(pass, weather, this.weatherBindGroup);
    }
  }

  private _drawRain(
    pass: GPURenderPassEncoder,
    weather: RainField,
    weatherBindGroup: GPUBindGroup,
  ): void {

    const count = weather.count;
    if (count > this.rainInstanceCapacity) {
      let newCap = this.rainInstanceCapacity;
      while (newCap < count) newCap *= 2;
      this.rainInstanceBuffer.destroy();
      this.rainInstanceBuffer = this._createRainBuffer(newCap);
      this.rainStagingData = new Float32Array(newCap * STREAK_FLOATS);
      this.rainInstanceCapacity = newCap;
    }

    let i = 0;
    weather.forEachRainStreak((x0, y0, x1, y1) => {
      const base = i * STREAK_FLOATS;
      this.rainStagingData[base + 0] = x0;
      this.rainStagingData[base + 1] = y0;
      this.rainStagingData[base + 2] = x1;
      this.rainStagingData[base + 3] = y1;
      this.rainStagingData[base + 4] = STREAK_HALF_WIDTH;
      i++;
    });

    const writtenCount = i;
    if (writtenCount === 0) return;

    this.device.queue.writeBuffer(
      this.rainInstanceBuffer,
      0,
      this.rainStagingData.buffer,
      0,
      writtenCount * STREAK_FLOATS * 4,
    );

    pass.setPipeline(this.rainPipeline);

    pass.setBindGroup(1, weatherBindGroup);
    pass.setVertexBuffer(0, this.rainInstanceBuffer);

    pass.draw(6, writtenCount, 0, 0);
  }

  private _drawSnow(
    pass: GPURenderPassEncoder,
    weather: RainField,
    weatherBindGroup: GPUBindGroup,
  ): void {

    const count = weather.count;
    if (count > this.snowInstanceCapacity) {
      let newCap = this.snowInstanceCapacity;
      while (newCap < count) newCap *= 2;
      this.snowInstanceBuffer.destroy();
      this.snowInstanceBuffer = this._createSnowBuffer(newCap);
      this.snowStagingData = new Float32Array(newCap * SNOW_FLOATS);
      this.snowInstanceCapacity = newCap;
    }

    let i = 0;
    weather.forEachSnowFlake((cx, cy, halfSize) => {
      const base = i * SNOW_FLOATS;
      this.snowStagingData[base + 0] = cx;
      this.snowStagingData[base + 1] = cy;
      this.snowStagingData[base + 2] = halfSize;
      i++;
    });

    const writtenCount = i;
    if (writtenCount === 0) return;

    this.device.queue.writeBuffer(
      this.snowInstanceBuffer,
      0,
      this.snowStagingData.buffer,
      0,
      writtenCount * SNOW_FLOATS * 4,
    );

    pass.setPipeline(this.snowPipeline);

    pass.setBindGroup(1, weatherBindGroup);
    pass.setVertexBuffer(0, this.snowInstanceBuffer);

    pass.draw(6, writtenCount, 0, 0);
  }

  private _createRainBuffer(capacity: number): GPUBuffer {
    return this.device.createBuffer({
      label: "WeatherPass rain instance buffer",
      size: capacity * STREAK_FLOATS * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  private _createSnowBuffer(capacity: number): GPUBuffer {
    return this.device.createBuffer({
      label: "WeatherPass snow instance buffer",
      size: capacity * SNOW_FLOATS * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }
}
