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

/** A runtime page: a game's sheets packed as whole blocks into one image (corpus brief 10). */
export interface AtlasPage {
  id: string;
  imageUrl: string;
  width: number;
  height: number;
}

/** Where a sheet sits: its page, and its top-left corner there in pixels. */
export interface AtlasPlacement {
  page: string;
  x: number;
  y: number;
}

export interface AtlasIndex {
  /** Every sheet, with its own image and manifest: the authoring and cache unit. */
  sheets: AtlasIndexEntry[];
  /** The pages the sheets are packed into, when the cook made them. A loader that finds them uploads the
   *  pages instead of the sheet images. */
  pages?: AtlasPage[];
  /** Each sheet's place on a page, keyed by sheet id. */
  placements?: Record<string, AtlasPlacement>;
  /** The cook's hash of every sheet's `inputsHash`: the pages are cooked again only when it changes. */
  pagesHash?: string;
}
