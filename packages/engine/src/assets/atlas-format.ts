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
