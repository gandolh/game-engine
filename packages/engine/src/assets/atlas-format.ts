export interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasManifest {
  id: string;
  imageUrl: string;
  width: number;
  height: number;
  frames: Record<string, AtlasFrame>;
  /**
   * SHA-256 fingerprint of the inputs that produced this sheet (asset recipe
   * files, shared sources, packing constants, encoder options, builder version).
   * Stamped by atlas-builder; tolerated (ignored) by the runtime loader.
   * Optional so that old committed manifests without this field remain valid.
   */
  inputsHash?: string;
}

/** One entry in atlas/index.json — describes a single sheet by id + URLs. */
export interface AtlasIndexEntry {
  id: string;
  imageUrl: string;
  manifestUrl: string;
}

/** The atlas/index.json file emitted by the builder. Consumed by the loader to
 *  discover all sheets without a hardcoded sheet list in the runtime. */
export interface AtlasIndex {
  sheets: AtlasIndexEntry[];
}
