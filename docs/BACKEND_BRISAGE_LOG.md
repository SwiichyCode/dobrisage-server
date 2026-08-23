# Journal de brisage réel (consignes pour le backend)

Ce document est une demande de modification pour `dofus-brisage-s` (backend externe, hors de ce repo). Il décrit une feature pas encore livrable côté front faute de donnée : un vrai journal des items réellement brisés, pour que les cards "Kamas investis / Kamas de runes obtenus / Profit total" de `/profile` (`ProfileStats`) reflètent l'intégralité des brisages effectués, pas juste un instantané du favori courant.

**Ajout par rapport à une première version de ce document** : la section "Ce qui n'est PAS demandé" excluait initialement tout `PATCH` ("une ligne mal saisie se corrige en la supprimant et en la re-saisissant"). Revu depuis : l'utilisateur veut pouvoir corriger une ligne en place plutôt que devoir la supprimer/ressaisir — section 4 ci-dessous (`PATCH /brisage-entries/:id`) est la demande correspondante.

## Pourquoi une nouvelle table (et pas `PersonalCoefficientHistory`)

`PersonalCoefficientHistory` (cf. `docs/BACKEND_COEFFICIENT_HISTORY.md`) journalise les **éditions** de `FavoriteItem.personalCoefficient` — pas des événements de brisage. Un utilisateur peut corriger cette valeur sans avoir rien brisé, ou briser plusieurs items sans jamais y toucher. Les deux notions sont volontairement gardées séparées (voir le commentaire dans `FavoritesSection.tsx` sur `totalRevenue`/`totalInvested`, qui n'agrège aujourd'hui que le favori courant, pas un historique de brisages).

## La feature (front)

