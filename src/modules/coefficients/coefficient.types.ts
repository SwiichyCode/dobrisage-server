export type Coefficient = {
  coefficient: number;
  dateUpdated: string;
  itemId: number;
};

export type DofocusLocalizedName = {
  fr: string;
  en: string;
  es: string;
};

export type DofocusCharacteristic = {
  id: number;
  name: DofocusLocalizedName;
  from: number;
  to: number;
};

export type DofocusCoefficientEntry = {
  coefficient: number;
  lastUpdate: string;
  serverName: string;
};

export type DofocusPriceEntry = {
  price: number;
  lastUpdate: string;
  serverName: string;
};

export type DofocusItemDetail = {
  id: number;
  name: DofocusLocalizedName;
  level: number;
  imageUrl: string;
  characteristics: DofocusCharacteristic[];
  coefficients: DofocusCoefficientEntry[];
  prices: DofocusPriceEntry[];
};

export type DofocusPriceHistoryEntry = {
  price: number;
  dateUpdated: string;
};
