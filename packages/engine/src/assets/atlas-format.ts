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
  /** SHA-256 of the inputs that produced this sheet; stamped by atlas-builder, ignored by the runtime loader. */
  inputsHash?: string;
}

export interface AtlasIndexEntry {
  id: string;
  imageUrl: string;
  manifestUrl: string;
}

export interface AtlasIndex {
  sheets: AtlasIndexEntry[];
}
