# Favoris — directives techniques (front)

Scope : ajout/mise à jour/suppression/listing des items favoris d'un utilisateur connecté (page profil). Seule feature de l'app qui nécessite une authentification — voir `docs/API.md` (section Favoris) pour le contrat complet, ce fichier ne couvre que ce qui est nécessaire pour l'intégrer.

## Prérequis : authentification Clerk

Ces quatre endpoints nécessitent que l'utilisateur soit connecté (Clerk côté Next.js). À chaque appel, envoyer le token de session courant :

```
Authorization: Bearer <token>
```

Avec le SDK Clerk côté Next.js, ce token s'obtient via `getToken()` (hook `useAuth()` côté client, ou `auth()` côté server component/route handler). Ne pas construire la logique d'affichage (bouton favori, page profil) tant que l'utilisateur n'est pas connecté — inutile d'appeler ces routes sans session, elles répondront `401` systématiquement.

## Données communautaires vs. données personnelles

Chaque favori porte deux jeux de valeurs, à ne pas confondre côté UI :

- `coefficient` / `craftPrice` : donnée **communautaire**, partagée entre tous les utilisateurs pour ce couple item/serveur (celle affichée sur la page coefficient classique).
- `personalCoefficient` / `personalCraftPrice` : donnée **privée** à l'utilisateur connecté, propre à ce favori (ex: son propre prix de craft négocié). `null` tant qu'il ne l'a pas renseignée via `PATCH`.
- `personalFocusSlug` / `personalFocusEnabled` : donnée **privée**, la rune focusée au brisage pour ce favori et si le focus est actif. `personalFocusSlug` est `null` tant que rien n'a été choisi (le front retombe sur son calcul "meilleure rune" par défaut) ; `personalFocusEnabled` vaut `true` par défaut.

Le backend ne fait **aucun fallback automatique** entre communautaire et personnel — il renvoie toujours les deux jeux de valeurs, chacun pouvant être `null` indépendamment. Recommandation d'affichage côté front : afficher la valeur personnelle en priorité si elle n'est pas `null`, sinon retomber sur la valeur communautaire (avec un indicateur visuel — icône ou libellé — pour distinguer "ma valeur" de "valeur communauté").

## 1. Ajouter un favori

```
POST /favorites
```

**Body**
```json
{
  "itemId": 8876,
  "serverName": "Rafal"
}
```

- `itemId` : id de l'item (déjà disponible depuis la recherche ou la page coefficient).
- `serverName` : le serveur sélectionné dans l'app (state global) — **le favori est lié au serveur**, pas seulement à l'item, puisque coefficient/prix de craft en dépendent. Si l'utilisateur change de serveur, l'item n'est pas automatiquement favori sur le nouveau.

Idempotent : ajouter un favori déjà existant ne crée pas de doublon, renvoie simplement l'entrée existante.

### Réponse `201`

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

Pas de valeurs personnelles à la création — utiliser `PATCH /favorites/:itemId` juste après pour les renseigner (ex: un formulaire "mes valeurs" affiché immédiatement après l'ajout aux favoris).

## 2. Renseigner mes valeurs personnelles sur un favori

```
PATCH /favorites/:itemId
```

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

- `serverName` : requis, identifie le favori avec `itemId` (même logique que les deux autres endpoints).
- `personalCoefficient` / `personalCraftPrice` / `personalFocusSlug` / `personalFocusEnabled` : au moins un des quatre requis, les autres sont laissés inchangés si omis. Envoyer `null` explicitement pour effacer une valeur déjà renseignée (repasser en "pas de donnée perso") — `personalFocusEnabled` étant un booléen non nullable, envoyer directement `true`/`false`.

### Réponse `200`

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

### Erreurs spécifiques

| Code | Cas |
|---|---|
| `400` | `personalCoefficient`/`personalCraftPrice`/`personalFocusSlug`/`personalFocusEnabled` d'un type invalide, ou aucun des quatre fourni |
| `404` | pas de favori pour cet item/serveur — il faut d'abord l'ajouter via `POST /favorites` |

## 3. Retirer un favori

```
DELETE /favorites/:itemId?serverName=<serveur>
```

`serverName` en query, requis (même logique que l'ajout : un favori est identifié par la paire item + serveur, pas par l'item seul).

### Réponse `200`

```json
{ "success": true }
```

## 4. Lister les favoris (page profil)

```
GET /favorites
```

Pas de query params — renvoie tous les favoris de l'utilisateur connecté (déduit du token), tous serveurs confondus si l'utilisateur en a sur plusieurs.

### Réponse `200`

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
        "effects": ["..."]
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

`coefficient`/`craftPrice` (communautaires) et `personalCoefficient`/`personalCraftPrice`/`personalFocusSlug`/`personalFocusEnabled` (perso) sont directement inclus — pas besoin d'un second appel à `GET /coefficients/:itemId/:serverName` par favori pour afficher la liste. Les champs `personal*` peuvent être `null` indépendamment (sauf `personalFocusEnabled`, toujours booléen) si aucune donnée n'existe encore — traiter comme "pas encore de donnée". Voir la section "Données communautaires vs. données personnelles" plus haut pour la logique d'affichage recommandée.

`createdAt` (date d'ajout aux favoris) et `updatedAt` (dernière modification de n'importe quel champ du favori) sont tous les deux renvoyés, y compris par `GET /favorites` — pas seulement au moment d'un `PATCH`. Recommandation d'affichage : `createdAt` pour "Favori depuis...", et `updatedAt` uniquement s'il diffère de `createdAt` (ex: "Modifié le...").

`personalCoefficientUpdatedAt` est propre au favori, pas une donnée communautaire : il trace uniquement la dernière fois que **`personalCoefficient`** a été renseigné/modifié par l'utilisateur via `PATCH` (indépendant des changements sur `personalCraftPrice`, qui ne le touchent pas). `null` tant que `personalCoefficient` n'a jamais été renseigné, ou remis à `null` si l'utilisateur l'efface (`personalCoefficient: null` en `PATCH`).

Un clic sur une ligne de la liste peut réutiliser `item.id` + `serverName` pour rouvrir la page coefficient de l'item (`GET /coefficients/:itemId/:serverName`, voir `docs/FRONT_COEFFICIENT_PAGE.md`).

## Erreurs communes aux quatre endpoints

| Code | Cas |
|---|---|
| `401` | Token absent ou invalide/expiré — `{ "success": false, "error": "Authentication required" }`. À gérer en redirigeant vers la connexion Clerk, pas en affichant une erreur générique. |
| `400` | `itemId` invalide, ou `serverName` manquant/vide (POST, PATCH et DELETE) ; sur PATCH, aussi si `personalCoefficient`/`personalCraftPrice`/`personalFocusSlug`/`personalFocusEnabled` sont d'un type invalide ou si aucun des quatre n'est fourni |
| `404` | `POST` : l'item `itemId` n'existe pas dans le catalogue. `PATCH`/`DELETE` : aucun favori correspondant pour cet utilisateur (pas encore ajouté, ou déjà retiré). |

Pas de rate limiting sur ces quatre endpoints.

## Référence complète

`docs/API.md` (section Favoris) — détail exhaustif, et vue d'ensemble de toute l'API.
