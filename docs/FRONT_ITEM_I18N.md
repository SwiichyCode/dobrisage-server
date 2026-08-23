# Items multilingues (`name` / `description`) — changements schéma & API

Ce document décrit un changement déjà fait côté backend (`dofus-brisage-s`, ce repo) qui touche `prisma/schema.prisma` — **partagé avec le front**, qui possède les migrations. Le front doit répercuter ce changement de schéma et migrer sa base (Neon) ; voir la section "Migration" ci-dessous pour le point qui casse une migration Prisma naïve.

## Pourquoi

Le front a ajouté l'internationalisation. En vérifiant l'appel `GET /items` fait par le backend vers DofusDB (`api.dofusdb.fr`), on a confirmé que DofusDB renvoie **5 langues** par item, pas juste le français utilisé jusqu'ici :

```json
"name": {
  "id": "1169107",
  "de": "Nelumsens",
  "en": "War T Scythe",
  "es": "Nenufoz",
  "fr": "Nenufaur",
  "pt": "Nenufoice"
}
```

Avant ce changement, le backend ne gardait que `.fr` avant d'écrire en base (colonnes `String`) — `en`/`es`/`de`/`pt` étaient récupérés depuis DofusDB puis jetés. Rien n'était disponible pour le front en dehors du français.

## Ce qui a changé côté backend

`prisma/schema.prisma`, modèle `Item` :

```diff
 model Item {
   id          Int    @id
   iconId      Int
   typeId      Int?
   level       Int
-  name        String
-  description String
+  name        Json
+  description Json
   slug        String
   img         String
   effects     Json   @default("[]")
   ...
 }
```

- **`name` et `description` passent de `String` à `Json`** et stockent désormais l'objet complet des 5 locales (`{ fr, en, de, es, pt }`), au lieu du seul français.
- **`slug` reste `String` (français uniquement)**, volontairement — il ne sert qu'à la recherche back-end insensible aux accents (`normalizeSearchQuery` dans `item.service.ts`), jamais affiché tel quel. Pas de multi-langue nécessaire ici.
- Le service d'import (`importItems`/`syncItems` dans `item.service.ts`) stocke maintenant l'objet DofusDB complet au lieu de faire `.fr` à l'écriture.

## Nouveau format de `name` / `description`

Partout où l'API renvoyait `"name": "Ceinture Fulgurante"` (string), elle renvoie maintenant :

```json
"name": {
  "fr": "Ceinture Fulgurante",
  "en": "...",
  "de": "...",
  "es": "...",
  "pt": "..."
}
```

Même chose pour `description`. Le champ `id` interne renvoyé par DofusDB (identifiant de traduction, pas l'id de l'item) n'est pas conservé.

## Endpoints affectés

Tout endpoint qui renvoie un item ou une donnée qui l'embarque :

| Endpoint | Champ(s) impacté(s) |
|---|---|
| `GET /items` (recherche) | `data[].name` |
| `GET /items/:id` | `data.name`, `data.description` |
| `GET /coefficients/:itemId/:serverName` | `data.name` |
| `GET /coefficients/interesting` | `data[].item.name` |
| `GET /favorites` | `data[].item.name`, `data[].item.description` |
| `GET /trades` | `data[].item.name`, `data[].item.description` |

`docs/API.md` a été mis à jour avec les nouveaux exemples de réponse pour ces endpoints.

## ⚠️ Migration — pourquoi une migration Prisma naïve casse

Une migration Prisma générée normalement pour `String -> Json` produit un `ALTER COLUMN ... TYPE JSONB USING "name"::jsonb`. Ça **échoue** sur les lignes existantes : une valeur comme `Ceinture Fulgurante` (texte brut, sans guillemets) n'est **pas** un JSON valide — Postgres renvoie une erreur `invalid input syntax for type json`. C'est très probablement l'erreur de migration rencontrée.

Deux options, à choisir côté front selon la migration déjà tentée :

**Option recommandée — laisser la migration réussir "à vide" puis resynchroniser :**

1. Éditer la migration générée pour utiliser `to_jsonb("name")`/`to_jsonb("description")` au lieu de `"name"::jsonb` :
   ```sql
   ALTER TABLE "Item" ALTER COLUMN "name" TYPE JSONB USING to_jsonb("name");
   ALTER TABLE "Item" ALTER COLUMN "description" TYPE JSONB USING to_jsonb("description");
   ```
   Ça ne plante pas, mais **ne corrige pas la donnée** : chaque ligne se retrouve avec `name` = une simple chaîne JSON (`"Ceinture Fulgurante"`), pas l'objet `{ fr, en, de, es, pt }` attendu.
2. Une fois la migration appliquée, appeler `POST /items/import` (rate-limité 5 req/15 min, `importRateLimiter`). **Attention au nom trompeur** : cette route déclenche en réalité `syncItems()` (`item.controller.ts:78`), pas `importItems()` — les deux existent dans `item.service.ts` mais `importItems()` (un `createMany`/`skipDuplicates`, pensé pour un seed à froid) n'est appelé nulle part dans le code, ni par une route ni par `admin.seedAll`. Seul `syncItems()` est branché, et c'est justement la fonction qu'il faut : un upsert (`ON CONFLICT DO UPDATE`) qui écrase `name`/`description` de chaque ligne existante avec le vrai objet multilingue depuis DofusDB. **Aucune nouvelle route n'est nécessaire** — celle qui existe déjà fait le bon travail.

**Tant que l'étape 2 n'est pas faite**, l'API renvoie des `name`/`description` sous forme de chaîne JSON scalaire (pas l'objet attendu) — le front ne doit pas lire `item.name.fr` avant la resynchronisation, sous peine de `undefined`.

## Côté front

- Adapter tout code qui traite `item.name`/`item.description` comme une `string` pour lire `item.name[locale]` (avec repli sur `fr` si la locale courante n'a pas de traduction — DofusDB garantit `fr`/`en` sur tous les items historiquement importés, `de`/`es`/`pt` dépendent de la donnée source mais sont présents dans tous les cas observés).
- Répercuter le diff de schéma ci-dessus dans le `schema.prisma` du front, migrer en suivant la section précédente, puis appeler `POST /items/import` une fois pour repeupler `name`/`description` correctement.
