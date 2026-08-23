# Historique des coefficients personnels (consignes pour le backend)

Ce document est une demande de modification pour `dofus-brisage-s` (backend externe, hors de ce repo). Il décrit une feature pas encore livrable côté front faute de donnée : un suivi de l'évolution du coefficient dans le temps.

**Correction par rapport à une première version de ce document** : la donnée à suivre est `FavoriteItem.personalCoefficient`, pas `ItemMarketData.coefficient`. Le coefficient communautaire (`ItemMarketData`) est partagé entre tous les utilisateurs et n'est pas ce que la feature veut tracer — l'historique porte uniquement sur la valeur **personnelle** que chaque utilisateur connecté renseigne sur ses propres favoris. Toute cette feature touche donc uniquement le périmètre `FavoriteItem` / `/favorites`, pas `ItemMarketData` / `/coefficients`.

**Ajout par rapport à une première version de ce document** : en attendant que `GET /favorites/:itemId/history` (section 3) existe, le front a journalisé cet historique lui-même, côté navigateur (`localStorage`, par utilisateur/item/serveur) — voir "Pourquoi un endpoint d'import" en section 5. Cette donnée locale ne doit pas être perdue quand la table `PersonalCoefficientHistory` (section 1) devient la source de vérité : la section 5 ci-dessous décrit le endpoint à ajouter spécifiquement pour la rapatrier.

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

### 5. Nouvel endpoint `POST /favorites/:itemId/history/import` (rapatriement du localStorage)

**Pourquoi un endpoint d'import.** Avant que `GET /favorites/:itemId/history` (section 3) existe, le front loggait déjà l'évolution de `personalCoefficient` de son côté (localStorage du navigateur), pour pouvoir afficher un historique dès aujourd'hui. Cette donnée existe uniquement chez chaque utilisateur, dans son navigateur, et ne remontera jamais au backend via le flux normal (section 2, qui n'écrit qu'au moment du `PATCH`, avec la date du jour). Sans un endpoint dédié, tout cet historique déjà accumulé serait perdu le jour où le front bascule sur la table `PersonalCoefficientHistory` : ce endpoint permet au front de renvoyer ces points une bonne fois, **avec leur date d'origine** (pas la date du jour), pour peupler la table sans trou.

Authentifié comme les autres endpoints `/favorites` (`Authorization: Bearer <token>`) — `clerkUserId` déduit du token, jamais transmis en paramètre.

**Requête**

`POST /favorites/:itemId/history/import?serverName=<serveur>`

```json
{
  "points": [
    { "coefficient": 3800, "dateUpdated": "2026-07-01T00:00:00.000Z" },
    { "coefficient": 4000, "dateUpdated": "2026-07-20T10:00:00.000Z" }
  ]
}
```

| Champ                  | Type                   | Description                                                                                                                                                                                   |
| ---------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `itemId`               | number (path)          | id de l'item                                                                                                                                                                                  |
| `serverName`           | string (query, requis) | serveur du favori                                                                                                                                                                             |
| `points[].coefficient` | number                 | valeur du coefficient à cette date                                                                                                                                                            |
| `points[].dateUpdated` | string ISO 8601        | date d'origine du point, **fournie par le client** (contrairement au `PATCH` normal, qui utilise `now()`) — c'est la seule différence de comportement avec le flux d'écriture de la section 2 |

**Comportement attendu**

- Insère un point par entrée de `points`, avec le `dateUpdated` tel que fourni (pas de recalcul serveur).
- Idempotent : rejouer le même import (ou une partie qui se recouvre) ne doit pas créer de doublons — la contrainte `@@unique([clerkUserId, itemId, serverName, dateUpdated])` de la section 1 le garantit déjà, un conflit sur cette clé doit juste être ignoré (pas une erreur 500).
- N'écrase jamais un point déjà en base à une date donnée — l'import ne fait qu'ajouter ce qui manque.
- Ne modifie ni `FavoriteItem.personalCoefficient` ni `personalCoefficientUpdatedAt` : c'est un import d'historique seul, pas une mise à jour de la valeur courante du favori (celle-ci passe uniquement par `PATCH /favorites/:itemId`, section 2).

**Réponse `200`**

```json
{ "success": true, "imported": 2 }
```

`imported` = nombre de points effectivement insérés (peut être inférieur à `points.length` si certains existaient déjà).

**Erreurs**

- `401` : token absent/invalide.
- `400` : `itemId` invalide, `serverName` manquant/vide, ou `points` absent/vide/mal formé (`coefficient` non numérique, `dateUpdated` non parsable).
- `404` : aucun favori pour cet item/serveur chez cet utilisateur (même règle que `PATCH`/`DELETE`/`GET .../history`).

**Usage attendu** : appelé une seule fois par le front, par (utilisateur, item, serveur), au moment où il détecte un historique local non encore importé — pas un endpoint rappelé en continu. Un point déjà présent (`personalCoefficient` jamais édité localement, ou déjà migré) donne un `points` vide côté front, qui ne devrait pas déclencher d'appel du tout.

### 6. Documentation à mettre à jour

`docs/API.md` (backend) : section Favoris, deux nouveaux sous-endpoints après `DELETE /favorites/:itemId` — `GET .../history` (section 3) et `POST .../history/import` (section 5).

## Côté front, une fois livré

Déjà fait (en avance sur ce document, pendant que `GET .../history` n'existait pas encore) :

- Type `PersonalCoefficientHistoryPoint` + fonction `fetchPersonalCoefficientHistory` (`favorites.service.ts`).
- Composant courbe (SVG minimal, pas de lib de charting) sur la page détail d'un favori (`CoefficientEvolution.tsx`, via `FavoriteCoefficientDetail.tsx`), qui préfère déjà `GET .../history` dès qu'il répond, avec un repli sur l'historique local (`personalCoefficientHistory.ts`) tant qu'il ne répond pas.

Reste à faire une fois les deux endpoints (section 3 et section 5) livrés :

- `importPersonalCoefficientHistory` (`favorites.service.ts`), qui appelle `POST .../history/import`.
- Un scan une fois par utilisateur connecté (au chargement de `/profile`) de tout l'historique local (`localStorage`, toutes les clés `item`/`serveur` de cet utilisateur, pas seulement le favori affiché) pour l'envoyer via `importPersonalCoefficientHistory`, marqué fait ensuite pour ne pas le rejouer à chaque chargement.
- Retirer/adapter la card "Prochainement — Historique des coefficients" dans `src/app/(app)/profile/page.tsx` si elle est encore présente.
