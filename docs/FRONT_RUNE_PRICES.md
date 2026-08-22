# Prix de runes personnels — directives techniques (front)

Scope : lecture/écriture/suppression des prix de runes propres à un utilisateur connecté, sur un ou plusieurs serveurs (page profil / réglages, ou panneau "mes prix" sur la page de brisage). Nécessite une authentification, comme `/favorites` et `/trades` — voir `docs/API.md` (section Prix de runes personnels) pour le contrat complet, ce fichier ne couvre que ce qui est nécessaire pour l'intégrer.

## Prérequis : authentification Clerk

Ces quatre endpoints nécessitent que l'utilisateur soit connecté. À chaque appel, envoyer le token de session courant :

```
Authorization: Bearer <token>
```

Avec le SDK Clerk côté Next.js, ce token s'obtient via `getToken()` (`useAuth()` côté client, ou `auth()` côté server component/route handler). Ne pas appeler ces routes tant que l'utilisateur n'est pas connecté — elles répondront `401` systématiquement.

## Multi-serveur : pas de "serveur courant" côté backend

Un utilisateur peut brisser sur plusieurs serveurs (multi-compte, multi-perso). Le backend ne connaît **aucune notion de serveur par défaut** pour un utilisateur — chaque prix personnel est stocké par couple (rune, serveur), et tous les endpoints attendent `serverName` explicitement (body, query, ou filtre de liste). C'est au front de porter le "serveur actuellement sélectionné" (même state global que celui déjà utilisé pour `/favorites` et `/trades`) et de le passer à chaque appel.

`GET /rune-prices/servers` donne la liste des serveurs sur lesquels l'utilisateur a *déjà* au moins un prix renseigné — utile pour pré-remplir un sélecteur de serveur sur la page "mes prix de runes", mais ne remplace pas le state global de serveur sélectionné utilisé partout ailleurs dans l'app.

## Données communautaires vs. données personnelles

Chaque rune renvoyée par `GET /rune-prices` porte deux jeux de prix, à ne pas confondre côté UI :

- `communityPrices` : donnée **communautaire**, identique à `GET /runes` (import Dofocus + soumissions via `PUT /runes/:id/price`), partagée entre tous les utilisateurs.
- `personalPrices` : donnée **privée** à l'utilisateur connecté, saisie via `PUT /rune-prices/:id`.

Le backend ne fait **aucun fallback automatique** ni aucun calcul de rentabilité combinant les deux — il renvoie toujours les deux tableaux, chacun pouvant être vide indépendamment. Recommandation pour le calcul de brisage côté front (`computeMaxFocusProfit` / `src/libs/dofus/brisage.ts`) : utiliser le prix personnel du serveur sélectionné s'il existe, sinon retomber sur le prix communautaire du même serveur — avec un indicateur visuel pour distinguer "mon prix" du prix communauté, comme déjà fait pour `personalCoefficient` sur les favoris.

## 1. Lister mes prix de runes (page "mes prix", ou panneau brisage)

```
GET /rune-prices?serverName=<serveur sélectionné>
```

`serverName` optionnel mais recommandé en pratique : sans lui, `communityPrices`/`personalPrices` contiennent les entrées de *tous* les serveurs pour chaque rune, ce qui n'est utile que pour un écran "vue d'ensemble multi-serveurs". Contrairement à `GET /runes`, la liste renvoyée n'est **jamais filtrée** aux runes ayant un prix sur ce serveur — les 53 runes sont toujours présentes, pour pouvoir afficher un formulaire de saisie même quand aucun prix (perso ou communautaire) n'existe encore.

### Réponse `200`

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

Avec `serverName` fourni, `communityPrices`/`personalPrices` contiennent 0 ou 1 élément (celui de ce serveur) — plus simple à consommer directement (`personalPrices[0]?.price`).

## 2. Enregistrer mon prix pour une rune

```
PUT /rune-prices/:id
```

**Body**
```json
{
  "serverName": "Rafal",
  "price": 85
}
```

- `:id` : id de la rune (`Rune.id`, déjà disponible depuis `GET /runes` ou `GET /rune-prices`).
- `serverName` : le serveur sélectionné dans l'app — requis, un prix personnel est toujours lié à un serveur.
- `price` : entier > 0, requis. Pas de champ optionnel : contrairement à `PATCH /favorites/:itemId`, cet endpoint est un upsert complet, pas une mise à jour partielle.

Upsert : appeler cet endpoint sur une rune déjà renseignée sur ce serveur écrase simplement l'ancienne valeur.

### Réponse `200`

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

### Erreurs spécifiques

| Code | Cas |
|---|---|
| `400` | `price` invalide (non entier ou ≤ 0), ou `serverName` manquant/vide |
| `404` | id de rune inexistant |

## 3. Effacer mon prix pour une rune (retour au prix communautaire)

```
DELETE /rune-prices/:id?serverName=<serveur>
```

`serverName` en query, requis (même logique que l'écriture : un prix personnel est identifié par la paire rune + serveur). Après suppression, le front doit retomber sur `communityPrices` pour l'affichage/calcul de brisage sur cette rune/serveur.

### Réponse `200`

```json
{ "success": true }
```

## 4. Lister mes serveurs configurés

```
GET /rune-prices/servers
```

Pas de query params — renvoie les serveurs sur lesquels l'utilisateur connecté a déjà au moins un prix personnel, triés alphabétiquement.

### Réponse `200`

```json
{
  "success": true,
  "count": 2,
  "data": ["Brial", "Rafal"]
}
```

`data: []` (pas une erreur) si l'utilisateur n'a encore jamais renseigné de prix personnel.

## Erreurs communes aux quatre endpoints

| Code | Cas |
|---|---|
| `401` | Token absent ou invalide/expiré — `{ "success": false, "error": "Authentication required" }`. À gérer en redirigeant vers la connexion Clerk, pas en affichant une erreur générique. |
| `400` | id de rune invalide (PUT/DELETE), `serverName` manquant/vide (tous sauf `GET /rune-prices/servers`), ou `price` invalide (PUT) |
| `404` | `PUT` : id de rune inexistant. `DELETE` : aucun prix personnel correspondant pour cet utilisateur sur ce serveur. |

Pas de rate limiting sur ces quatre endpoints.

## Référence complète

`docs/API.md` (section "Prix de runes personnels") — détail exhaustif, et vue d'ensemble de toute l'API.
