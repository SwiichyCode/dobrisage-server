# Feedback utilisateur (bug/suggestion) — consignes pour le backend

Ce document est une demande de modification pour `dofus-brisage-s` (backend externe, hors de ce repo). Il décrit une feature pas encore livrable côté front faute de donnée : un formulaire de remontée de bug/suggestion sur `/chat-analyzer`, dont les messages sont consultables dans `/admin`.

## La feature (front)

Sur `/chat-analyzer`, un utilisateur peut envoyer un message libre (bug rencontré ou suggestion), avec deux choix indépendants du compte Clerk :

- **Anonyme**, ou avec un **pseudo libre** (texte, pas lié à un compte — l'utilisateur peut ne pas être connecté du tout, cf. "connexion optionnelle" dans `docs/FRONT_CHAT_ANALYZER.md`, même logique ici).
- Pas de champ email/contact demandé — ce n'est pas un formulaire de support avec réponse individuelle, juste une remontée que l'équipe consulte dans `/admin`.

Ces messages sont ensuite listés dans `/admin` (déjà gaté par `publicMetadata.role === "admin"` côté Next.js, voir `src/app/[locale]/(app)/admin/layout.tsx`) — un nouvel onglet/page `/admin/feedback`.

## Pourquoi pas lié à `clerkUserId`

Contrairement à `Trade`/`FavoriteItem`/`ScanSeries`, cette feature doit marcher **sans compte** — le pseudo est un simple champ texte optionnel, pas une identité. Pas de FK vers un utilisateur Clerk.

## Nouveau modèle : `Feedback`

```prisma
enum FeedbackType {
  BUG
  SUGGESTION
}

model Feedback {
  id        Int          @id @default(autoincrement())
  type      FeedbackType
  message   String
  pseudo    String?
  locale    String
  createdAt DateTime     @default(now())

  @@index([createdAt])
}
```

- `pseudo` nul = anonyme (pas de convention magique type `""` ou `"Anonyme"` — le front envoie `null`/omet le champ, l'admin affiche "Anonyme" si absent).
- `locale` : la langue de l'UI au moment de l'envoi (`fr`/`en`/`es`, cf. `src/i18n/routing.ts`), pas une traduction du message — utile pour que l'admin sache dans quelle langue répondre si besoin de recontacter (mais voir plus bas, pas de canal de réponse pour l'instant).
- Pas de statut lu/traité pour une première version (pas de colonne `resolved`) — à ajouter plus tard si le volume le justifie, pas anticipé ici.

## Endpoints demandés

### 1. `POST /feedback` — envoyer un message

Public, comme le reste de l'API (cf. CLAUDE.md "Backend API" — aucun endpoint n'est authentifié aujourd'hui). Pas de `clerkUserId` transmis même si l'utilisateur est connecté : cette feature est volontairement indépendante du compte.

**Body**
```json
{
  "type": "bug",
  "message": "Le drag and drop des screenshots ne fonctionne pas sur Firefox.",
  "pseudo": "Iop-du-13",
  "locale": "fr"
}
```
`pseudo` omis ou `null` si envoyé en anonyme.

**Réponse `201`**
```json
{
  "success": true,
  "data": { "id": 12, "type": "bug", "message": "...", "pseudo": "Iop-du-13", "locale": "fr", "createdAt": "2026-08-23T10:00:00.000Z" }
}
```

**Erreurs**
- `400` : `type` absent ou hors `["bug", "suggestion"]`, `message` absent/vide, `locale` absent ou hors `["fr", "en", "es"]`.
- Limite de taille sur `message` recommandée côté backend (ex. 2000 caractères) pour éviter l'abus d'un endpoint public sans auth — à trancher côté back, pas de contrainte imposée par le front aujourd'hui.

### 2. `GET /feedback` — liste pour l'admin

**Pas d'authentification backend** (cohérent avec le reste de l'API, cf. CLAUDE.md) — la protection actuelle est uniquement le fait que `/admin/feedback` n'est pas linké et gaté côté Next.js par le rôle Clerk. **Point d'attention à soulever côté back** : contrairement aux autres `GET` publics (runes, coefficients, items), celui-ci expose des messages potentiellement sensibles (bugs signalés) à qui devine l'URL — si ça pose problème, la vraie solution serait un minimum d'auth backend (hors scope de ce doc, à discuter séparément si souhaité).

Triés par `createdAt` décroissant (les plus récents d'abord — l'admin veut voir les derniers signalements en premier, contrairement aux historiques `GET /favorites/:itemId/history` ou `GET /scan-series` qui sont chronologiques croissants pour un tracé de courbe).

**Réponse `200`**
```json
{
  "success": true,
  "count": 2,
  "data": [
    { "id": 12, "type": "bug", "message": "...", "pseudo": "Iop-du-13", "locale": "fr", "createdAt": "2026-08-23T10:00:00.000Z" },
    { "id": 11, "type": "suggestion", "message": "...", "pseudo": null, "locale": "en", "createdAt": "2026-08-22T18:30:00.000Z" }
  ]
}
```

Pas de pagination ni de filtre `type`/`locale` pour une première version — volume attendu faible, à revoir seulement si l'usage le justifie (même raisonnement que `GET /scan-series`).

## Ce qui n'est PAS demandé (pour cadrer)

- **Pas de canal de réponse à l'utilisateur** — pas d'email/contact collecté, donc rien à répondre individuellement. L'admin consulte, ça s'arrête là.
- **Pas de statut lu/traité/archivé.**
- **Pas de `DELETE /feedback/:id`** — à ajouter si le besoin de nettoyer la liste apparaît une fois en usage réel.

## Documentation à mettre à jour

`docs/API.md` (backend) : nouvelle section "Feedback" après la section Coefficients.

## Côté front, une fois livré

Pas fait maintenant (en attente du backend) :
- `src/core/presentation/services/feedback.service.ts` (`sendFeedback`, `fetchFeedback`), suivant le pattern de `admin.service.ts`/`scanSeries.service.ts`.
- Un composant `FeedbackDialog` sur `/chat-analyzer` (bouton toujours visible, pas de `useAuth()`/gate contrairement à `SaveScanDialog` — cette feature marche sans compte) : type bug/suggestion, message, pseudo optionnel. `locale` récupéré via `useLocale()` (`next-intl`), pas un champ visible du formulaire.
- `/admin/feedback` : liste simple (type, message, pseudo ou "Anonyme", date, badge de langue) — page admin restant en français uniquement, cf. CLAUDE.md "Internationalization" (`/admin` hors périmètre de traduction).
- Textes du formulaire à traduire dans `messages/{fr,en,es}.json` (nouvelle clé racine `ChatAnalyzer.Feedback` ou similaire) — c'est la seule partie de cette feature concernée par le multilangue : le formulaire est vu par tout visiteur donc doit être traduit comme le reste de `/chat-analyzer`, contrairement à `/admin/feedback` qui reste français.
