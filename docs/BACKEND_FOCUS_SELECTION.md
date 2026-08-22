# Rune focus perso par favori (consignes pour le backend)

Ce document est une demande de modification pour `dofus-brisage-s` (backend externe, hors de ce repo). Il décrit une feature livrée côté front avec un contournement temporaire (localStorage), en attendant une vraie persistance côté serveur.

## La feature (front)

Sur une card favori (`FavoriteItemCard`, page `/profile`), l'utilisateur choisit quelle rune est "focusée" au brisage (dropdown) et si le focus est actif ou non (toggle "Focus") — ça change le rendement affiché (`computeRuneProfit`). Par défaut, la rune la plus rentable est présélectionnée et le focus est activé.

Ce choix n'est aujourd'hui persisté qu'en `localStorage` (`src/core/presentation/utils/favoriteFocusSelection.ts`, clé `dofus-brisage:focus-selection:<clerkUserId>:<itemId>:<serverName>`) — **contournement volontaire**, marqué `ponytail:` dans le code, en attendant ce changement backend. Limite : la sélection ne suit pas l'utilisateur d'un navigateur/appareil à l'autre, et disparaît si le localStorage est vidé.

## Modèle de données actuel (`FavoriteItem`)

Mirroré côté front dans `prisma/schema.prisma` (ce repo ne fait que refléter ce que le backend possède déjà) :

```prisma
model FavoriteItem {
  id          Int      @id @default(autoincrement())
  clerkUserId String
  itemId      Int
  serverName  String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @default(now()) @updatedAt

  personalCoefficient          Float?
  personalCoefficientUpdatedAt DateTime?
  personalCraftPrice           Int?

  item        Item     @relation(fields: [itemId], references: [id])

  @@unique([clerkUserId, itemId, serverName])
}
```

Aucune colonne pour la rune focus perso — contrairement à `personalCoefficient`/`personalCraftPrice`, rien n'est prévu pour cette valeur.

## Changements demandés

### 1. Deux nouvelles colonnes sur `FavoriteItem`

```prisma
model FavoriteItem {
  // ... colonnes existantes inchangées

  personalFocusSlug    String?
  personalFocusEnabled Boolean @default(true)
}
```

- `personalFocusSlug` : le slug de la caractéristique focusée (ex. `"vitalite"`, `"force"` — même vocabulaire slug que celui déjà utilisé côté front pour matcher stat ↔ rune, cf. `src/libs/dofus/constants/characteristics.ts`/`rune-categories.ts`, décrit dans `CLAUDE.md`). `null` tant que l'utilisateur n'a rien choisi — le front retombe alors sur son calcul "meilleure rune" par défaut, comme aujourd'hui.
- `personalFocusEnabled` : `true`/`false`, indépendant de `personalFocusSlug` (l'utilisateur peut choisir une rune puis désactiver le focus sans perdre son choix). Défaut `true`, cohérent avec le comportement actuel du front.
- Pas de colonne `updatedAt` dédiée (pas de besoin d'historique ici, contrairement à `personalCoefficient` — cf. `docs/BACKEND_COEFFICIENT_HISTORY.md`, feature séparée).

### 2. Étendre `PATCH /favorites/:itemId`

Mêmes règles que `personalCoefficient`/`personalCraftPrice` (cf. `docs/FRONT_FAVORITES copy.md` section 2) : chaque champ est optionnel indépendamment, laissé inchangé si omis, effacé si `null` envoyé explicitement.

**Body (champs ajoutés)**
```json
{
  "serverName": "Rafal",
  "personalFocusSlug": "vitalite",
  "personalFocusEnabled": true
}
```

**Réponse `200` (champs ajoutés)**
```json
{
  "success": true,
  "data": {
    "id": 5,
    "clerkUserId": "user_2abc...",
    "itemId": 8876,
    "serverName": "Rafal",
    "createdAt": "2026-08-18T15:20:00.000Z",
    "updatedAt": "2026-08-22T10:00:00.000Z",
    "personalCoefficient": 4300,
    "personalCraftPrice": 12800000,
    "personalFocusSlug": "vitalite",
    "personalFocusEnabled": true
  }
}
```

Validation : `personalFocusSlug` doit être une chaîne (pas de vérification contre un catalogue de slugs connus côté backend — le front ignorera silencieusement un slug qui ne correspond à aucune ligne de l'item, comme il le fait déjà pour `selectedSlug` en local). `personalFocusEnabled` doit être un booléen si fourni. Le body reste valide si seul l'un des deux champs (parmi les quatre `personal*`) est présent — pas de contrainte "au moins un requis" à ajouter spécifiquement pour ces deux-là au-delà de la règle existante.

### 3. Étendre `GET /favorites`

Ajouter `personalFocusSlug`/`personalFocusEnabled` à chaque entrée, au même niveau que `personalCoefficient`/`personalCraftPrice` :

```json
{
  "item": { "...": "..." },
  "serverName": "Rafal",
  "createdAt": "2026-08-18T15:20:00.000Z",
  "coefficient": 4200,
  "craftPrice": 13500000,
  "personalCoefficient": null,
  "personalCraftPrice": 12800000,
  "personalFocusSlug": "vitalite",
  "personalFocusEnabled": true
}
```

### 4. `POST /favorites` (création)

Réponse `201` inchangée dans son principe : `personalFocusSlug: null`, `personalFocusEnabled: true` par défaut, comme les autres valeurs perso qui démarrent vides.

### 5. Documentation à mettre à jour

`docs/API.md` (backend) et `docs/FRONT_FAVORITES copy.md` (ce repo) : section Favoris, `PATCH`/`GET /favorites` avec les deux nouveaux champs.

## Côté front, une fois livré

Pas fait maintenant, à traiter en retour :
- `favorite_type.ts` (`FavoriteListItem`, `FavoritePersonalValues`) : ajouter `personalFocusSlug`/`personalFocusEnabled`.
- `favorites.service.ts` : inclure les deux champs dans `updateFavoritePersonalValues`.
- `FavoriteItemCard.tsx` : initialiser `selectedSlug`/`focusEnabled` depuis `favorite.personalFocusSlug`/`favorite.personalFocusEnabled` plutôt que depuis `readLocalFocusSelection`, et appeler `updateFavoritePersonalValues` au lieu de `writeLocalFocusSelection` sur changement.
- Supprimer `src/core/presentation/utils/favoriteFocusSelection.ts` et le `ponytail:` associé une fois la bascule faite (garder une lecture du localStorage existant en fallback un temps si on veut migrer en douceur les choix déjà faits, sinon suppression directe si l'impact est jugé négligeable).
