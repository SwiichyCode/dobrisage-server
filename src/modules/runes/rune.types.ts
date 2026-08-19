export interface LocalizedName {
  fr: string;
  en: string;
  es: string;
}

export interface LatestPrice {
  serverName: string;
  price: number;
  dateUpdated: string;
}

export interface Rune {
  name: LocalizedName;
  characteristicName: LocalizedName;
  _id: string;
  id: number;
  imageUrl: string;
  characteristicId: number;
  value: number;
  weight: number;
  __v: number;
  latestPrices: LatestPrice[];
}
