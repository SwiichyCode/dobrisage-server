# Barre de recherche d'items — directives techniques (front)

Scope : recherche d'items par nom + affichage des résultats. Pas de directive design ici, uniquement l'intégration technique avec l'API.

## Endpoint

```
GET /items?q=<terme>&serverName=<serveur>&limit=<n>
```

Base URL : `http://localhost:3000` (dev) — voir `docs/API.md` pour la config CORS/port.

### Paramètres

| Param | Type | Requis | Détail |
|---|---|---|---|
| `q` | string | **oui** | Terme tapé par l'utilisateur. Sous-chaîne insensible à la casse **et aux accents** (ex : `epee` retrouve "Épée...") — pas de recherche floue/typo-tolerante, correspondance exacte de sous-chaîne une fois accents/casse normalisés. |
| `serverName` | string | non | Si fourni, chaque résultat inclut son `coefficient`, `updatedAt`, `profitability` et `revenue` pour ce serveur. **Toujours envoyer ce paramètre** dès qu'un serveur est sélectionné côté front — sans lui, ces quatre champs sont toujours `null`. |
| `limit` | number | non (défaut `20`) | Entier entre 1 et 50. Un `limit` trop élevé n'a pas d'intérêt ici (barre de recherche, pas une liste paginée) — rester sur le défaut ou une valeur proche (10-20) est recommandé. |

### Réponse

```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "id": 789,
      "name": "Ceinture du Kobeer",
      "level": 1,
      "img": "https://api.dofusdb.fr/img/items/10009.png",
      "typeId": 10,
      "coefficient": 100,
      "updatedAt": "2026-08-18T15:12:00.000Z",
      "profitability": 850000,
      "revenue": 1200000
    }
  ]
}
```

- `coefficient` peut être `null` : soit `serverName` n'a pas été envoyé, soit le cron n'a pas encore couvert cet item (rare une fois le premier balayage complet passé — voir `docs/API.md` section Coefficients). **Traiter `null` comme "pas encore de donnée", pas comme une erreur.**
- `updatedAt` : date la plus récente entre la maj du coefficient et celle du prix de craft pour cet item+serveur. `null` si aucun des deux n'existe encore.
- `profitability` : rentabilité en runes-or si on casse l'item en ciblant, au brisage, la meilleure stat en focus (une seule rune, quantité max), prix de craft déduit. `null` si `coefficient` est `null`, si aucune stat de l'item n'a de rune connue avec un prix sur ce serveur, ou si le prix de craft n'est pas encore renseigné (dans ce dernier cas, regarder `revenue`).
- `revenue` : même calcul que `profitability` mais **avant** déduction du prix de craft — utile pour afficher un chiffre (ex: "rendement runes : X") quand `profitability` est `null` uniquement parce que le prix de craft manque encore. `null` dans les mêmes cas que `profitability`, sauf le cas "prix de craft manquant" où `profitability` est `null` mais `revenue` peut être renseigné.
- `data` est un tableau vide (`[]`) si rien ne correspond — pas une erreur, juste "aucun résultat".
- `typeId` est l'id du type d'équipement DofusDB (pas encore résolu en libellé côté backend — mentionné pour info, pas bloquant pour cette feature).

### Erreurs

| Code | Cas |
|---|---|
| `400` | `q` absent ou vide, `limit` hors 1-50 ou non entier, `serverName` fourni mais pas une chaîne |
| `500` | erreur serveur/DB |

Pas de `429` sur cet endpoint (pas de rate limiting ici, contrairement à `*/import`) — c'est fait pour être appelé fréquemment.

## Comportement attendu côté front (recherche "as you type")

Ce sont des contraintes techniques, pas des choix visuels :

1. **Debounce obligatoire.** Ne pas déclencher une requête à chaque frappe — un délai de 250-300ms après la dernière touche est le standard. Sans ça, chaque caractère tapé déclenche un appel réseau + une requête DB.
2. **Annuler les requêtes obsolètes.** Un utilisateur qui tape vite peut avoir plusieurs requêtes en vol simultanément ; rien ne garantit que les réponses reviennent dans l'ordre d'envoi. Utiliser `AbortController` (ou équivalent) pour annuler la requête précédente dès qu'une nouvelle recherche part, sinon une réponse "en retard" peut écraser un résultat plus récent à l'écran.
3. **Ne pas requêter en dessous d'un minimum de caractères** (2 caractères est un choix courant) — évite des résultats trop larges et des appels inutiles pour une saisie qui n'a pas encore de sens.
4. **Toujours passer `serverName`** dès qu'un serveur est sélectionné dans l'app (probablement en state global/contexte, pas propre à la recherche) — sinon la recherche fonctionne mais sans coefficient, ce qui n'est pas le but de cette page.

## Suite du parcours (pas à implémenter maintenant, pour contexte)

Un clic sur un résultat ouvre la page coefficient de cet item via `GET /coefficients/:itemId/:serverName` (`id` du résultat de recherche + `serverName` déjà sélectionné). Cet endpoint est documenté dans `docs/API.md`.

## Référence complète

Le détail exhaustif de tous les endpoints (formats d'erreur, exemples complets, autres routes) est dans `docs/API.md` — ce fichier-ci ne couvre que ce qui est nécessaire pour la recherche.
