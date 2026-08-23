export type ItemName = {
  fr: string;
  en: string;
  de: string;
  es: string;
  pt: string;
};

export type ItemDescription = {
  fr: string;
  en: string;
  de: string;
  es: string;
  pt: string;
};

export type ItemSlug = {
  fr: string;
  en: string;
};

export type ItemEffect = {
  from: number;
  to: number;
  characteristic: number;
  category: number;
  elementId: number;
  effectId: number;
};

export type Item = {
  id: number;
  iconId: number;
  typeId: number;
  level: number;
  name: ItemName;
  description: ItemDescription;
  slug: ItemSlug;
  img: string;
  effects: ItemEffect[];
};

export type DofusDbPaginatedResponse<T> = {
  total: number;
  limit: number;
  skip: number;
  data: T[];
};
