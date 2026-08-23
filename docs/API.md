# API — dofus-brisage-s

Documentation des endpoints exposés par le backend, à destination du front.

## Base URL

```
http://localhost:3000
```

Le port vient de la variable d'env `PORT` (défaut `3000`).

## CORS

Seule l'origine définie par `CORS_ORIGIN` (défaut `http://localhost:3001`) est autorisée à appeler l'API depuis un navigateur.

## Format de réponse

Toutes les réponses sont en JSON.

- Succès : `{ "success": true, ... }`
- Erreur : `{ "success": false, "error": "message" }`

Codes HTTP utilisés : `200` (succès), `400` (entrée invalide), `404` (ressource introuvable), `429` (rate limit dépassé), `500` (erreur serveur).

---

## Health

### `GET /health`

Vérifie que le serveur répond.

**Réponse `200`**

```json
{ "status": "ok" }
```

---

## Runes

Une **rune** représente une caractéristique extractible d'un équipement (Force, Vitalité, etc.), avec un prix par serveur.

Les runes et leurs prix sont importés automatiquement depuis l'API Dofocus **toutes les heures** (cron interne). Un prix saisi manuellement par un utilisateur (voir `PUT /runes/:id/price`) reste prioritaire sur cet import pendant **3 jours** — passé ce délai, le cron peut de nouveau écraser la valeur avec celle de Dofocus si elle diffère.

### `GET /runes`

Liste toutes les runes avec leurs prix sur tous les serveurs.

**Query params**
| Param | Type | Requis | Description |
|---|---|---|---|
| `serverName` | string | non | Si fourni, ne garde que le prix de ce serveur pour chaque rune (`prices` devient un tableau à 0 ou 1 élément), et exclut les runes sans prix sur ce serveur. |

**Réponse `200`**

```json
{
  "success": true,
  "count": 53,
  "data": [
    {
      "id": 1524,
      "name": "Rune Age",
      "characteristicId": 14,
      "characteristic": "Agilité",
      "imageUrl": "https://api.dofusdb.fr/img/items/78046.png",
      "value": 1,
      "weight": 1,
      "prices": [
        { "serverName": "Brial", "price": 90, "dateUpdated": "2026-08-17T20:12:53.362Z" },
        { "serverName": "Rafal", "price": 79, "dateUpdated": "2026-08-16T10:53:46.882Z" }
        ...
      ]
    }
  ]
}
```

**Erreurs** : `400` si `serverName` est fourni mais n'est pas une chaîne.

---

### `PUT /runes/:id/price`

Saisie manuelle du prix d'une rune sur un serveur donné (pas de compte utilisateur requis).

**Params**
| Param | Type | Description |
|---|---|---|
| `id` | number | id de la rune (`Rune.id`) |

**Body**

```json
{
  "serverName": "Rafal",
  "price": 85
}
```

- `serverName` : string non vide, requis.
- `price` : entier positif (`> 0`), requis.

**Réponse `200`**

```json
{
  "success": true,
  "data": {
    "id": 412,
    "runeId": 1524,
    "serverName": "Rafal",
    "price": 85,
    "dateUpdated": "2026-08-18T14:02:11.000Z",
    "source": "USER"
  }
}
```

**Erreurs**

- `400` : `serverName` manquant/vide, ou `price` invalide (non entier, ≤ 0).
- `404` : la rune `id` n'existe pas.

---

### `GET /runes/import`

Déclenche manuellement un import complet des runes + prix depuis Dofocus (le même job que le cron horaire). Utile pour forcer un rafraîchissement immédiat.

