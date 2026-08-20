# Historique des coefficients personnels (consignes pour le backend)

Ce document est une demande de modification pour `dofus-brisage-s` (backend externe, hors de ce repo). Il décrit une feature pas encore livrable côté front faute de donnée : un suivi de l'évolution du coefficient dans le temps.

**Correction par rapport à une première version de ce document** : la donnée à suivre est `FavoriteItem.personalCoefficient`, pas `ItemMarketData.coefficient`. Le coefficient communautaire (`ItemMarketData`) est partagé entre tous les utilisateurs et n'est pas ce que la feature veut tracer — l'historique porte uniquement sur la valeur **personnelle** que chaque utilisateur connecté renseigne sur ses propres favoris. Toute cette feature touche donc uniquement le périmètre `FavoriteItem` / `/favorites`, pas `ItemMarketData` / `/coefficients`.

## La feature (front)

La page profil (`/profile`) a une carte "Prochainement" en place depuis le début de la page profil : "Historique des coefficients — Courbe d'évolution du coefficient par item, pour repérer le meilleur moment pour briser." (`src/app/(app)/profile/page.tsx`). Le but : sur une card favori (`FavoriteItemCard`), afficher un petit graphe de l'évolution du `personalCoefficient` de cet utilisateur pour cet item/serveur dans le temps.

Ce n'est pas constructible aujourd'hui : `GET /favorites` ne renvoie que la **dernière** valeur de `personalCoefficient`, écrasée à chaque `PATCH /favorites/:itemId`.

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

Une ligne par `(clerkUserId, itemId, serverName)` : chaque `PATCH /favorites/:itemId` qui renseigne `personalCoefficient` **écrase** la valeur précédente (et met à jour `personalCoefficientUpdatedAt`). Rien ne garde trace des valeurs passées.

## Changements demandés

### 1. Nouvelle table `PersonalCoefficientHistory`

```prisma
model PersonalCoefficientHistory {
  id          Int      @id @default(autoincrement())
  clerkUserId String
  itemId      Int
  serverName  String
  coefficient Float
  dateUpdated DateTime

  item        Item     @relation(fields: [itemId], references: [id])

  @@unique([clerkUserId, itemId, serverName, dateUpdated])
  @@index([clerkUserId, itemId, serverName])
}
```

- Clé par `(clerkUserId, itemId, serverName)`, comme `FavoriteItem` — même logique de portée privée par utilisateur, pas de FK directe vers `FavoriteItem.id` (pas nécessaire, et évite un souci de cascade si le favori est retiré, cf. point 4).
- Pas de colonne `source` : contrairement à `ItemMarketData.coefficient`, `personalCoefficient` n'a qu'une seule origine possible (saisie utilisateur via `PATCH`), pas de valeur Dofocus.

### 2. Écrire un point d'historique à chaque `PATCH /favorites/:itemId` qui change `personalCoefficient`

Uniquement quand :
- `personalCoefficient` est présent dans le body **et**
- sa nouvelle valeur diffère de l'ancienne **et**
- la nouvelle valeur n'est pas `null` (un effacement de la valeur perso, cf. `docs/FRONT_FAVORITES copy.md` section 2, n'est pas un point de coefficient à tracer).

### 3. Nouvel endpoint `GET /favorites/:itemId/history?serverName=<serveur>`

Authentifié comme les quatre endpoints `/favorites` existants (`Authorization: Bearer <token>`, cf. `docs/FRONT_FAVORITES copy.md`) — l'historique est scopé au `clerkUserId` déduit du token, jamais transmis en paramètre.

**Params**
| Param | Type | Description |
|---|---|---|
| `itemId` | number (path) | id de l'item |
| `serverName` | string (query, requis) | serveur du favori — même logique que `DELETE /favorites/:itemId` |

**Réponse `200`**, triée par `dateUpdated` croissant (ordre chronologique, prêt pour un tracé de courbe sans retri côté front) :

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

Pas de query params supplémentaires pour une première version (pas de pagination ni de range de dates) — le volume attendu par favori est faible (quelques éditions perso dans le temps, pas un flux continu).

**Erreurs**
- `401` : token absent/invalide, même comportement que les autres endpoints `/favorites`.
- `400` : `itemId` invalide, ou `serverName` manquant/vide.
- `404` : aucun favori pour cet item/serveur chez cet utilisateur (même règle que `PATCH`/`DELETE /favorites/:itemId`).
- Liste vide (`data: []`, pas une erreur) si le favori existe mais n'a encore aucun historique — cas normal pour un favori dont `personalCoefficient` n'a jamais été renseigné.

### 4. Suppression d'un favori

`DELETE /favorites/:itemId?serverName=<serveur>` — à préciser côté backend si l'historique doit être supprimé avec le favori (probable, pour ne pas garder une trace orpheline) ou conservé. Recommandation : supprimer, cohérent avec le fait que l'historique n'a de sens qu'attaché à un favori actif.

### 5. Documentation à mettre à jour

`docs/API.md` (backend) : section Favoris, nouveau sous-endpoint après `DELETE /favorites/:itemId`.

## Côté front, une fois livré

Pas fait maintenant, à traiter en retour :
- Nouveau type `PersonalCoefficientHistoryPoint` + fonction `fetchPersonalCoefficientHistory` (`favorites.service.ts`, pas `coefficientDetail.service.ts` — la donnée vit dans le périmètre favoris/auth, pas coefficients communautaires).
- Un composant courbe sur `FavoriteItemCard` (à choisir : lib de charting déjà présente dans le repo si une l'est, sinon SVG minimal — pas de nouvelle dépendance sans vérifier l'existant).
- Retirer/adapter la card "Prochainement — Historique des coefficients" dans `src/app/(app)/profile/page.tsx` une fois le graphe branché.