Sur `FavoriteItemCard`, un bouton "J'ai brisé cet item" ouvre un petit tableau où l'utilisateur saisit, ligne par ligne, le coefficient obtenu au concasseur pour chaque exemplaire cassé lors de cette session (au concasseur, casser plusieurs exemplaires d'un même item donne un coefficient différent par exemplaire). Coût de craft et rune focus sont pré-remplis depuis le favori (modifiables par ligne si besoin) ; le kamas obtenu/le profit sont calculés en direct côté front (`computeRuneProfit`, déjà utilisé partout ailleurs dans l'app) et envoyés déjà calculés — **figés à cet instant**, jamais recalculés plus tard avec des prix de runes différents.

## Ce qui n'est PAS demandé (pour cadrer)

- **Pas de `GET` scopé à un seul favori** (`/favorites/:itemId/brisage-entries`) — seul l'agrégat global (`GET /brisage-entries`, tous items/serveurs confondus) est demandé, pour alimenter les cards de `/profile`. Un journal détaillé par item est un possible ajout futur, pas demandé maintenant.
- **Pas de suppression par lot** (`batchId`) — seulement ligne par ligne (`DELETE /brisage-entries/:id`) pour cette itération.
- **Pas de recalcul serveur** de `revenue`/`profit` à partir de `coefficient`/`craftPrice`, ni à la création ni à la correction (`PATCH`) — le backend stocke ce que le front envoie déjà calculé (même logique que les autres endpoints de ce repo : toute la logique de rendement Dofus vit côté front dans `src/libs/dofus/brisage.ts`, le backend n'en a aucune copie).
- **Pas d'édition de `runeSlug`/`focusEnabled`/`batchId`/`serverName`/`itemId` par `PATCH`** — seuls `coefficient`, `craftPrice`, `revenue`, `profit` sont corrigibles pour cette itération (cf. section 4). Un mauvais item/serveur/lot se corrige en supprimant la ligne et en la resaisissant.
- **Pas de pagination** sur `GET /brisage-entries` pour une première version — à revoir si le volume par utilisateur devient réellement élevé (sessions de brisage fréquentes).

## Nouveau modèle : `BrisageEntry`

```prisma
/**
 * Un événement réel de brisage : un item cassé, avec le coefficient obtenu
 * au concasseur et le kamas investi/obtenu figés au moment de la saisie
 * (pas recalculés plus tard avec les prix courants, contrairement à
 * FavoriteItemCard/CoefficientEvolution qui affichent une rentabilité "si je
 * le brisais aujourd'hui"). batchId regroupe les lignes saisies en une seule
 * fois (plusieurs exemplaires du même favori cassés d'affilée au concasseur)
 * pour un affichage par session, sans empêcher de supprimer une ligne
 * individuellement.
 */
model BrisageEntry {
  id           Int      @id @default(autoincrement())
  clerkUserId  String
  itemId       Int
  serverName   String
  batchId      String

  coefficient  Float
  craftPrice   Int
  runeSlug     String?
  focusEnabled Boolean  @default(true)

  revenue      Int
  profit       Int

  createdAt    DateTime @default(now())

  item         Item     @relation(fields: [itemId], references: [id])

  @@index([clerkUserId, itemId, serverName])
  @@index([clerkUserId, batchId])
}
```

- Pas de FK vers `FavoriteItem.id`, même raisonnement que `PersonalCoefficientHistory` : le favori peut être retiré/recréé sans affecter le journal, et un favori retiré ne doit pas rendre son historique de brisage illisible.
- `runeSlug` nullable : `null` quand `focusEnabled` est `false` (brisage "sans focus", toutes runes obtenues, pas une seule ciblée — même distinction que `FavoriteItemCard`/`computeRuneProfit`).
- `createdAt` généré côté serveur (`now()`) — contrairement à l'endpoint d'import de `docs/BACKEND_COEFFICIENT_HISTORY.md`, il n'y a pas de données passées à rapatrier ici, chaque ligne est saisie juste après le brisage réel.

## Endpoints demandés

Authentifiés comme `/favorites`/`/trades` (`Authorization: Bearer <token>`, `clerkUserId` déduit du token, jamais transmis en paramètre).

### 1. `POST /favorites/:itemId/brisage-entries?serverName=<serveur>` — enregistrer une session

**Body**

```json
{
  "batchId": "b_2026-08-23T14:32:00.000Z-x7f2",
  "entries": [
    {
      "coefficient": 3800,
      "craftPrice": 45000,
      "runeSlug": "puissance",
      "focusEnabled": true,
      "revenue": 62000,
      "profit": 17000
    },
    {
      "coefficient": 4100,
      "craftPrice": 45000,
      "runeSlug": "puissance",
      "focusEnabled": true,
      "revenue": 68000,
      "profit": 23000
    }
  ]
}
```

`batchId` généré côté front (un identifiant opaque, ex. timestamp + suffixe aléatoire), pas par le backend — sert uniquement à regrouper l'affichage, pas de contrainte de format particulière au-delà d'une chaîne non vide.

**Réponse `201`**

```json
{
  "success": true,
  "created": 2,
  "data": [
    {
      "id": 101,
      "itemId": 3421,
      "serverName": "Tal Kasha",
      "batchId": "b_2026-08-23T14:32:00.000Z-x7f2",
      "coefficient": 3800,
      "craftPrice": 45000,
      "runeSlug": "puissance",
      "focusEnabled": true,
      "revenue": 62000,
      "profit": 17000,
      "createdAt": "2026-08-23T14:32:00.000Z"
    },
    {
      "id": 102,
      "itemId": 3421,
      "serverName": "Tal Kasha",
      "batchId": "b_2026-08-23T14:32:00.000Z-x7f2",
      "coefficient": 4100,
      "craftPrice": 45000,
      "runeSlug": "puissance",
      "focusEnabled": true,
      "revenue": 68000,
      "profit": 23000,
      "createdAt": "2026-08-23T14:32:00.000Z"
    }
  ]
}
```

Toutes les lignes de `entries` prennent le même `createdAt` (celui de la requête) — pas un `createdAt` par ligne.

### 2. `GET /brisage-entries` — agrégat global (cards `/profile`)

Pas nested sous `/favorites/:itemId` : cet endpoint renvoie **tout** l'historique de brisage de l'utilisateur connecté, tous items/serveurs confondus, pour que `ProfileStats` puisse sommer `revenue`/`craftPrice`/`profit` sur l'ensemble.

Triée par `createdAt` décroissant (le plus récent en premier).

**Réponse `200`**

```json
{
  "success": true,
  "count": 42,
  "data": [
    {
      "id": 102,
      "itemId": 3421,
      "serverName": "Tal Kasha",
      "batchId": "b_2026-08-23T14:32:00.000Z-x7f2",
      "coefficient": 4100,
      "craftPrice": 45000,
      "runeSlug": "puissance",
      "focusEnabled": true,
      "revenue": 68000,
      "profit": 23000,
      "createdAt": "2026-08-23T14:32:00.000Z"
    }
  ]
}
```

### 3. `DELETE /brisage-entries/:id`

Supprime une ligne isolée (correction d'une erreur de saisie).

**Réponse `200`**

```json
{ "success": true }
```

### 4. `PATCH /brisage-entries/:id` — corriger une ligne mal saisie

Authentifié comme les autres endpoints `/brisage-entries` — `clerkUserId` déduit du token, une ligne n'appartenant pas à l'utilisateur répond `404` (même règle que `DELETE`).

**Body** — au moins un champ requis parmi les quatre, tous optionnels individuellement :

```json
{ "coefficient": 4000, "craftPrice": 45000, "revenue": 68000, "profit": 23000 }
```

| Champ         | Type              | Description                                                                                                                                                                                                                                                                                                                   |
| ------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `coefficient` | number, optionnel | Nouveau coefficient                                                                                                                                                                                                                                                                                                           |
| `craftPrice`  | number, optionnel | Nouveau coût de craft                                                                                                                                                                                                                                                                                                         |
| `revenue`     | number, optionnel | Nouveau kamas obtenu                                                                                                                                                                                                                                                                                                          |
| `profit`      | number, optionnel | Nouveau profit — le front l'envoie toujours recalculé (`revenue - craftPrice`) dès que l'un des deux change, mais le backend ne doit **pas** le recalculer lui-même s'il est absent : le stocker tel quel ou, si absent, laisser sa valeur actuelle inchangée (jamais de dérivation serveur, cf. "Ce qui n'est PAS demandé"). |

Aucun autre champ (`runeSlug`, `focusEnabled`, `batchId`, `serverName`, `itemId`, `createdAt`) n'est modifiable par cet endpoint — les ignorer silencieusement s'ils sont présents dans le body plutôt que de renvoyer une erreur (tolérance, pas une garantie exploitée volontairement côté front).

**Réponse `200`**

```json
{
  "success": true,
  "data": {
    "id": 102,
    "itemId": 3421,
    "serverName": "Tal Kasha",
    "batchId": "b_2026-08-23T14:32:00.000Z-x7f2",
    "coefficient": 4000,
    "craftPrice": 45000,
    "runeSlug": "puissance",
    "focusEnabled": true,
    "revenue": 68000,
    "profit": 23000,
    "createdAt": "2026-08-23T14:32:00.000Z"
  }
}
```

## Erreurs communes

| Code  | Cas                                                                                                                                                                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `401` | Token absent/invalide — `{ "success": false, "error": "Authentication required" }`                                                                                                                                                              |
| `400` | `POST` : `serverName` manquant/vide, `batchId` manquant/vide, `entries` absent/vide/mal formé (`coefficient`/`craftPrice`/`revenue`/`profit` non numériques). `PATCH` : aucun des quatre champs présent, ou un champ présent mais non numérique |
| `404` | `POST` : aucun favori pour cet `itemId`/`serverName` chez cet utilisateur (même règle que `PATCH`/`DELETE /favorites/:itemId`). `PATCH`/`DELETE /brisage-entries/:id` : `:id` inexistant ou n'appartenant pas à l'utilisateur                   |

## Documentation à mettre à jour

`docs/API.md` (backend) : nouvelle section "Journal de brisage" après la section Favoris.

## Côté front

Déjà fait (sections 1-3, POST/GET/DELETE) :

- Types `BrisageEntry`/`NewBrisageEntry`/`LatestBrisage` + fonctions `createBrisageEntries`/`fetchBrisageEntries`/`deleteBrisageEntry` (`favorites.service.ts`).
- Bouton "Je brise cet item" sur `FavoriteItemCard` (`BrisageLogDialog`) : tableau à lignes, coût/rune pré-remplis depuis le favori et éditables, total investi/obtenu/profit affiché en direct, un seul "Enregistrer" qui envoie tout le lot.
- `ProfileStats` (`Kamas investis`/`Kamas de runes obtenus`/`Profit total`) et `CoefficientEvolution` (page `/profile/coefficient/[itemId]`) sourcés entièrement sur `GET /brisage-entries`.
- `BrisageJournalSection`/`BrisageEntryRow` (bas de `/profile`) : liste paginée, suppression ligne par ligne.

Pas fait maintenant, à traiter en retour une fois la section 4 (`PATCH`) livrée :

- `updateBrisageEntry` (`favorites.service.ts`) — déjà écrite côté front, en attente de l'endpoint.
- Édition en place de `coefficient`/`craftPrice`/`revenue` sur `BrisageEntryRow` (clic sur la valeur → input, comme `TradeRow`) — déjà écrite, `profit` recalculé côté front (`revenue - craftPrice`) et envoyé avec chaque `PATCH`.
