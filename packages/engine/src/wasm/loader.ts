// Minimal wasm loader. Takes raw module bytes + an imports object and returns
// a typed instance. Stays platform-agnostic so the same code path works in
// the browser (fetch) and Node (fs.readFile / Buffer).

export type WasmImports = WebAssembly.Imports;

export interface LoadedWasm<T extends WebAssembly.Exports = WebAssembly.Exports> {
  module: WebAssembly.Module;
  instance: WebAssembly.Instance;
  exports: T;
  memory: WebAssembly.Memory;
}

export interface LoadWasmOptions {
  /** Raw module bytes (e.g. from fetch().arrayBuffer() or fs.readFile). */
  bytes: BufferSource;
  /** Wasm import object. AssemblyScript stub-runtime modules need only `env.abort`. */
  imports?: WasmImports;
}

/**
 * Instantiate a wasm module from raw bytes. Returns the instance plus a typed
 * exports view and a handle to the module's linear memory (looked up under the
 * conventional `memory` export name).
 */
export async function loadWasmModule<T extends WebAssembly.Exports = WebAssembly.Exports>(
  opts: LoadWasmOptions,
): Promise<LoadedWasm<T>> {
  const imports: WasmImports = {
    env: defaultEnvImports(),
    ...opts.imports,
  };
  if (opts.imports?.env) {
    imports.env = { ...defaultEnvImports(), ...opts.imports.env };
  }

  const { module, instance } = await WebAssembly.instantiate(opts.bytes, imports);
  const memory = instance.exports["memory"] as WebAssembly.Memory | undefined;
  if (!memory) {
    throw new Error("wasm module did not export 'memory'");
  }
  return {
    module,
    instance,
    exports: instance.exports as T,
    memory,
  };
}

/**
 * Browser/Node convenience: fetch wasm bytes from a URL and instantiate.
 * `globalThis.fetch` exists in both modern Node (>=18) and browsers.
 */
export async function fetchWasmModule<T extends WebAssembly.Exports = WebAssembly.Exports>(
  url: string,
  imports?: WasmImports,
): Promise<LoadedWasm<T>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch wasm at ${url}: ${res.status}`);
  const bytes = await res.arrayBuffer();
  return loadWasmModule<T>(imports ? { bytes, imports } : { bytes });
}

/**
 * Default `env` imports for AssemblyScript stub-runtime modules. AS emits
 * a call to `env.abort(msg, file, line, col)` when a runtime check fails
 * (e.g. unreachable, alloc-out-of-memory). We throw it as a JS error so the
 * host can catch it.
 */
function defaultEnvImports(): WebAssembly.ModuleImports {
  return {
    abort(msgPtr: number, filePtr: number, line: number, col: number): void {
      throw new Error(
        `wasm aborted: msg=${msgPtr} file=${filePtr} line=${line} col=${col}`,
      );
    },
  };
}
