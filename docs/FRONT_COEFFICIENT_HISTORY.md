# Historique du coefficient personnel — directives techniques (front)

Scope : nouvel endpoint qui expose l'évolution de `personalCoefficient` d'un favori dans le temps (demandé dans `docs/BACKEND_COEFFICIENT_HISTORY.md`, livré côté backend). Auth, header, gestion des tokens : identique aux autres endpoints `/favorites`, voir `docs/FRONT_FAVORITES.md`.

## Endpoint

```
GET /favorites/:itemId/history?serverName=<serveur>
```

Même token `Authorization: Bearer <token>` que le reste de `/favorites`.

**Réponse `200`** — trié par `dateUpdated` croissant, prêt pour un tracé de courbe sans retri :

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

**Erreurs** : `401` (comme les autres `/favorites`), `400` (`itemId` invalide ou `serverName` manquant/vide), `404` (aucun favori pour cet item/serveur chez l'utilisateur — même règle que `PATCH`/`DELETE`).

## Comment les points sont alimentés

Rien à changer sur l'appel `PATCH /favorites/:itemId` existant : le backend ajoute automatiquement un point à chaque `PATCH` qui change `personalCoefficient` vers une nouvelle valeur non `null` (effacer la valeur avec `null` n'ajoute pas de point). Retirer le favori (`DELETE`) supprime aussi son historique.

## Reste à faire côté front

- Type `PersonalCoefficientHistoryPoint` + `fetchPersonalCoefficientHistory` dans `favorites.service.ts` (pas `coefficientDetail.service.ts` — périmètre favoris/auth).
- Composant courbe sur `FavoriteItemCard` : réutiliser une lib de charting déjà présente dans le repo si elle existe, sinon SVG minimal — pas de nouvelle dépendance sans vérifier l'existant.
- Retirer/adapter la card "Prochainement — Historique des coefficients" (`src/app/(app)/profile/page.tsx`) une fois le graphe branché.

## Référence complète

`docs/API.md` (section Favoris, sous-endpoint après `DELETE /favorites/:itemId`).
