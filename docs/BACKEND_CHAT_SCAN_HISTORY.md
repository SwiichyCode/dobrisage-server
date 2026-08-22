# Historique des scans HDV (consignes pour le backend)

Ce document est une demande de modification pour `dofus-brisage-s` (backend externe, hors de ce repo). Il décrit une feature pas encore livrable côté front faute de donnée : permettre à l'utilisateur d'enregistrer le résultat d'un scan `/chat-analyzer` (OCR de chat Dofus) et de suivre son coût dans le temps pour une même chose trackée (craft d'équipement, clé de donjon, n'importe quel poste de dépense récurrent).

## La feature (front)

`/chat-analyzer` calcule déjà tout en local : liste des achats détectés, dépense totale (`computeTotalSpent`), résumé agrégé par objet (`aggregatePurchasesByItem` → `ItemSummary[]`, voir `docs/FRONT_CHAT_ANALYZER.md`). Rien n'est envoyé à aucun serveur aujourd'hui.

Le but : une fois le calcul terminé (`PurchaseResultsPanel`), l'utilisateur peut l'enregistrer sous deux formes :

1. **Nouveau suivi** — il donne un titre libre ("Craft Bouée", "Clé Donjon Kimbo", "Ressources Forgemagie"...) et le scan devient la première itération de ce suivi.
2. **Enrichir un suivi existant** — il retrouve un suivi déjà créé (par titre) et y rattache ce nouveau scan comme itération suivante. C'est le cas "je recraft/rachète la même chose 3 jours plus tard" : chaque scan garde son propre total, mais tous sont regroupés sous le même suivi.

`/profile` affiche ensuite la liste des suivis, chacun avec ses itérations dans l'ordre chronologique et l'écart de dépense entre elles ("+12% par rapport à la dernière fois").

## Pourquoi pas de lien vers le catalogue `Item` (retour sur la première version de ce doc)

Une première version de ce document proposait un `itemId` optionnel vers le catalogue pour taguer l'objet crafté. **Écarté** : la feature n'est pas limitée au craft d'équipement — une clé de donjon, ou toute autre dépense récurrente que l'utilisateur veut suivre, n'existe pas dans le catalogue `Item`. Un simple titre libre, choisi par l'utilisateur, couvre tous les cas sans dépendre de ce qui est ou non en base.

## Ce qui n'est PAS demandé (pour cadrer)

- **Toujours pas de FK sur les ressources scannées (`items[]`)** — texte OCR libre, jamais résolu au catalogue, pour les mêmes raisons que la version précédente de ce doc (fragile, faux positifs).
- **Pas de lien avec `/trades`.**
- **Pas de `serverName`** — un suivi peut porter sur une dépense qui n'a pas de notion de serveur unique (ex : l'utilisateur joue sur plusieurs serveurs et veut quand même comparer le coût global d'un même craft). Si un besoin réel apparaît de séparer par serveur, ce sera à trancher plus tard — pas anticipé ici.
- **Pas de renommage/fusion de suivis** pour une première version (pas de `PATCH /scan-series/:id`) — un titre mal orthographié se corrige en supprimant/recréant, l'usage attendu est trop faible pour justifier cet endpoint tout de suite.
- **Une itération de scan reste un instantané figé** — pas de `PATCH` sur une itération non plus.

## Nouveau modèle : `ScanSeries` + `ScanEntry`

```prisma
/**
 * Un "suivi" créé par l'utilisateur : un titre libre (ex: "Craft Bouée",
 * "Clé Donjon Kimbo") sous lequel il regroupe plusieurs scans /chat-analyzer
 * dans le temps. Volontairement pas lié au catalogue Item — la feature doit
 * couvrir des dépenses qui n'y existent pas (clés de donjon, etc.), voir
 * docs/BACKEND_CHAT_SCAN_HISTORY.md.
 */
model ScanSeries {
  id          Int         @id @default(autoincrement())
  clerkUserId String
  title       String
  createdAt   DateTime    @default(now())

  entries     ScanEntry[]

  @@index([clerkUserId])
}

/**
 * Une itération d'un ScanSeries : un scan /chat-analyzer enregistré à un
 * instant donné. `items` est le tableau ItemSummary[] déjà calculé côté
 * front (itemName, quantity, transactionCount, totalSpent, averageUnitPrice,
 * minUnitPrice, maxUnitPrice), stocké tel quel en JSON — itemName reste un
 * texte OCR libre, jamais résolu au catalogue.
 */
model ScanEntry {
  id          Int        @id @default(autoincrement())
  seriesId    Int
  totalSpent  Int
  items       Json
  createdAt   DateTime   @default(now())

  series      ScanSeries @relation(fields: [seriesId], references: [id])

  @@index([seriesId])
}
```

