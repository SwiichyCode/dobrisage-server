# Favoris — directives techniques (front)

Scope : ajout/suppression/listing des items favoris d'un utilisateur connecté (page profil). Seule feature de l'app qui nécessite une authentification — voir `docs/API.md` (section Favoris) pour le contrat complet, ce fichier ne couvre que ce qui est nécessaire pour l'intégrer.

## Prérequis : authentification Clerk

Ces trois endpoints nécessitent que l'utilisateur soit connecté (Clerk côté Next.js). À chaque appel, envoyer le token de session courant :

```
Authorization: Bearer <token>
```

Avec le SDK Clerk côté Next.js, ce token s'obtient via `getToken()` (hook `useAuth()` côté client, ou `auth()` côté server component/route handler). Ne pas construire la logique d'affichage (bouton favori, page profil) tant que l'utilisateur n'est pas connecté — inutile d'appeler ces routes sans session, elles répondront `401` systématiquement.

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
    "createdAt": "2026-08-18T15:20:00.000Z"
  }
}
```

## 2. Retirer un favori

```
DELETE /favorites/:itemId?serverName=<serveur>
```

`serverName` en query, requis (même logique que l'ajout : un favori est identifié par la paire item + serveur, pas par l'item seul).

### Réponse `200`

```json
{ "success": true }
```

## 3. Lister les favoris (page profil)

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
      "coefficient": 4200,
      "craftPrice": 13500000
    }
  ]
}
```

`coefficient`/`craftPrice` sont directement inclus (lus depuis `ItemMarketData` pour le serveur du favori) — pas besoin d'un second appel à `GET /coefficients/:itemId/:serverName` par favori pour afficher la liste. Comme partout ailleurs, les deux peuvent être `null` si aucune donnée n'existe encore pour cette paire item/serveur — traiter comme "pas encore de donnée".

Un clic sur une ligne de la liste peut réutiliser `item.id` + `serverName` pour rouvrir la page coefficient de l'item (`GET /coefficients/:itemId/:serverName`, voir `docs/FRONT_COEFFICIENT_PAGE.md`).

## Erreurs communes aux trois endpoints

| Code | Cas |
|---|---|
| `401` | Token absent ou invalide/expiré — `{ "success": false, "error": "Authentication required" }`. À gérer en redirigeant vers la connexion Clerk, pas en affichant une erreur générique. |
| `400` | `itemId` invalide, ou `serverName` manquant/vide (POST et DELETE uniquement) |
| `404` | `POST` : l'item `itemId` n'existe pas dans le catalogue. `DELETE` : aucun favori correspondant pour cet utilisateur (déjà retiré, ou jamais ajouté). |

Pas de rate limiting sur ces trois endpoints.

## Référence complète

`docs/API.md` (section Favoris) — détail exhaustif, et vue d'ensemble de toute l'API.