**Rate limit** : 5 requêtes / 15 minutes (partagé avec `POST /items/import`, protège contre le ban de l'API externe).

**Réponse `200`**

```json
{
  "success": true,
  "imported": { "runes": 53, "prices": 689 }
}
```

**Erreurs**

- `429` : rate limit dépassé.
- `500` : échec de l'import (API Dofocus down, etc.) — `error` contient le message.

---

## Items

Un **item** est un équipement (catalogue DofusDB), avec ses `effects` (liste des plages de caractéristiques données par l'objet).

### `GET /items?q=`

Recherche d'items par nom (pour une barre de recherche côté front — sélectionner un item pour ensuite ouvrir sa page coefficient via `GET /coefficients/:itemId/:serverName`).

Si `serverName` est fourni, chaque résultat inclut en plus, pour ce serveur : `coefficient`, `updatedAt` et `profitability`/`revenue` — tous lus/calculés depuis ce qui est déjà en base (aucun appel externe à la recherche, calcul en O(nb_effets) par item). Sans `serverName`, ces quatre champs valent toujours `null`.

- `updatedAt` : date la plus récente entre `coefficientUpdatedAt` et `craftPriceUpdatedAt` pour cet item+serveur (`ItemMarketData`). `null` si aucun des deux n'est renseigné.
- `profitability` : rentabilité si on casse l'item en ciblant, au brisage, la **meilleure stat en focus** (une seule rune, quantité max) — `(runes de cette stat × son prix) − craftPrice`. Port exact du calcul déjà fait côté front (`computeMaxFocusProfit`). `null` si `coefficient` est `null`, si aucun effet de l'item n'a de rune/prix connu sur ce serveur, ou si `craftPrice` est `null` (dans ce dernier cas, voir `revenue`).
- `revenue` : valeur brute en runes-or de la meilleure focus, **avant** déduction du `craftPrice` — permet au front d'afficher un chiffre même quand `craftPrice` n'est pas encore renseigné (`profitability` vaut alors `null` mais `revenue` non). `null` dans les mêmes cas que `profitability` sauf le cas "craftPrice manquant".

**Query params**
| Param | Type | Requis | Description |
|---|---|---|---|
| `q` | string | oui | terme recherché, sous-chaîne insensible à la casse **et aux accents** (recherche sur `Item.slug`, une version normalisée de `name` déjà minuscule/sans accents produite par DofusDB — pas d'extension Postgres `unaccent` requise) |
| `serverName` | string | non | si fourni, inclut coefficient/updatedAt/profitability/revenue de ce serveur pour chaque résultat |
| `limit` | number (entier, 1 à 50) | non (défaut `20`) | nombre max de résultats |

**Réponse `200`**
```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "id": 789,
      "name": "Ceinture du Kobeer",
      "level": 1,
      "img": "https://api.dofusdb.fr/img/items/10009.png",
      "typeId": 10,
      "coefficient": 100,
      "updatedAt": "2026-08-18T15:12:00.000Z",
      "profitability": 850000,
      "revenue": 1200000
    }
  ]
}
```

**Erreurs** : `400` si `q` est manquant/vide, si `limit` est invalide (non entier, hors 1-50), ou si `serverName` est fourni mais n'est pas une chaîne.

---

### `GET /items/:id`

Récupère un item par son id.

**Réponse `200`**

```json
{
  "success": true,
  "data": {
    "id": 968,
    "iconId": 10010,
    "typeId": 10,
    "level": 50,
    "name": "Ceinture Fulgurante",
    "description": "Cette magnifique ceinture augmente...",
    "slug": "ceinture-fulgurante",
    "img": "https://api.dofusdb.fr/img/items/10010.png",
    "effects": [
      {
        "from": 1,
        "to": 30,
        "characteristic": 11,
        "category": 0,
        "elementId": -1,
        "effectId": 125
      },
      {
        "from": 1,
        "to": 3,
        "characteristic": 16,
        "category": 0,
        "elementId": 5,
        "effectId": 112
      }
    ]
  }
}
```

`effects[].characteristic` et `effects[].elementId` sont des ids internes DofusDB (pas encore résolus en libellés côté backend).

**Erreurs**

- `400` : `id` n'est pas un nombre.
- `404` : item introuvable.

---

### `POST /items/import`

Synchronise le catalogue d'items complet depuis DofusDB (upsert — ne duplique pas, met à jour les items existants). Opération lourde (peut prendre plusieurs minutes selon le nombre d'items).

**Rate limit** : 5 requêtes / 15 minutes (partagé avec `GET /runes/import`).

**Réponse `200`**

```json
{ "success": true, "message": "Items import completed" }
```

**Erreurs**

- `429` : rate limit dépassé.
- `500` : échec de la synchronisation.

---

## Coefficients

Le **coefficient** d'un item représente son rendement en runes quand on le casse (dismantle), et est associé à un **prix de craft** — les deux sont saisis librement par la communauté, par item et par serveur (comme sur Dofocus), sans compte utilisateur requis.

Les deux valeurs vivent dans **une seule table** côté backend (`ItemMarketData`, une ligne par item+serveur) — c'est la source de vérité que le front consomme, `Item` (nom/niveau/image/effects) restant à part puisque cette donnée ne dépend pas du serveur. Coefficient et prix de craft gardent chacun leur propre suivi de fraîcheur/source sur cette même ligne (`coefficientSource`/`coefficientUpdatedAt` vs `craftPriceSource`/`craftPriceUpdatedAt`), car ils n'ont pas la même origine chez Dofocus et peuvent exister l'un sans l'autre :

- **Coefficient** : `https://dofocus.fr/api/coefficients/by-server/:serverName` renvoie en un seul appel le coefficient de **tout le catalogue** pour un serveur donné. Une douzaine de serveurs = une douzaine d'appels pour couvrir l'intégralité des items. Du coup, **cron toutes les heures, balayage complet** de tous les serveurs connus (déduits des `serverName` déjà présents dans `RunePrice`) — exactement la même logique que les runes. Jamais de fetch à la demande pour ce champ.
- **Prix de craft** : pas d'équivalent bulk chez Dofocus pour ce champ, uniquement accessible via `/items/:id?lang=fr` (un item à la fois, mais qui renvoie quand même tous les serveurs de cet item en un coup). Reste donc en fetch à la demande au premier `GET` sur une paire (item, serveur) sans prix de craft connu, puis rafraîchi toutes les heures **uniquement pour les items qui en ont déjà un** — un balayage du catalogue entier coûterait un appel par item, ce qui n'a pas de sens pour un site tiers.

Dans les deux cas : une saisie utilisateur (`source: USER`) reste prioritaire sur le rafraîchissement automatique pendant **3 jours** (même logique que les runes). Une saisie manuelle (`PUT`, voir plus bas) écrit toujours les deux champs sur la même ligne en une seule requête.

Le calcul de rentabilité (coefficient × prix des runes − prix de craft) est fait **côté front** ; le backend fournit seulement les données brutes.

### `GET /coefficients/import`

Déclenche manuellement le balayage complet des coefficients (le même job que le cron horaire) : un appel Dofocus par serveur connu, upsert de tout le catalogue. Les items renvoyés par Dofocus mais absents de notre catalogue (`Item`) sont ignorés proprement plutôt que de faire échouer l'import (voir `skipped` dans la réponse) — pense à lancer `POST /items/import` si ce nombre est élevé.

Opération lente (une douzaine d'appels séquentiels vers Dofocus, peut prendre 30s-1min).

**Rate limit** : 5 requêtes / 15 minutes (même limiteur que `GET /runes/import` et `POST /items/import`).

**Réponse `200`**
```json
{
  "success": true,
  "imported": { "servers": 13, "coefficients": 37011, "skipped": 5031 }
}
```

**Erreurs**
- `429` : rate limit dépassé.
- `500` : échec de l'import — `error` contient le message.

---

### `GET /coefficients/craft-prices/refresh`

Déclenche manuellement le rafraîchissement des prix de craft (le même job que le cron horaire) : un appel Dofocus par item déjà connu (ceux qui ont déjà un `craftPrice` en base), pas le catalogue entier. Si aucun item n'a encore été consulté, `refreshed` et `failed` valent `0` — c'est normal, rien à rafraîchir.

**Rate limit** : 5 requêtes / 15 minutes (même limiteur que les autres imports).

**Réponse `200`**
```json
{
  "success": true,
  "refreshed": { "refreshed": 12, "failed": 0 }
}
```

**Erreurs**
- `429` : rate limit dépassé.
- `500` : échec du refresh — `error` contient le message.

---

### `GET /coefficients/price-history/refresh`

Déclenche manuellement le rafraîchissement de l'historique des prix (le même job que le cron horaire) : un appel Dofocus par couple (item, serveur) déjà connu (ceux qui ont déjà au moins un point d'historique en base), pas le catalogue entier. Si aucune paire n'a encore été consultée, `refreshed` et `failed` valent `0`.

**Rate limit** : 5 requêtes / 15 minutes (même limiteur que les autres imports).

**Réponse `200`**
```json
{
  "success": true,
  "refreshed": { "refreshed": 8, "failed": 0 }
}
```

**Erreurs**
- `429` : rate limit dépassé.
- `500` : échec du refresh — `error` contient le message.

---

### `GET /coefficients/:itemId/:serverName/price-history`

Récupère l'historique des prix d'un item sur un serveur donné (miroir en lecture seule de `https://dofocus.fr/api/items/:id/prices/history?serverName=X`, un point = un relevé de prix communautaire à sa date d'origine). Contrairement au prix de craft (`ItemMarketData.craftPrice`, une seule valeur éditable), il n'y a pas de saisie manuelle possible sur cet historique.

- Si rien n'est encore en base pour cette paire (item, serveur), fetch à la demande chez Dofocus puis stockage — même logique que le prix de craft.
- Les points déjà stockés ne sont jamais réécrits (un point d'historique Dofocus est immuable), le cron horaire ne fait qu'ajouter les nouveaux points apparus depuis.

**Params**
| Param | Type | Description |
|---|---|---|
| `itemId` | number | id de l'item (`Item.id`) |
| `serverName` | string | nom du serveur |

**Réponse `200`**

```json
{
  "success": true,
  "count": 3,
  "data": [
    { "id": 1, "itemId": 8876, "serverName": "Rafal", "price": 12000000, "dateUpdated": "2026-08-01T18:15:23.347Z" },
    { "id": 2, "itemId": 8876, "serverName": "Rafal", "price": 13500000, "dateUpdated": "2026-08-10T09:39:46.619Z" },
    { "id": 3, "itemId": 8876, "serverName": "Rafal", "price": 14000000, "dateUpdated": "2026-08-18T15:12:00.000Z" }
  ]
}
```

Un item sans historique connu renvoie `data: []` (pas une erreur) si Dofocus n'a rien à offrir pour ce couple.

**Erreurs**
- `400` : `itemId` n'est pas un nombre, ou `serverName` manquant/vide.
- `404` : l'item `itemId` n'existe pas dans notre catalogue.
- `500` : échec de la récupération auprès de Dofocus.

---

### `GET /coefficients/:itemId/:serverName`

Récupère les données nécessaires à l'affichage de la page coefficient pour un item sur un serveur donné : infos item + coefficient + prix de craft, en un seul appel.

- Le coefficient vient uniquement de ce qui est déjà en base (rempli par le cron horaire) — pas de fetch à la demande pour ce champ.
- Le prix de craft est fetché à la demande chez Dofocus si absent en base, puis stocké.

Si rien n'est disponible pour l'un ou l'autre, sa valeur est `null` — c'est à l'utilisateur d'être le premier à la renseigner via `PUT`.

**Params**
| Param | Type | Description |
|---|---|---|
| `itemId` | number | id de l'item (`Item.id`) |
| `serverName` | string | nom du serveur |

**Réponse `200`**

```json
{
  "success": true,
  "data": {
    "id": 8876,
    "name": "Voile d'encre",
    "level": 191,
    "img": "https://api.dofusdb.fr/img/items/17147.png",
    "effects": [
      { "from": 251, "to": 350, "characteristic": 11, "category": 0, "elementId": -1, "effectId": 100 }
    ],
    "serverName": "Rafal",
    "coefficient": 4000,
    "coefficientUpdatedAt": "2026-08-18T15:00:00.000Z",
    "craftPrice": 14000000,
    "craftPriceUpdatedAt": "2026-08-18T15:12:00.000Z"
  }
}
```

**Erreurs**
- `400` : `itemId` n'est pas un nombre, ou `serverName` manquant/vide.
- `404` : l'item `itemId` n'existe pas dans notre catalogue (voir `POST /items/import`).
- `500` : échec de la récupération du prix de craft (Dofocus down au moment du premier fetch, etc.).

---

### `PUT /coefficients/:itemId/:serverName`

Saisie manuelle du coefficient et du prix de craft d'un item sur un serveur (pas de compte utilisateur requis, les deux valeurs dans le même appel). Remplace toute valeur existante, qu'elle vienne de Dofocus ou d'un utilisateur précédent.

**Params** : identiques à `GET /coefficients/:itemId/:serverName`.

**Body**
```json
{
  "coefficient": 4200,
  "craftPrice": 13500000
}
```
- `coefficient` : nombre ≥ 0, requis.
- `craftPrice` : entier ≥ 0, requis.

**Réponse `200`**
```json
{
  "success": true,
  "data": {
    "id": 17,
    "itemId": 8876,
    "serverName": "Rafal",
    "coefficient": 4200,
    "coefficientSource": "USER",
    "coefficientUpdatedAt": "2026-08-18T15:20:00.000Z",
    "craftPrice": 13500000,
    "craftPriceSource": "USER",
    "craftPriceUpdatedAt": "2026-08-18T15:20:00.000Z"
  }
}
```

**Erreurs**
- `400` : `itemId`/`serverName` invalides, ou `coefficient`/`craftPrice` invalides.
- `404` : l'item `itemId` n'existe pas.

---

### `GET /coefficients/interesting/:serverName`

Liste les items "intéressants à casser" (dismantle) sur un serveur, en croisant les coefficients Dofocus (données live, non stockées chez nous) avec le catalogue d'items en base. Pensé pour la découverte/le tri (parcourir large), pas pour l'édition — endpoint indépendant de `GET/PUT /coefficients/:itemId/:serverName` ci-dessus.

**Params**
| Param | Type | Description |
|---|---|---|
| `serverName` | string | nom du serveur |

**Query params**
| Param | Type | Défaut | Description |
|---|---|---|---|
| `minCoefficient` | number | — | coefficient minimum |
| `minLevel` | number | — | niveau d'item minimum |
| `maxLevel` | number | — | niveau d'item maximum |
| `typeId` | number ou liste séparée par virgules | — | filtre par type(s) d'équipement |
| `maxAgeDays` | number | `7` | ne garde que les coefficients vieux d'au moins X jours (doit être `> 0`) |
| `page` | number (entier ≥ 1) | `1` | pagination |
| `limit` | number (entier, 1 à 100) | `30` | taille de page |

**Réponse `200`**

```json
{
  "success": true,
  "count": 30,
  "data": [
    {
      "coefficient": {
        "coefficient": 850,
        "dateUpdated": "2026-08-01T00:00:00.000Z",
        "itemId": 8876
      },
      "item": {
        "id": 8876,
        "name": "Voile d'encre",
        "level": 191,
        "img": "...",
        "typeId": 17
      }
    }
  ],
  "pagination": { "page": 1, "limit": 30, "total": 214, "totalPages": 8 }
}
```

**Erreurs** : `400` sur tout paramètre invalide (`serverName` manquant, ou l'un des params numériques hors bornes/non numérique).

---

## Feedback

Une **feedback** est une remontée libre (bug ou suggestion) envoyée depuis `/chat-analyzer`, consultable dans `/admin/feedback`. Contrairement aux favoris/trades, ces endpoints ne nécessitent **aucune authentification** — `pseudo` est un simple texte optionnel, pas lié à un compte Clerk (`null`/omis = envoyé en anonyme).

⚠️ **Point d'attention** : `GET /feedback` n'est pas protégé côté backend (comme le reste de l'API), mais expose des messages potentiellement sensibles à qui devine l'URL — la seule protection actuelle est que `/admin/feedback` n'est pas linké côté front et est gaté par le rôle Clerk.

### `POST /feedback`

**Body**
```json
{
  "type": "bug",
  "message": "Le drag and drop des screenshots ne fonctionne pas sur Firefox.",
  "pseudo": "Iop-du-13",
  "locale": "fr"
}
```
- `type` : `"bug"` ou `"suggestion"`, requis.
- `message` : string non vide, requis, 2000 caractères max.
- `locale` : `"fr"`, `"en"` ou `"es"`, requis.
- `pseudo` : string, optionnel — omis ou `null` si envoyé en anonyme.

**Réponse `201`**
```json
{
  "success": true,
  "data": {
    "id": 12,
    "type": "bug",
    "message": "Le drag and drop des screenshots ne fonctionne pas sur Firefox.",
    "pseudo": "Iop-du-13",
    "locale": "fr",
    "createdAt": "2026-08-23T10:00:00.000Z"
  }
}
```

**Erreurs**
- `400` : `type` absent ou hors `["bug", "suggestion"]`, `message` absent/vide/trop long (> 2000 caractères), `locale` absent ou hors `["fr", "en", "es"]`, ou `pseudo` d'un type autre que string.

### `GET /feedback`

Liste tous les messages, du plus récent au plus ancien. Pas de pagination ni de filtre `type`/`locale` pour l'instant (volume attendu faible).

**Réponse `200`**
```json
{
  "success": true,
  "count": 2,
  "data": [
    { "id": 12, "type": "bug", "message": "...", "pseudo": "Iop-du-13", "locale": "fr", "createdAt": "2026-08-23T10:00:00.000Z" },
    { "id": 11, "type": "suggestion", "message": "...", "pseudo": null, "locale": "en", "createdAt": "2026-08-22T18:30:00.000Z" }
  ]
}
```

---

## Favoris

Un **favori** est un item marqué comme intéressant par un utilisateur connecté, pour un serveur donné (le coefficient/prix de craft dépendant du serveur). Contrairement au reste de l'API, ces endpoints nécessitent une authentification : le front doit envoyer le token de session Clerk dans le header `Authorization: Bearer <token>`. Aucun profil utilisateur n'est stocké en base côté backend — Clerk reste la seule source de vérité pour l'identité, le backend ne retient que l'id opaque (`clerkUserId`) fourni par le token.

Un favori porte deux jeux de valeurs distincts, à ne pas confondre :
- `coefficient` / `craftPrice` : donnée **communautaire**, partagée entre tous les utilisateurs pour ce couple item/serveur (lue depuis `ItemMarketData`, alimentée par l'import Dofocus + les soumissions communautaires).
- `personalCoefficient` / `personalCraftPrice` : donnée **privée** à l'utilisateur connecté, propre à ce favori (ex: son propre prix de craft négocié). `null` tant qu'il ne l'a pas renseignée.
- `personalFocusSlug` / `personalFocusEnabled` : donnée **privée**, la rune "focusée" au brisage pour ce favori (slug de caractéristique, ex. `"vitalite"`) et si ce focus est actif. `personalFocusSlug` est `null` tant que l'utilisateur n'a rien choisi (le front retombe sur son calcul "meilleure rune" par défaut) ; `personalFocusEnabled` vaut `true` par défaut.

Le backend ne fait **aucun fallback automatique** entre les deux — il renvoie toujours les deux jeux de valeurs, chacun pouvant être `null` indépendamment. C'est au front de décider quoi afficher en priorité (ex: afficher `personalCraftPrice` s'il n'est pas `null`, sinon `craftPrice`).

**Erreur commune aux quatre endpoints** : `401` si le header `Authorization` est absent ou le token invalide/expiré — `{ "success": false, "error": "Authentication required" }`.

### `GET /favorites`

Liste les favoris de l'utilisateur connecté, avec l'item, son coefficient/prix de craft communautaires, et ses valeurs personnelles sur le serveur du favori.

**Réponse `200`**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "item": {
        "id": 8876,
        "iconId": 17147,
        "typeId": 17,
        "level": 191,
        "name": "Voile d'encre",
        "description": "...",
        "slug": "voile-d-encre",
        "img": "https://api.dofusdb.fr/img/items/17147.png",
        "effects": [ "..." ]
      },
      "serverName": "Rafal",
      "createdAt": "2026-08-18T15:20:00.000Z",
      "updatedAt": "2026-08-18T15:20:00.000Z",
      "coefficient": 4200,
      "craftPrice": 13500000,
      "personalCoefficient": null,
      "personalCoefficientUpdatedAt": null,
      "personalCraftPrice": 12800000,
      "personalFocusSlug": "vitalite",
      "personalFocusEnabled": true
    }
  ]
}
```

`createdAt` (date d'ajout aux favoris) et `updatedAt` (dernière modification de n'importe quel champ du favori) sont tous les deux renvoyés par `GET /favorites`, pas seulement par `POST`/`PATCH`.

`personalCoefficientUpdatedAt` est propre au favori (pas une donnée communautaire) : il trace la dernière fois que `personalCoefficient` a été renseigné/modifié par l'utilisateur via `PATCH`, indépendamment des autres champs. `null` tant que `personalCoefficient` n'a jamais été renseigné, remis à `null` si l'utilisateur efface sa valeur personnelle (`personalCoefficient: null` en `PATCH`).

### `POST /favorites`

Ajoute un item aux favoris de l'utilisateur connecté (idempotent : ajouter un favori déjà existant ne crée pas de doublon). Ne prend pas de valeurs personnelles à la création — utiliser `PATCH /favorites/:itemId` ensuite pour les renseigner.

**Body**
```json
{
  "itemId": 8876,
  "serverName": "Rafal"
}
```
- `itemId` : entier, requis.
- `serverName` : string non vide, requis.

**Réponse `201`**
```json
{
  "success": true,
  "data": {
    "id": 5,
    "clerkUserId": "user_2abc...",
    "itemId": 8876,
    "serverName": "Rafal",
    "createdAt": "2026-08-18T15:20:00.000Z",
    "updatedAt": "2026-08-18T15:20:00.000Z",
    "personalCoefficient": null,
    "personalCoefficientUpdatedAt": null,
    "personalCraftPrice": null,
    "personalFocusSlug": null,
    "personalFocusEnabled": true
  }
}
```

**Erreurs**
- `400` : `itemId` invalide, ou `serverName` manquant/vide.
- `404` : l'item `itemId` n'existe pas dans le catalogue.

### `PATCH /favorites/:itemId`

Renseigne ou met à jour le coefficient, le prix de craft et/ou la rune focus **personnels** d'un favori existant. Au moins un des quatre champs `personal*` doit être fourni ; les autres restent inchangés s'ils sont omis. Envoyer `null` explicitement efface une valeur déjà renseignée (`personalFocusEnabled` étant un booléen non nullable, il n'y a rien à effacer pour lui : envoyer `true`/`false`).

**Params**
| Param | Type | Description |
|---|---|---|
| `itemId` | number | id de l'item (`Item.id`) |

**Body**
```json
{
  "serverName": "Rafal",
  "personalCoefficient": 4300,
  "personalCraftPrice": 12800000,
  "personalFocusSlug": "vitalite",
  "personalFocusEnabled": true
}
```
- `serverName` : string non vide, requis (identifie le favori avec `itemId`).
- `personalCoefficient` : number ou `null`, optionnel.
- `personalCraftPrice` : entier ou `null`, optionnel.
- `personalFocusSlug` : string ou `null`, optionnel — pas de vérification contre un catalogue de slugs connus côté backend.
- `personalFocusEnabled` : booléen, optionnel.

**Réponse `200`**
```json
{
  "success": true,
  "data": {
    "id": 5,
    "clerkUserId": "user_2abc...",
    "itemId": 8876,
    "serverName": "Rafal",
    "createdAt": "2026-08-18T15:20:00.000Z",
    "updatedAt": "2026-08-19T09:05:00.000Z",
    "personalCoefficient": 4300,
    "personalCoefficientUpdatedAt": "2026-08-19T09:05:00.000Z",
    "personalCraftPrice": 12800000,
    "personalFocusSlug": "vitalite",
    "personalFocusEnabled": true
  }
}
```

**Erreurs**
- `400` : `itemId` invalide, `serverName` manquant/vide, l'un des quatre champs `personal*` d'un type invalide, ou aucun d'entre eux fourni.
- `404` : aucun favori correspondant pour cet utilisateur (item pas encore ajouté aux favoris sur ce serveur).

### `DELETE /favorites/:itemId?serverName=`

Retire un item des favoris de l'utilisateur connecté.

**Params**
| Param | Type | Description |
|---|---|---|
| `itemId` | number | id de l'item (`Item.id`) |

**Query params**
| Param | Type | Requis | Description |
|---|---|---|---|
| `serverName` | string | oui | serveur du favori à retirer |

**Réponse `200`**
```json
{ "success": true }
```

**Erreurs**
- `400` : `itemId` invalide, ou `serverName` manquant/vide.
- `404` : aucun favori correspondant pour cet utilisateur.

Supprimer un favori supprime aussi son historique de coefficient personnel (`PersonalCoefficientHistory`) — l'historique n'a de sens qu'attaché à un favori actif.

### `GET /favorites/:itemId/history?serverName=`

Historique des valeurs successives de `personalCoefficient` pour ce favori, trié par `dateUpdated` croissant (ordre chronologique, prêt pour un tracé de courbe sans retri côté front). Un point est ajouté à chaque `PATCH /favorites/:itemId` qui change `personalCoefficient` vers une valeur non `null`.

**Params**
| Param | Type | Description |
|---|---|---|
| `itemId` | number (path) | id de l'item |
| `serverName` | string (query, requis) | serveur du favori — même logique que `DELETE /favorites/:itemId` |

**Réponse `200`**
```json
{
  "success": true,
  "count": 3,
  "data": [
    { "coefficient": 3800, "dateUpdated": "2026-07-01T00:00:00.000Z" },
    { "coefficient": 4000, "dateUpdated": "2026-07-20T10:00:00.000Z" },
    { "coefficient": 4200, "dateUpdated": "2026-08-18T15:20:00.000Z" }
  ]
}
```

`data: []` (pas une erreur) si le favori existe mais que `personalCoefficient` n'a encore jamais été renseigné.

**Erreurs**
- `400` : `itemId` invalide, ou `serverName` manquant/vide.
- `404` : aucun favori correspondant pour cet utilisateur.

---

## Achats/Reventes

Un **trade** est une entrée du journal personnel achat/craft → revente d'un utilisateur connecté, pour un item et un serveur donnés. Contrairement aux favoris (une seule entrée par item/serveur), un même item/serveur peut avoir **plusieurs trades successifs** : chaque trade représente une opération distincte (une session de craft/revente), que l'utilisateur remplit progressivement (`craftPrice`, puis `sellPrice`, puis `sold`) jusqu'à la clôturer. Comme pour `/favorites`, ces endpoints nécessitent le header `Authorization: Bearer <token>` (Clerk) et ne stockent que l'id opaque `clerkUserId`.

**Erreur commune aux quatre endpoints** : `401` si le header `Authorization` est absent ou le token invalide/expiré — `{ "success": false, "error": "Authentication required" }`.

### `GET /trades`

Liste tous les trades de l'utilisateur connecté (tous serveurs et tous items confondus), du plus récent au plus ancien.

**Réponse `200`**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "id": 12,
      "clerkUserId": "user_2abc...",
      "itemId": 8876,
      "serverName": "Rafal",
      "craftPrice": 13500000,
      "sellPrice": 15000000,
      "sold": true,
      "createdAt": "2026-08-18T15:20:00.000Z",
      "updatedAt": "2026-08-19T09:05:00.000Z"
    }
  ]
}
```

### `POST /trades`

Crée un nouveau trade pour l'utilisateur connecté. `craftPrice`/`sellPrice` sont optionnels à la création — l'utilisateur peut les renseigner ensuite via `PATCH`.

**Body**
```json
{
  "itemId": 8876,
  "serverName": "Rafal",
  "craftPrice": 13500000,
  "sellPrice": 15000000
}
```
- `itemId` : entier, requis.
- `serverName` : string non vide, requis.
- `craftPrice` / `sellPrice` : entier ≥ 0, optionnels.

**Réponse `201`**
```json
{
  "success": true,
  "data": {
    "id": 12,
    "clerkUserId": "user_2abc...",
    "itemId": 8876,
    "serverName": "Rafal",
    "craftPrice": 13500000,
    "sellPrice": 15000000,
    "sold": false,
    "createdAt": "2026-08-18T15:20:00.000Z",
    "updatedAt": "2026-08-18T15:20:00.000Z"
  }
}
```

**Erreurs**
- `400` : `itemId` invalide, `serverName` manquant/vide, ou `craftPrice`/`sellPrice` invalide (non entier ou négatif).
- `404` : l'item `itemId` n'existe pas dans le catalogue.

### `PATCH /trades/:id`

Met à jour un trade existant appartenant à l'utilisateur connecté — seuls les champs présents dans le body sont modifiés. Sert à renseigner `craftPrice`, `sellPrice`, et basculer `sold` indépendamment, au fil de l'avancement de l'opération.

**Params**
| Param | Type | Description |
|---|---|---|
| `id` | number | id du trade (`Trade.id`) |

**Body** (tous les champs optionnels, au moins un requis)
```json
{
  "craftPrice": 13500000,
  "sellPrice": 15000000,
  "sold": true
}
```

**Réponse `200`**
```json
{
  "success": true,
  "data": {
    "id": 12,
    "clerkUserId": "user_2abc...",
    "itemId": 8876,
    "serverName": "Rafal",
    "craftPrice": 13500000,
    "sellPrice": 15000000,
    "sold": true,
    "createdAt": "2026-08-18T15:20:00.000Z",
    "updatedAt": "2026-08-19T09:05:00.000Z"
  }
}
```

**Erreurs**
- `400` : `id` invalide, `craftPrice`/`sellPrice`/`sold` invalide, ou aucun champ fourni.
- `404` : aucun trade correspondant pour cet utilisateur (déjà supprimé, jamais créé, ou appartient à un autre utilisateur).

### `DELETE /trades/:id`

Supprime un trade appartenant à l'utilisateur connecté.

**Params**
| Param | Type | Description |
|---|---|---|
| `id` | number | id du trade (`Trade.id`) |

**Réponse `200`**
```json
{ "success": true }
```

**Erreurs**
- `400` : `id` invalide.
- `404` : aucun trade correspondant pour cet utilisateur.

---

## Suivis de scans

Un **suivi de scan** (`ScanSeries`) regroupe, sous un titre libre choisi par l'utilisateur (ex: "Craft Bouée", "Clé Donjon Kimbo"), plusieurs scans `/chat-analyzer` enregistrés dans le temps pour la même dépense récurrente. Chaque scan enregistré devient une **itération** (`ScanEntry`) : un instantané figé du résultat déjà calculé côté front (`computeTotalSpent`, `aggregatePurchasesByItem` → `ItemSummary[]`, voir `docs/FRONT_CHAT_ANALYZER.md`), stocké tel quel — `items` est un JSON libre, jamais résolu au catalogue `Item`, et il n'y a ni `serverName` ni lien vers `/trades`. Comme pour `/favorites`, `/trades` et `/rune-prices`, ces endpoints nécessitent le header `Authorization: Bearer <token>` (Clerk) et ne stockent que l'id opaque `clerkUserId`.

Pas de `PATCH` sur un suivi ou une itération, et pas de fusion/renommage pour cette première version — un titre mal orthographié se corrige en supprimant/recréant le suivi.

**Erreur commune aux quatre endpoints** : `401` si le header `Authorization` est absent ou le token invalide/expiré — `{ "success": false, "error": "Authentication required" }`.

### `GET /scan-series`

Liste tous les suivis de l'utilisateur connecté, du plus récemment créé au plus ancien, avec leurs itérations imbriquées triées par ordre chronologique croissant (prêt pour un affichage "itération 1 → 2 → 3" sans retri côté front). Le delta de `totalSpent` entre itérations se calcule côté front.

**Réponse `200`**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "id": 3,
      "clerkUserId": "user_2abc...",
      "title": "Craft Bouée",
      "createdAt": "2026-08-22T10:00:00.000Z",
      "entries": [
        { "id": 5, "seriesId": 3, "totalSpent": 245000, "items": [ /* ItemSummary[] */ ], "createdAt": "2026-08-22T10:00:00.000Z" },
        { "id": 9, "seriesId": 3, "totalSpent": 268000, "items": [ /* ItemSummary[] */ ], "createdAt": "2026-08-25T09:00:00.000Z" }
      ]
    }
  ]
}
```

### `POST /scan-series`

Crée un nouveau suivi et sa première itération en une seule requête — un suivi n'existe jamais sans au moins une itération.

**Body**
```json
{
  "title": "Craft Bouée",
  "totalSpent": 245000,
  "items": [
    { "itemName": "Bouée", "quantity": 12, "transactionCount": 3, "totalSpent": 84000, "averageUnitPrice": 7000, "minUnitPrice": 6500, "maxUnitPrice": 7500 }
  ]
}
```
- `title` : string non vide, requis.
- `totalSpent` : entier ≥ 0, requis.
- `items` : tableau non vide d'objets avec au moins `itemName` (string non vide), requis.

**Réponse `201`**
```json
{
  "success": true,
  "data": {
    "id": 3,
    "clerkUserId": "user_2abc...",
    "title": "Craft Bouée",
    "createdAt": "2026-08-22T10:00:00.000Z",
    "entries": [
      { "id": 5, "seriesId": 3, "totalSpent": 245000, "items": [ /* ... */ ], "createdAt": "2026-08-22T10:00:00.000Z" }
    ]
  }
}
```

**Erreurs**
- `400` : `title` absent/vide, `totalSpent` non numérique/négatif, ou `items` absent/vide/mal formé.

### `POST /scan-series/:id/entries`

Ajoute une nouvelle itération à un suivi existant appartenant à l'utilisateur connecté.

**Params**
| Param | Type | Description |
|---|---|---|
| `id` | number | id du suivi (`ScanSeries.id`) |

**Body**
```json
{
  "totalSpent": 268000,
  "items": [ /* ItemSummary[] */ ]
}
```

**Réponse `201`**
```json
{
  "success": true,
  "data": { "id": 9, "seriesId": 3, "totalSpent": 268000, "items": [ /* ... */ ], "createdAt": "2026-08-25T09:00:00.000Z" }
}
```

**Erreurs**
- `400` : `totalSpent` non numérique/négatif, ou `items` absent/vide/mal formé.
- `404` : aucun suivi correspondant pour cet utilisateur (déjà supprimé, jamais créé, ou appartient à un autre utilisateur) — même règle que `PATCH /trades/:id`.

### `DELETE /scan-series/:id`

Supprime un suivi et toutes ses itérations (cascade en base).

**Params**
| Param | Type | Description |
|---|---|---|
| `id` | number | id du suivi (`ScanSeries.id`) |

**Réponse `200`**
```json
{ "success": true }
```

**Erreurs**
- `404` : aucun suivi correspondant pour cet utilisateur.

---

## Prix de runes personnels

Un **prix de rune personnel** est un prix saisi par un utilisateur connecté pour une rune donnée, sur un serveur donné — indépendant du prix communautaire (`GET /runes`, alimenté par l'import Dofocus + soumissions communautaires via `PUT /runes/:id/price`). Un utilisateur peut brisser sur plusieurs serveurs : ces prix sont donc tenus par couple (rune, serveur), pas globalement par rune — un même utilisateur peut avoir un jeu de prix différent sur `Rafal` et sur `Brial`. Comme pour `/favorites` et `/trades`, ces endpoints nécessitent le header `Authorization: Bearer <token>` (Clerk) et ne stockent que l'id opaque `clerkUserId`.

Le backend ne fait **aucun fallback automatique** entre prix personnel et prix communautaire, ni aucun calcul de rentabilité les combinant — `GET /rune-prices` renvoie toujours les deux jeux de valeurs côte à côte pour chaque rune, `communityPrices` (identique à `GET /runes`) et `personalPrices` (propre à l'utilisateur connecté), et c'est au front de décider lequel utiliser pour son calcul de brisage (typiquement : `personalPrices` s'il existe une entrée pour le serveur courant, sinon retomber sur `communityPrices`).

**Erreur commune aux quatre endpoints** : `401` si le header `Authorization` est absent ou le token invalide/expiré — `{ "success": false, "error": "Authentication required" }`.

### `GET /rune-prices?serverName=`

Liste toutes les runes avec, pour chacune, ses prix communautaires et les prix personnels de l'utilisateur connecté.

**Query params**
| Param | Type | Requis | Description |
|---|---|---|---|
| `serverName` | string | non | Si fourni, ne garde dans `communityPrices` et `personalPrices` que les entrées de ce serveur. Contrairement à `GET /runes`, ne filtre **pas** les runes sans prix sur ce serveur — la liste complète des runes est toujours renvoyée, pour que le front affiche un formulaire de saisie même sur les runes sans prix personnel existant. |

**Réponse `200`**
```json
{
  "success": true,
  "count": 53,
  "data": [
    {
      "id": 1524,
      "name": "Rune Age",
      "characteristicId": 14,
      "characteristic": "Agilité",
      "imageUrl": "https://api.dofusdb.fr/img/items/78046.png",
      "value": 1,
      "weight": 1,
      "communityPrices": [
        { "serverName": "Rafal", "price": 79, "dateUpdated": "2026-08-16T10:53:46.882Z" }
      ],
      "personalPrices": [
        { "serverName": "Rafal", "price": 85, "updatedAt": "2026-08-19T09:05:00.000Z" }
      ]
    }
  ]
}
```

**Erreurs**
- `400` : `serverName` fourni mais vide.

### `GET /rune-prices/servers`

Liste les serveurs pour lesquels l'utilisateur connecté a au moins un prix personnel renseigné — pratique pour construire un sélecteur de serveur sans avoir à charger `GET /rune-prices` en entier.

**Réponse `200`**
```json
{
  "success": true,
  "count": 2,
  "data": ["Brial", "Rafal"]
}
```

### `PUT /rune-prices/:id`

Crée ou met à jour le prix personnel d'une rune sur un serveur donné pour l'utilisateur connecté (upsert).

**Params**
| Param | Type | Description |
|---|---|---|
| `id` | number | id de la rune (`Rune.id`) |

**Body**
```json
{
  "serverName": "Rafal",
  "price": 85
}
```
- `serverName` : string non vide, requis.
- `price` : entier > 0, requis.

**Réponse `200`**
```json
{
  "success": true,
  "data": {
    "id": 42,
    "clerkUserId": "user_2abc...",
    "runeId": 1524,
    "serverName": "Rafal",
    "price": 85,
    "updatedAt": "2026-08-19T09:05:00.000Z"
  }
}
```

**Erreurs**
- `400` : `id` (rune) invalide, `serverName` manquant/vide, ou `price` invalide (non entier ou ≤ 0).
- `404` : la rune `id` n'existe pas.

### `DELETE /rune-prices/:id?serverName=`

Supprime le prix personnel d'une rune sur un serveur donné (retour au prix communautaire par défaut côté front).

**Params**
| Param | Type | Description |
|---|---|---|
| `id` | number | id de la rune (`Rune.id`) |

**Query params**
| Param | Type | Requis | Description |
|---|---|---|---|
| `serverName` | string | oui | serveur du prix personnel à retirer |

**Réponse `200`**
```json
{ "success": true }
```

**Erreurs**
- `400` : `id` invalide, ou `serverName` manquant/vide.
- `404` : aucun prix personnel correspondant pour cet utilisateur sur ce serveur.

---

## Admin

### `GET /admin/seed`

Reconstruit la base de données depuis zéro (ex : changement de région/instance de la DB, perte de données). Enchaîne, dans le bon ordre de dépendance :

1. Import des runes + synchronisation complète du catalogue d'items (en parallèle, indépendants l'un de l'autre).
2. Import des coefficients (a besoin des runes pour connaître la liste des serveurs, et des items pour la contrainte de clé étrangère — d'où l'ordre).
3. Rafraîchissement des prix de craft déjà connus (no-op sur une base vide, inclus pour rester cohérent avec l'ensemble des jobs automatiques).

**Prérequis : le schéma doit déjà exister sur la base cible** (`npx prisma db push`) — cet endpoint ne crée pas les tables, seulement la donnée. Sur une base sans aucune table, il échoue avec une erreur explicite (`relation "Item" does not exist` ou similaire).

**Opération lente** : la synchronisation du catalogue d'items (~21 700 items chez DofusDB) domine largement le temps total — plusieurs minutes. Utiliser un client avec un timeout généreux.

**Rate limit** : 5 requêtes / 15 minutes (même limiteur que les autres imports).

**Réponse `200`**
```json
{
  "success": true,
  "result": {
    "runes": { "runes": 53, "prices": 689 },
    "items": { "items": 21748 },
    "coefficients": { "servers": 13, "coefficients": 37011, "skipped": 0 },
    "craftPrices": { "refreshed": 0, "failed": 0 }
  }
}
```

**Erreurs**
- `429` : rate limit dépassé.
- `500` : échec d'une étape — `error` contient le message (souvent : schéma pas encore poussé sur la nouvelle base).

---

## Notes pour le front

- Aucune authentification n'existe sur cette API en dehors de `/favorites`, `/trades` et `/rune-prices` — tout autre endpoint d'écriture (`PUT /runes/:id/price`, `PUT /coefficients/:itemId/:serverName`) est ouvert, à traiter comme une donnée communautaire non modérée pour l'instant.
- Les endpoints `*/import` sont rate-limités et coûteux (appels à des API externes) : ne pas les déclencher depuis une interaction utilisateur classique, ils sont prévus pour un usage admin/cron.
- La liste des noms de serveur (`serverName`) n'est validée nulle part côté backend — le front doit envoyer une valeur cohérente avec celles utilisées par Dofocus (ex: `Rafal`, `Brial`, `Dakal`, `Draconiros`, `HellMina`, `Imagiro`, `Kourial`, `Mikhal`, `Ombre`, `Orukam`, `Salar`, `TalKasha`, `Tylezia`).
