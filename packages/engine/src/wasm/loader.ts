

export type WasmImports = WebAssembly.Imports;

export interface LoadedWasm<T extends WebAssembly.Exports = WebAssembly.Exports> {
  module: WebAssembly.Module;
  instance: WebAssembly.Instance;
  exports: T;
  memory: WebAssembly.Memory;
}

export interface LoadWasmOptions {
  bytes: BufferSource;
  imports?: WasmImports;
}

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

export async function fetchWasmModule<T extends WebAssembly.Exports = WebAssembly.Exports>(
  url: string,
  imports?: WasmImports,
): Promise<LoadedWasm<T>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch wasm at ${url}: ${res.status}`);
  const bytes = await res.arrayBuffer();
  return loadWasmModule<T>(imports ? { bytes, imports } : { bytes });
}

function defaultEnvImports(): WebAssembly.ModuleImports {
  return {
    abort(msgPtr: number, filePtr: number, line: number, col: number): void {
      throw new Error(
        `wasm aborted: msg=${msgPtr} file=${filePtr} line=${line} col=${col}`,
      );
    },
  };
}
