# Tickets de support (bug/suggestion avec réponse admin) — consignes pour le backend

Ce document est une demande de modification pour `dofus-brisage-s` (backend externe, hors de ce repo). Il décrit une feature pas encore livrable côté front faute de donnée : une page `/support`, réservée aux utilisateurs connectés, où un utilisateur ouvre un ticket (bug/suggestion) et peut échanger des messages avec un admin qui lui répond depuis `/admin`.

## Remplace `Feedback`

Cette feature **remplace** l'ancien formulaire anonyme documenté dans `docs/BACKEND_CHAT_ANALYZER_FEEDBACK.md` (`POST /feedback`, `GET /feedback`, modèle `Feedback`) : plus de remontée anonyme sans réponse, tout passe désormais par un ticket lié à un compte Clerk, avec échange possible. Le front a retiré `FeedbackDialog` de `/chat-analyzer` et `/admin/feedback`.

- **Merci de supprimer les endpoints `POST /feedback` / `GET /feedback`** et la table `Feedback` une fois cette feature livrée (plus aucun appelant côté front).
- Si des messages existants dans `Feedback` doivent être conservés pour archive, c'est au backend de voir — le front n'en a plus besoin.

## La feature (front)

- `/support` (nouvelle route top-level, hors `[server]`, protégée par `auth.protect()` comme `/chat-analyzer` n'est pas mais comme `/profile` l'est) : liste des tickets de l'utilisateur connecté + bouton "Nouveau ticket" (type bug/suggestion, sujet court, premier message).
- `/support/[ticketId]` : le fil du ticket (messages utilisateur + admin dans l'ordre chronologique), avec un champ pour répondre.
- `/admin/support` (remplace `/admin/feedback`, même gate `publicMetadata.role === "admin"`) : liste de tous les tickets, tous utilisateurs.
- `/admin/support/[ticketId]` : le fil complet, avec un champ pour répondre en tant qu'admin et un bouton pour clore/rouvrir le ticket.

Contrairement à `Feedback`, ces endpoints nécessitent une session Clerk **côté utilisateur** — même pattern que `/trades`/`/favorites`/`/scan-series`/`/rune-prices` (header `Authorization: Bearer <token>`, token récupéré via `useAuth().getToken()` côté composant).

## Nouveaux modèles

```prisma
enum FeedbackType {
  BUG
  SUGGESTION
}

enum SupportTicketStatus {
  OPEN
  CLOSED
}

model SupportTicket {
  id          Int                 @id @default(autoincrement())
  clerkUserId String
  type        FeedbackType
  subject     String
  status      SupportTicketStatus @default(OPEN)
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  messages    SupportMessage[]

  @@index([clerkUserId])
}

model SupportMessage {
  id          Int      @id @default(autoincrement())
  ticketId    Int
  clerkUserId String
  isAdmin     Boolean  @default(false)
  message     String
  createdAt   DateTime @default(now())

  ticket      SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId])
}
```

- Un `SupportTicket` se crée toujours avec son premier `SupportMessage` (pas de ticket sans message).
- `status` par défaut `OPEN`. Poster un message ne change pas le statut automatiquement (ni pour l'utilisateur ni pour l'admin) — seul `PATCH /support/tickets/:id` le change explicitement. Un utilisateur peut répondre sur un ticket `CLOSED` (ça ne le rouvre pas tout seul, volontairement simple pour une première version — pas de logique d'auto-réouverture).
- Pas de nom/pseudo stocké sur le ticket ou le message : `clerkUserId` suffit, le front résout l'affichage (nom Clerk) lui-même côté `/admin` via `clerkClient()` (API Clerk Next.js, pas besoin que le backend le fournisse).

## Endpoints demandés

Toutes les routes ci-dessous suivent le même pattern d'erreur que `/favorites`/`/trades` : `401` si `Authorization` absent/invalide → `{ "success": false, "error": "Authentication required" }`.

### 1. `POST /support/tickets` — créer un ticket (utilisateur)

**Headers**: `Authorization: Bearer <token>`

**Body**

```json
{
  "type": "bug",
  "subject": "Le drag and drop ne fonctionne pas",
  "message": "Sur Firefox, déposer un screenshot ne déclenche rien."
}
```

**Réponse `201`**

```json
{
  "success": true,
  "data": {
    "id": 3,
    "clerkUserId": "user_abc",
    "type": "bug",
    "subject": "...",
    "status": "open",
    "createdAt": "2026-08-25T10:00:00.000Z",
    "updatedAt": "2026-08-25T10:00:00.000Z",
    "messages": [
      {
        "id": 7,
        "ticketId": 3,
        "clerkUserId": "user_abc",
        "isAdmin": false,
        "message": "...",
        "createdAt": "2026-08-25T10:00:00.000Z"
      }
    ]
  }
}
```

**Erreurs `400`**: `type` absent/hors `["bug","suggestion"]`, `subject` vide (limite raisonnable, ex. 200 caractères), `message` vide.

### 2. `GET /support/tickets` — mes tickets (utilisateur)

Filtré sur le `clerkUserId` du token — jamais les tickets d'un autre utilisateur. Triés par `updatedAt` décroissant (un ticket qui vient de recevoir une réponse remonte en haut, comme une boîte de discussion). Ne renvoie pas les messages imbriqués (liste = juste le résumé : `id`, `type`, `subject`, `status`, `createdAt`, `updatedAt`, et éventuellement un `messageCount`) — le détail vient de l'endpoint suivant.

### 3. `GET /support/tickets/:id` — détail d'un ticket (utilisateur)

Vérifie que `ticket.clerkUserId === token.clerkUserId`, sinon `404` (pas `403` — ne pas révéler qu'un ticket avec cet id existe pour quelqu'un d'autre, même logique que le reste de l'API). Renvoie le ticket avec `messages` triés par `createdAt` croissant.

### 4. `POST /support/tickets/:id/messages` — répondre (utilisateur)

**Body**: `{ "message": "..." }`. Même vérification de propriété que `GET /support/tickets/:id` (404 si pas le sien). `clerkUserId`/`isAdmin: false` déduits du token, pas du body. Répondre bump `SupportTicket.updatedAt`.

**Réponse `201`**: le `SupportMessage` créé.

### 5. `GET /support/tickets/admin` — tous les tickets (admin)

**Point d'attention identique à `GET /feedback` aujourd'hui** (cf. `docs/BACKEND_CHAT_ANALYZER_FEEDBACK.md`) : pas d'auth backend dédiée admin, la protection est uniquement côté Next.js (`/admin` gaté par `publicMetadata.role === "admin"`, cf. `src/app/[locale]/(app)/admin/layout.tsx`). À soulever si ça pose problème — cette feature expose maintenant des échanges utilisateur, pas juste des signalements anonymes, donc le risque est plus élevé qu'avant. Si le backend veut un minimum de garde-fou, un header partagé simple (ex. `X-Admin-Secret`) suffirait pour une première version — à voir avec le backend, pas imposé ici.

Triés par `updatedAt` décroissant, mêmes champs résumé que `GET /support/tickets` (sans les messages imbriqués).

### 6. `GET /support/tickets/admin/:id` — détail (admin)

Comme `GET /support/tickets/:id` mais sans filtre de propriétaire (tous les tickets sont visibles depuis `/admin`).

### 7. `POST /support/tickets/admin/:id/messages` — répondre en tant qu'admin

**Body**: `{ "message": "...", "clerkUserId": "user_xyz_admin" }` — `clerkUserId` de l'admin transmis explicitement dans le body (pas de token à décoder côté admin faute d'auth backend dédiée, cf. point ci-dessus ; le front l'obtient via `currentUser()` côté Server Component, page déjà gatée). `isAdmin: true` forcé côté backend, jamais lu depuis le body. Bump `SupportTicket.updatedAt`.

### 8. `PATCH /support/tickets/admin/:id` — clore/rouvrir (admin)

**Body**: `{ "status": "closed" }` ou `{ "status": "open" }`.

### 9. `DELETE /support/tickets/admin/:id` — supprimer un ticket (admin)

Modération : permet de supprimer un ticket contenant des insultes ou autre contenu abusif. Supprime le ticket **et tous ses messages** (`onDelete: Cascade` sur `SupportMessage.ticketId`, cf. schéma). Pas de soft-delete/corbeille pour une première version — suppression définitive, cohérent avec l'absence de `DELETE` ailleurs dans l'API qui reste simple.

**Réponse `200`**: `{ "success": true }` (ou `204` sans corps, au choix du backend).

Pas de `DELETE` côté utilisateur (seul l'admin peut supprimer) — un utilisateur qui veut retirer son propre ticket n'a pas ce besoin identifié pour l'instant.

## Ce qui n'est PAS demandé (pour cadrer)

- **Pas de notification** (email/push) quand une réponse arrive — l'utilisateur doit revenir sur `/support` pour voir. À ajouter plus tard si le besoin se confirme.
- **Pas de pièces jointes** sur les messages (texte seul).
- **Pas de pagination** sur les listes — volume attendu faible pour une première version, même raisonnement que `/feedback`/`/scan-series`.
- **Pas de suppression unitaire d'un message** (seulement le ticket entier) — un message isolé abusif dans un ticket par ailleurs légitime n'est pas un cas anticipé ici.

## Documentation à mettre à jour

`docs/API.md` (backend) : remplacer la section "Feedback" par une section "Tickets de support", suivant le format des sections "Achats/Reventes"/"Suivis de scans".

## Côté front, une fois livré

Pas fait maintenant (en attente du backend) :

- `src/core/presentation/services/support.service.ts` : `createTicket`, `fetchMyTickets`, `fetchTicket`, `postMessage` (auth Bearer, pattern `trades.service.ts`) + `fetchAllTicketsAdmin`, `fetchTicketAdmin`, `postAdminReply`, `updateTicketStatus`, `deleteTicketAdmin` (pas de Bearer, pattern `feedback.service.ts` actuel).
- `/support` (layout `auth.protect()` + liste + dialog de création) et `/support/[ticketId]` (fil + réponse).
- `/admin/support` (liste, remplace `/admin/feedback`) et `/admin/support/[ticketId]` (fil + réponse admin + clore/rouvrir + suppression), avec résolution du nom d'utilisateur via `clerkClient().users.getUser(clerkUserId)` (API Clerk Next.js, pas de champ nom côté backend). `DeleteTicketButton` (confirmation navigateur, redirige vers la liste si supprimé depuis le détail) partagé entre la liste et le détail.
- Lien "Support" dans la `Navbar` (visible si connecté) + retrait de `FeedbackDialog` sur `/chat-analyzer`.
- Textes à traduire (`/support` est vu par tout utilisateur connecté, donc traduit comme `/profile`) dans `messages/{fr,en,es}.json`, clé racine `Support` — `/admin/support` reste français uniquement comme le reste de `/admin`.
