# Achats/Reventes — directives techniques (front)

Scope : journal personnel achat/craft → revente d'un utilisateur connecté (page profil). Comme `/favorites`, ces endpoints nécessitent une authentification — voir `docs/API.md` (section Achats/Reventes) pour le contrat complet, ce fichier ne couvre que ce qui est nécessaire pour l'intégrer.

## Prérequis : authentification Clerk

Ces quatre endpoints nécessitent que l'utilisateur soit connecté (Clerk côté Next.js). À chaque appel, envoyer le token de session courant :

```
Authorization: Bearer <token>
```

Avec le SDK Clerk côté Next.js, ce token s'obtient via `getToken()` (hook `useAuth()` côté client, ou `auth()` côté server component/route handler). Ne pas appeler ces routes tant que l'utilisateur n'est pas connecté — elles répondront `401` systématiquement.

## Différence avec les favoris

Un favori est unique par (item, serveur). Un **trade n'a pas cette contrainte** : l'utilisateur peut créer plusieurs trades pour le même item/serveur au fil du temps (une nouvelle session de craft/revente = un nouveau trade). Le front doit donc traiter `/trades` comme un journal/historique, pas comme un toggle — chaque `POST` crée une nouvelle ligne, il n'y a pas d'idempotence comme sur `/favorites`.

## 1. Créer un trade

```
POST /trades
```

**Body**
```json
{
  "itemId": 8876,
  "serverName": "Rafal",
  "craftPrice": 13500000,
  "sellPrice": 15000000
}
```

- `itemId` : id de l'item (déjà disponible depuis la recherche `/items` ou la page coefficient).
- `serverName` : le serveur sélectionné dans l'app (state global).
- `craftPrice` / `sellPrice` : optionnels — l'utilisateur peut créer le trade dès qu'il a choisi l'item, sans encore connaître ses prix, et les renseigner ensuite via `PATCH`.

### Réponse `201`

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

## 2. Mettre à jour un trade

```
PATCH /trades/:id
```

Envoyer uniquement les champs qui changent — c'est le endpoint utilisé pour chacune des trois actions décrites par le produit : renseigner le prix de craft, renseigner le prix de revente, et basculer le toggle "vendu". Trois appels distincts dans le temps sont attendus, pas nécessairement un seul appel avec tout rempli.

**Body** (exemples)
```json
{ "craftPrice": 13500000 }
```
```json
{ "sellPrice": 15000000 }
```
```json
{ "sold": true }
```

### Réponse `200`

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

## 3. Supprimer un trade

```
DELETE /trades/:id
```

### Réponse `200`

```json
{ "success": true }
```

## 4. Lister les trades (page profil)

```
GET /trades
```

Pas de query params — renvoie tous les trades de l'utilisateur connecté (déduit du token), tous serveurs et items confondus, du plus récent au plus ancien. Pas de champ `item` embarqué contrairement à `/favorites` — le front doit garder/recharger les infos d'item (nom, image) à partir de `itemId` s'il en a besoin dans la liste (ex : via un cache local ou un second appel à `GET /items/:id`).

### Réponse `200`

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

Le profit d'un trade se calcule côté front : `sellPrice - craftPrice` (garder en tête que l'un des deux, ou les deux, peuvent être `null` tant que l'utilisateur ne les a pas renseignés).

## Erreurs communes aux quatre endpoints

| Code | Cas |
|---|---|
| `401` | Token absent ou invalide/expiré — `{ "success": false, "error": "Authentication required" }`. À gérer en redirigeant vers la connexion Clerk, pas en affichant une erreur générique. |
| `400` | `itemId`/`id` invalide, `serverName` manquant/vide (POST), `craftPrice`/`sellPrice`/`sold` invalide, ou body vide sur `PATCH` |
| `404` | `POST` : l'item `itemId` n'existe pas dans le catalogue. `PATCH`/`DELETE` : aucun trade correspondant pour cet utilisateur (déjà supprimé, ou appartient à un autre utilisateur). |

Pas de rate limiting sur ces quatre endpoints.

## Référence complète

`docs/API.md` (section Achats/Reventes) — détail exhaustif, et vue d'ensemble de toute l'API.
