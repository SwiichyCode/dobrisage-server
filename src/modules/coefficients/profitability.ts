import prisma from "../../db/prisma.js";

/**
 * Port exact de `computeMaxFocusProfit` / `findBestFocusYield` du front
 * (`src/libs/dofus/brisage.ts`) : rentabilité si on focus, au brisage, la
 * meilleure stat en une seule rune (quantité max), moins le prix de craft.
 * Gardé côté backend pour être calculable sans appel externe sur
 * `GET /items` (recherche as-you-type).
 */

/**
 * Caractéristiques non concernées par le brisage (cf. `excludeCharacteristics`
 * côté front) — exclues sans distinction du calcul de rentabilité.
 */
export const EXCLUDED_EFFECT_IDS = new Set([6, 96, 91]);

/**
 * effectId DofusDB -> slug interne (même table que côté front). Un effectId
 * absent d'ici est ignoré : pas de rune connue pour cette stat.
 */
export const EFFECT_ID_TO_SLUG: Record<number, string> = {
  111: "pa",
  128: "pm",
  116: "po",
  117: "po",
  182: "invocations",
  2990: "invocations",
  125: "vitalite",
  118: "force",
  126: "intelligence",
  123: "chance",
  119: "agilite",
  124: "sagesse",
  138: "puissance",
  115: "coups_critiques",
  753: "tacle",
  752: "fuite",
  754: "fuite",
  410: "retrait_pa",
  160: "esquive_pa",
  162: "esquive_pa",
  412: "retrait_pm",
  161: "esquive_pm",
  163: "esquive_pm",
  175: "initiative",
  178: "soins",
  176: "prospection",
  158: "pods",
  112: "dommages",
  430: "dommages_neutre",
  422: "dommages_terre",
  424: "dommages_feu",
  426: "dommages_eau",
  428: "dommages_air",
  418: "dommages_critique",
  419: "dommages_critique",
  414: "dommages_poussee",
  220: "dommages_renvoye",
  225: "dommages_pieges",
  226: "puissance_pieges",
  2812: "dommages_sort",
  2808: "dommages_armes",
  2800: "dommages_melee",
  2805: "dommages_distance",
  244: "resistances_fixe_neutre",
  214: "resistances_neutre",
  240: "resistances_fixe_terre",
  210: "resistances_terre",
  243: "resistances_fixe_feu",
  213: "resistances_feu",
  241: "resistances_fixe_eau",
  211: "resistances_eau",
  242: "resistances_fixe_air",
  212: "resistances_air",
  420: "resistances_fixe_critique",
  421: "resistances_fixe_critique",
  416: "resistances_fixe_poussee",
  417: "resistances_fixe_poussee",
  2803: "resistance_melee",
  2807: "resistance_distance",
};

/** Poids de chaque stat pour le calcul du focus (défaut 1 si absent). */
export const RUNE_WEIGHTS: Record<string, number> = {
  pa: 100,
  pm: 90,
  po: 51,
  invocations: 30,
  vitalite: 0.2,
  force: 1,
  intelligence: 1,
  chance: 1,
  agilite: 1,
  sagesse: 3,
  puissance: 2,
  coups_critiques: 10,
  tacle: 4,
  fuite: 4,
  retrait_pa: 7,
  esquive_pa: 7,
  retrait_pm: 7,
  esquive_pm: 7,
  initiative: 0.1,
  soins: 10,
  prospection: 3,
  pods: 0.25,
  dommages: 20,
  dommages_neutre: 5,
  dommages_terre: 5,
  dommages_feu: 5,
  dommages_eau: 5,
  dommages_air: 5,
  dommages_critique: 5,
  dommages_poussee: 5,
  dommages_renvoye: 10,
  dommages_pieges: 5,
  puissance_pieges: 2,
  dommages_sort: 15,
  dommages_armes: 15,
  dommages_melee: 15,
  dommages_distance: 15,
  resistances_fixe_neutre: 2,
  resistances_neutre: 6,
  resistances_fixe_terre: 2,
  resistances_terre: 6,
  resistances_fixe_feu: 2,
  resistances_feu: 6,
  resistances_fixe_eau: 2,
  resistances_eau: 6,
  resistances_fixe_air: 2,
  resistances_air: 6,
  resistances_fixe_critique: 2,
  resistances_fixe_poussee: 2,
  resistance_melee: 15,
  resistance_distance: 15,
};

/**
 * Le matching rune <-> stat se fait par le LIBELLÉ de la rune
 * (`Rune.characteristic`, ex: "Résistances Air (fixe)"), pas par un id —
 * reconstruit depuis les 53 libellés réels en base (voir historique de ce
 * fichier). Clé = libellé normalisé (sans accents/casse/`%`, parenthèses
 * aplaties en espace pour garder "fixe"/"PA"/"PM" comme mot).
 */
function normalizeRuneLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/%/g, "")
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9\s']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const RUNE_LABEL_TO_SLUG: Record<string, string> = {
  agilite: "agilite",
  chance: "chance",
  "coups critiques": "coups_critiques",
  "dommage poussee": "dommages_poussee",
  dommages: "dommages",
  "dommages air fixe": "dommages_air",
  "dommages critiques": "dommages_critique",
  "dommages distance": "dommages_distance",
  "dommages eau fixe": "dommages_eau",
  "dommages feu fixe": "dommages_feu",
  "dommages melee": "dommages_melee",
  "dommages neutre fixe": "dommages_neutre",
  "dommages pieges": "dommages_pieges",
  "dommages terre fixe": "dommages_terre",
  "dommages aux sorts": "dommages_sort",
  "dommages d'arme": "dommages_armes",
  "esquive pa": "esquive_pa",
  "esquive pm": "esquive_pm",
  force: "force",
  fuite: "fuite",
  initiative: "initiative",
  intelligence: "intelligence",
  invocation: "invocations",
  pods: "pods",
  "points d'action pa": "pa",
  "points de mouvement pm": "pm",
  portee: "po",
  prospection: "prospection",
  puissance: "puissance",
  "puissance pieges": "puissance_pieges",
  renvoi: "dommages_renvoye",
  "retrait pa": "retrait_pa",
  "retrait pm": "retrait_pm",
  "resistance poussee fixe": "resistances_fixe_poussee",
  "resistances air": "resistances_air",
  "resistances air fixe": "resistances_fixe_air",
  "resistances critiques fixe": "resistances_fixe_critique",
  "resistances distance": "resistance_distance",
  "resistances eau": "resistances_eau",
  "resistances eau fixe": "resistances_fixe_eau",
  "resistances feu": "resistances_feu",
  "resistances feu fixe": "resistances_fixe_feu",
  "resistances melee": "resistance_melee",
  "resistances neutre": "resistances_neutre",
  "resistances neutre fixe": "resistances_fixe_neutre",
  "resistances terre": "resistances_terre",
  "resistances terre fixe": "resistances_fixe_terre",
  sagesse: "sagesse",
  soins: "soins",
  tacle: "tacle",
  vitalite: "vitalite",
};

export type ProfitEffectInput = {
  from: number;
  to: number;
  effectId: number;
};

export type MaxFocusProfitResult = {
  profitability: number | null;
  revenue: number | null;
};

const NULL_RESULT: MaxFocusProfitResult = { profitability: null, revenue: null };

/**
 * Étapes 1-8 de l'algorithme front, portées telles quelles. `coefficient`
 * est en %, ex: 4000 => x40.
 */
export function computeMaxFocusProfit(
  effects: ProfitEffectInput[],
  level: number,
  coefficient: number | null,
  craftPrice: number | null,
  runePricesBySlug: Record<string, number>,
): MaxFocusProfitResult {
  if (coefficient === null) {
    return NULL_RESULT;
  }

  const candidates: { slug: string; runeWeight: number; w: number }[] = [];

  for (const effect of effects) {
    if (EXCLUDED_EFFECT_IDS.has(effect.effectId)) {
      continue;
    }

    const slug = EFFECT_ID_TO_SLUG[effect.effectId];

    if (!slug) {
      continue;
    }

    const to = effect.to > 0 ? effect.to : effect.from;

    let value = (effect.from + to) / 2;

    if (value <= 0) {
      continue;
    }

    if (slug === "pods") {
      value = value / 2.5;
    }

    const runeWeight = RUNE_WEIGHTS[slug] ?? 1;
    const w = value * runeWeight * level * 0.015 + 1;

    candidates.push({ slug, runeWeight, w });
  }

  if (candidates.length === 0) {
    return NULL_RESULT;
  }

  const totalRaw = candidates.reduce((sum, candidate) => sum + candidate.w, 0);

  let best: { revenue: number } | null = null;

  for (const candidate of candidates) {
    const price = runePricesBySlug[candidate.slug];

    if (price === undefined) {
      continue;
    }

    let total = 0.5 * totalRaw + 0.5 * candidate.w;

    total *= coefficient / 100;

    if (candidate.slug === "pods") {
      total = total / 2.5;
    }

    const runes =
      candidate.runeWeight < 1
        ? Math.floor(total)
        : Math.floor(total / candidate.runeWeight);

    const revenue = runes * price;

    if (!best || revenue > best.revenue) {
      best = { revenue };
    }
  }

  if (!best) {
    return NULL_RESULT;
  }

  return {
    profitability: craftPrice === null ? null : best.revenue - craftPrice,
    revenue: best.revenue,
  };
}

// ============================================================
// Prix de runes par slug, par serveur — cache pour éviter une
// requête DB par item lors d'une recherche as-you-type.
// ============================================================

const RUNE_PRICES_CACHE_TTL = 5 * 60 * 1000;

type RunePricesCacheEntry = {
  data: Record<string, number>;
  expiresAt: number;
};

const runePricesCache = new Map<string, RunePricesCacheEntry>();

async function loadRunePricesBySlug(
  serverName: string,
): Promise<Record<string, number>> {
  const runes = await prisma.rune.findMany({
    select: {
      characteristic: true,
      prices: {
        where: { serverName },
        select: { price: true },
        take: 1,
      },
    },
  });

  const result: Record<string, number> = {};

  for (const rune of runes) {
    const price = rune.prices[0]?.price;

    if (price === undefined) {
      continue;
    }

    const slug = RUNE_LABEL_TO_SLUG[normalizeRuneLabel(rune.characteristic)];

    if (!slug) {
      continue;
    }

    result[slug] = price;
  }

  return result;
}

export async function getRunePricesBySlug(
  serverName: string,
): Promise<Record<string, number>> {
  const cacheKey = serverName.toLowerCase();

  const cached = runePricesCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const data = await loadRunePricesBySlug(serverName);

  runePricesCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + RUNE_PRICES_CACHE_TTL,
  });

  return data;
}
