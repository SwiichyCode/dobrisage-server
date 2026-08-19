# Page coefficient — directives techniques (front)

Scope : affichage + édition du coefficient et du prix de craft d'un item, sur le serveur sélectionné. Suite directe de la barre de recherche (`docs/FRONT_SEARCH_BAR.md`). Pas de directive design ici, uniquement l'intégration technique.

## Prérequis pour arriver sur cette page

Deux valeurs, déjà connues à ce stade :
- `itemId` : id du résultat cliqué dans la recherche.
- `serverName` : le serveur sélectionné dans l'app (state global).

## 1. Récupérer les données de la page

```
GET /coefficients/:itemId/:serverName
```

**Un seul appel** renvoie tout ce qu'il faut pour l'item + son coefficient + son prix de craft sur ce serveur — pas besoin de croiser plusieurs routes pour ça.

### Réponse

```json
{
  "success": true,
  "data": {
    "id": 8876,
    "name": "Voile d'encre",
    "level": 191,
    "img": "https://api.dofusdb.fr/img/items/17147.png",
    "effects": [
      { "from": 251, "to": 350, "characteristic": 11, "category": 0, "elementId": -1, "effectId": 100 }
    ],
    "serverName": "Rafal",
    "coefficient": 4000,
    "coefficientUpdatedAt": "2026-08-18T15:00:00.000Z",
    "craftPrice": 14000000,
    "craftPriceUpdatedAt": "2026-08-18T15:12:00.000Z"
  }
}
```

| Champ | Détail |
|---|---|
| `effects` | Tableau des plages de caractéristiques de l'item. `characteristic` est un id numérique (pas de libellé fourni — vous gérez déjà la résolution du nom de votre côté, voir échange précédent). C'est ce tableau qui sert à savoir quelles runes sont concernées par cet item. |
| `coefficient` | `null` si personne n'a encore renseigné de valeur pour cet item sur ce serveur (ni Dofocus, ni un utilisateur) — traiter comme "pas encore de donnée", pas comme une erreur. Sinon toujours à jour (balayé toutes les heures). |
| `coefficientUpdatedAt` | Date de dernière mise à jour du coefficient. `null` si `coefficient` est `null`. |
| `craftPrice` | Peut aussi être `null` — soit personne n'a encore consulté cet item avant vous, soit Dofocus n'a rien pour ce serveur. Si non-`null` après un premier appel, il ne redeviendra pas `null` ensuite. |
| `craftPriceUpdatedAt` | Idem, `null` si `craftPrice` est `null`. |

### Erreurs

| Code | Cas |
|---|---|
| `400` | `itemId` n'est pas un nombre, ou `serverName` manquant/vide |
| `404` | l'item `itemId` n'existe pas dans le catalogue — ne devrait pas arriver si vous arrivez depuis la recherche, mais à gérer par sécurité |
| `500` | erreur serveur (ex : Dofocus down au moment d'un premier fetch de prix de craft) |

Pas de rate limiting sur cet endpoint — appelable librement à chaque chargement de page.

## 2. Récupérer les prix des runes pour le calcul de rentabilité

Vous avez déjà la fonction de calcul (coefficient × prix des runes − prix de craft). Pour l'alimenter, il faut les prix des runes concernées par les `effects` de l'item, sur le même serveur :

```
GET /runes?serverName=<serverName>
```

Renvoie **toutes** les runes (~53, dataset volontairement petit) avec leur prix sur ce serveur — pas de filtrage serveur nécessaire ici, c'est un seul appel léger. Croisez ensuite chaque entrée de `effects[]` avec la liste des runes en comparant `effects[].characteristic` à `characteristicId` de chaque rune, pour retrouver le prix de la rune correspondante.

Voir `docs/API.md` (section Runes) pour le contrat complet de cette route.

**Chargez les deux routes en parallèle** (`GET /coefficients/:itemId/:serverName` et `GET /runes?serverName=`) — elles sont indépendantes, pas besoin d'attendre l'une pour lancer l'autre.

## 3. Éditer coefficient et prix de craft

```
PUT /coefficients/:itemId/:serverName
```

**Body**
```json
{
  "coefficient": 4200,
  "craftPrice": 13500000
}
```

- `coefficient` : nombre ≥ 0, requis. Les deux champs sont envoyés **ensemble** dans le même appel, même si l'utilisateur n'a modifié que l'un des deux — renvoyer la valeur actuelle (affichée) pour le champ non touché.
- `craftPrice` : entier ≥ 0, requis.

### Réponse

```json
{
  "success": true,
  "data": {
    "id": 17,
    "itemId": 8876,
    "serverName": "Rafal",
    "coefficient": 4200,
    "coefficientSource": "USER",
    "coefficientUpdatedAt": "2026-08-18T15:20:00.000Z",
    "craftPrice": 13500000,
    "craftPriceSource": "USER",
    "craftPriceUpdatedAt": "2026-08-18T15:20:00.000Z"
  }
}
```

**Utilisez directement cette réponse pour mettre à jour l'état local de la page — pas besoin de refaire un `GET` après un `PUT` réussi.**

`coefficientSource`/`craftPriceSource` valent `"DOFOCUS"` ou `"USER"` — utile si vous voulez indiquer visuellement qu'une valeur vient de la communauté Dofocus vs. d'un joueur de votre site (optionnel, à vous de voir).

### Points d'attention

- **Aucune authentification.** N'importe qui peut modifier ces valeurs — ne pas construire de logique front qui suppose un contrôle d'accès (pas de bouton "modifier" réservé à un utilisateur connecté, etc.), ce n'est pas géré côté backend pour l'instant.
- **La modification écrase la valeur existante sans confirmation ni historique** — si vous voulez un "êtes-vous sûr ?" avant envoi, c'est à gérer côté front, le backend ne garde pas de trace de l'ancienne valeur.
- Pas de rate limiting sur cet endpoint non plus.

### Erreurs

| Code | Cas |
|---|---|
| `400` | `itemId`/`serverName` invalides, ou `coefficient`/`craftPrice` invalides (négatif, non numérique, `craftPrice` non entier) |
| `404` | l'item `itemId` n'existe pas |

## Référence complète

`docs/API.md` — détail exhaustif de toutes les routes (runes, items, coefficients).