Suppression en cascade attendue : supprimer un `ScanSeries` doit supprimer ses `ScanEntry` (pas de trace orpheline) — à gérer en transaction côté back si Prisma `onDelete: Cascade` n'est pas déjà la convention du projet, sinon l'ajouter au champ `series`.

## Endpoints demandés

Authentifiés comme `/trades`/`/favorites` (`Authorization: Bearer <token>`, `clerkUserId` déduit du token).

### 1. `POST /scan-series` — nouveau suivi (+ première itération)

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
Crée le `ScanSeries` et sa première `ScanEntry` en une seule requête — le front n'a jamais de suivi sans au moins une itération.

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
      { "id": 5, "totalSpent": 245000, "items": [ /* ... */ ], "createdAt": "2026-08-22T10:00:00.000Z" }
    ]
  }
}
```

### 2. `POST /scan-series/:id/entries` — enrichir un suivi existant

**Body**
```json
{
  "totalSpent": 268000,
  "items": [ /* ... */ ]
}
```

**Réponse `201`**
```json
{
  "success": true,
  "data": { "id": 9, "seriesId": 3, "totalSpent": 268000, "items": [ /* ... */ ], "createdAt": "2026-08-25T09:00:00.000Z" }
}
```

`404` si `:id` n'existe pas ou n'appartient pas à l'utilisateur — même règle que `PATCH /trades/:id`.

### 3. `GET /scan-series` — liste des suivis (page profil)

Tous les suivis de l'utilisateur connecté, avec leurs itérations imbriquées, triées par `createdAt` croissant (ordre chronologique, prêt pour un affichage "itération 1 → 2 → 3" sans retri côté front — même logique que `GET /favorites/:itemId/history`). Suivis triés du plus récemment créé au plus ancien.

**Réponse `200`**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "id": 3,
      "title": "Craft Bouée",
      "createdAt": "2026-08-22T10:00:00.000Z",
      "entries": [
        { "id": 5, "totalSpent": 245000, "items": [ /* ... */ ], "createdAt": "2026-08-22T10:00:00.000Z" },
        { "id": 9, "totalSpent": 268000, "items": [ /* ... */ ], "createdAt": "2026-08-25T09:00:00.000Z" }
      ]
    }
  ]
}
```

Pas de pagination ni de query params pour une première version (volume attendu : quelques suivis par utilisateur, quelques itérations chacun) — à revoir seulement si l'usage le justifie. Le delta entre itérations (`268000 - 245000`) se calcule côté front, pas besoin de le renvoyer.

### 4. `DELETE /scan-series/:id`

Supprime le suivi et toutes ses itérations.

**Réponse `200`**
```json
{ "success": true }
```

## Erreurs communes

| Code | Cas |
|---|---|
| `401` | Token absent/invalide — `{ "success": false, "error": "Authentication required" }` |
| `400` | `POST /scan-series` : `title` absent/vide, `totalSpent` non numérique, `items` absent/vide/mal formé. `POST .../entries` : mêmes règles sur `totalSpent`/`items` |
| `404` | `:id` inexistant ou n'appartenant pas à l'utilisateur (sur `POST .../entries` et `DELETE`) |

## Documentation à mettre à jour

`docs/API.md` (backend) : nouvelle section "Suivis de scans" après la section Achats/Reventes.

## Côté front, une fois livré

Pas fait maintenant, à traiter en retour :
- `src/core/presentation/services/scanSeries.service.ts` (`createScanSeries`, `addScanEntry`, `fetchScanSeries`, `deleteScanSeries`), suivant le pattern de `trades.service.ts`.
- Dans `PurchaseResultsPanel`, après calcul : choix "Nouveau suivi" (champ titre) vs "Ajouter à un suivi existant" (liste des titres déjà créés, via `GET /scan-series`).
- Nouvelle section sur `/profile` : liste des suivis, chacun dépliable sur ses itérations avec le delta de `totalSpent` entre elles.
