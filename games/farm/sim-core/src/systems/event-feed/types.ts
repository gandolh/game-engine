
export interface EventEntry {
  tick: number;
  day: number;
  text: string;
  key: string; 
  drama: number; 
  farmerId?: number | null; 
}

export interface TradeCompletedBody {
  offerId?: string;
  buyerId?: number;
  sellerId?: number;
  crop?: string;
  quantity?: number;
  pricePerUnit?: number;
}

export const EVENT_FEED_CAP = 50;
