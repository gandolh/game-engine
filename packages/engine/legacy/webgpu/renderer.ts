import type { GpuContext } from "./device";
import { resizeToDisplay } from "./device";
import { Camera2D } from "./camera";
import { SpriteBatch } from "./sprite-batch";

export interface ClearColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export class Renderer {
  readonly camera: Camera2D;
  readonly spriteBatch: SpriteBatch;
  clearColor: ClearColor = { r: 0.08, g: 0.09, b: 0.12, a: 1 };

  constructor(readonly gpu: GpuContext, camera: Camera2D) {
    this.camera = camera;
    this.spriteBatch = new SpriteBatch(gpu);
  }

  beginFrame(): GPUCommandEncoder {
    resizeToDisplay(this.gpu);
    this.spriteBatch.setCamera(this.camera.viewProjection());
    this.spriteBatch.begin();
    return this.gpu.device.createCommandEncoder();
  }

  endFrame(encoder: GPUCommandEncoder): void {
    const view = this.gpu.context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: this.clearColor,
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    this.spriteBatch.flush(pass);
    pass.end();
    this.gpu.device.queue.submit([encoder.finish()]);
  }
}
