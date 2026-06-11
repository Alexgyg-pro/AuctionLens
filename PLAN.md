# AuctionLens — Plan d'architecture et de développement

> Document de référence. Le développement se fait phase par phase (voir §4).
> Statut : **EPIC 7 (scan & reconnaissance d'image) terminée** le 2026-06-11 — EPIC 1 à 6 validées et releasées. Phase 5 complète, en attente de recette PO (le scan caméra réel reste à vérifier en conditions réelles).
> Prochaine étape : **EPIC 8** (finitions & durcissement — Phase 6).
> Releases GitHub : merge `develop` → `main` + push en fin d'EPIC validée (branche distante unique : `main`).

## Contexte

AuctionLens est une plateforme SaaS B2B pour cabinets de commissaires-priseurs : elle enrichit les ventes aux enchères physiques d'une couche numérique. L'acheteur en salle scanne avec son smartphone une photo du catalogue papier et accède aux ressources enrichies du lot (photos HD, vidéos, expertises, articles de presse, rapports d'authentification).

La brique de reconnaissance d'image existe déjà : `evision/` contient le composant React `<ImageRecognizer>` (TensorFlow.js / MobileNet v2, similarité cosinus), **terminé et intangible**. Tout le reste est à construire.

**Décisions produit validées :**
- Accès acheteur **anonyme** via URL publique par vente — aucun compte acheteur. Deux conventions d'impression dans le catalogue : **1/** un **QR code unique** vers l'URL de la vente, imprimé sur la page d'informations pratiques du catalogue (dates, adresses — typiquement page 3), où il n'est pas choquant ; **2/** le scan se fait ensuite directement sur les **images des lots**, une **petite icône discrète** à côté d'une image signalant qu'elle est scannable. La plateforme fournit ces deux assets (QR généré + icône, avec consigne d'usage) dans le studio pour garantir une convention visuelle commune à tous les catalogues.
- Cycle de vie d'une vente : **Brouillon → Publiée → Archivée**.
- Abonnements simulés avec **plans à quotas réellement appliqués** (nb ventes actives, nb lots, stockage).

---

## 1. Architecture globale

### 1.1 Organisation du dépôt (monorepo simple)

```
AuctionLens/
  client/          ← React + Vite (une seule SPA, 3 espaces)
  server/          ← Node.js / Express + SQLite
  evision/         ← brique existante, INTANGIBLE (source du composant copié dans client/)
  CLAUDE.md
```

Deux processus en développement : Vite (client, port 5173) et Express (server, port 3000), avec proxy Vite `/api` et `/uploads` → Express. En production locale : Express sert le build statique du client.

### 1.2 Une SPA, trois espaces

| Espace | URL | Auth | Rôle |
|--------|-----|------|------|
| Acheteur | `/v/:saleSlug` | Aucune | Scan caméra + consultation des lots enrichis |
| Cabinet | `/studio/*` | Session cabinet | CRUD ventes, lots, images de référence, ressources |
| Admin | `/admin/*` | Session admin | Gestion cabinets, plans, abonnements |

Un seul build, routage côté client. L'espace acheteur est le seul à charger TensorFlow.js (import dynamique / route lazy — voir §5.1).

### 1.3 Rôles et permissions (côté serveur)

Deux rôles authentifiés stockés dans `User.role` : `admin` et `cabinet`. L'acheteur n'est pas un rôle : c'est un accès public en lecture seule, limité aux ventes `published`.

Règles d'autorisation, appliquées par middlewares Express :

- `requireAuth` : session valide requise.
- `requireAdmin` : `role === 'admin'`.
- `requireCabinet` : `role === 'cabinet'` **et cabinet actif** (abonnement non suspendu).
- **Cloisonnement des données (règle d'or)** : un utilisateur cabinet ne lit/modifie que les entités dont la chaîne de propriété remonte à *son* `cabinet_id`. Vérifié systématiquement côté serveur (jamais seulement côté client) : tout accès à un lot vérifie `lot.sale.cabinet_id === session.cabinetId`, etc.
- Routes publiques : uniquement `GET` sur ventes publiées et leurs contenus, recherche par slug.

Authentification : sessions par cookie HTTP-only (`express-session` + store SQLite), mots de passe hashés (bcrypt). Pas de JWT — inutile pour une SPA même-origine, et les sessions sont révocables (suspension d'un cabinet effective immédiatement).

### 1.4 Flux de données acheteur (cœur du produit)

```
1. Acheteur ouvre /v/:saleSlug (QR code en page d'informations du catalogue)
2. GET /api/public/sales/:slug/recognition-manifest
   → { threshold, references: [{ id: imageRefId, src: url, lotId }] }
3. <ImageRecognizer references={…} onImageRecognized={…}>
4. Callback {id, score} → mapping local imageRefId → lotId
5. GET /api/public/lots/:lotId → fiche lot + ressources enrichies
```

Le mapping `imageRef.id → lot.id` vit côté client, construit depuis le manifeste. Le composant eVision ne connaît que des `{id, src}` — c'est l'application hôte qui fait la traduction vers le lot, conformément au contrat du composant.

---

## 2. Modèle de données (SQLite)

### 2.1 Schéma

```
Plan 1──n Cabinet 1──n Sale 1──n Lot 1──n ImageReference
                                      1──n Resource
User n──1 Cabinet (nullable pour les admins)
```

### 2.2 Tables

**`plans`** — plans d'abonnement (données de référence, seedées)
| Champ | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | « Essentiel », « Pro » |
| max_active_sales | INTEGER | ventes au statut `published` simultanées |
| max_lots_per_sale | INTEGER | |
| max_storage_mb | INTEGER | quota fichiers uploadés (refs + ressources) |
| price_monthly | REAL | affichage seulement (paiement simulé) |

**`cabinets`** — clients B2B
| Champ | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | raison sociale |
| contact_email | TEXT | |
| plan_id | INTEGER FK → plans | assigné par l'admin |
| subscription_status | TEXT | `active` \| `suspended` — suspendu = studio bloqué ET ventes invisibles côté public |
| subscription_expires_at | TEXT (ISO) | échéance simulée, renouvelée par l'admin |
| created_at | TEXT | |

**`users`** — comptes authentifiés (admins + utilisateurs cabinet)
| Champ | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| email | TEXT UNIQUE | identifiant de connexion |
| password_hash | TEXT | bcrypt |
| role | TEXT | `admin` \| `cabinet` |
| cabinet_id | INTEGER FK nullable | NULL pour les admins ; v1 : 1 user par cabinet, le schéma permet déjà plusieurs |
| created_at | TEXT | |

**`sales`** — événements-ventes
| Champ | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| cabinet_id | INTEGER FK → cabinets | |
| title | TEXT | |
| slug | TEXT UNIQUE | URL publique `/v/:slug`, généré depuis le titre + suffixe anti-collision, **figé à la première publication** (le QR imprimé pointe dessus) |
| description | TEXT | |
| event_date | TEXT | date de la vente physique (information, pas d'automatisme) |
| location | TEXT | |
| status | TEXT | `draft` \| `published` \| `archived` |
| recognition_threshold | REAL DEFAULT 0.55 | seuil eVision calibrable par vente (cf. README eVision : 0.50–0.60 pour images imprimées) |
| created_at, updated_at | TEXT | |

**`lots`** — œuvres/objets d'une vente
| Champ | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| sale_id | INTEGER FK → sales | |
| lot_number | TEXT | numéro catalogue (« 12 », « 12bis ») — UNIQUE par vente |
| title | TEXT | |
| artist | TEXT | |
| description | TEXT | notice catalogue |
| estimate_low, estimate_high | REAL | estimation |
| sort_order | INTEGER | ordre catalogue |
| created_at, updated_at | TEXT | |

**`image_references`** — images du catalogue à reconnaître. **Relation n→1 vers `lots`** : un lot important photographié sous 3 vues dans le catalogue a 3 lignes ici, toutes pointant vers le même lot.
| Champ | Type | Notes |
|---|---|---|
| id | INTEGER PK | c'est cet id qui devient le `id` du tableau `references` d'eVision |
| lot_id | INTEGER FK → lots | **many-to-one** |
| file_path | TEXT | chemin relatif sous `server/uploads/` |
| width, height | INTEGER | contrôle qualité (≥ 224×224 requis par MobileNet) |
| file_size | INTEGER | octets, pour le quota stockage |
| is_active | INTEGER (bool) | permet d'exclure une image du manifeste sans la supprimer (ex. : image qui génère des faux positifs) |
| label | TEXT | repère pour le cabinet (« vue de face », « détail signature ») |
| created_at | TEXT | |

**`resources`** — contenus enrichis d'un lot
| Champ | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| lot_id | INTEGER FK → lots | |
| type | TEXT | `image_hd` \| `video` \| `pdf` \| `text` \| `link` |
| title | TEXT | |
| body | TEXT nullable | contenu pour `text` (expertise rédigée), URL pour `link` (article de presse, vidéo YouTube) |
| file_path | TEXT nullable | pour `image_hd` / `video` / `pdf` uploadés |
| file_size | INTEGER | quota stockage |
| mime_type | TEXT | |
| sort_order | INTEGER | ordre d'affichage sur la fiche lot |
| created_at | TEXT | |

### 2.3 Règles d'intégrité

- FK avec `ON DELETE CASCADE` descendant (supprimer un lot supprime ses image_references et resources ; les fichiers physiques sont supprimés dans la même transaction applicative).
- `PRAGMA foreign_keys = ON` à chaque connexion (SQLite ne l'active pas par défaut).
- Quotas vérifiés à l'écriture côté serveur : publication d'une vente (max_active_sales), création de lot (max_lots_per_sale), tout upload (max_storage_mb, calculé par `SUM(file_size)` des refs + ressources du cabinet).
- Migrations : simple dossier `server/db/migrations/` de fichiers SQL numérotés, appliqués au démarrage (table `schema_migrations`). Pas d'ORM lourd ; `better-sqlite3` (API synchrone, idéale avec Express).

---

## 3. API REST

Préfixe `/api`. Conventions : JSON, erreurs `{ error: { code, message } }`, codes HTTP standards (401 non authentifié, 403 interdit/quota, 404 inexistant *ou hors périmètre du cabinet* — ne pas révéler l'existence des données d'autrui).

### 3.1 Auth — `/api/auth`
| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | `/auth/login` | public | email + mot de passe → session cookie |
| POST | `/auth/logout` | session | détruit la session |
| GET | `/auth/me` | session | utilisateur courant + rôle + cabinet (et son plan/statut) |

### 3.2 Admin — `/api/admin` (requireAdmin)
| Méthode | Route | Description |
|---|---|---|
| GET | `/admin/plans` | liste des plans |
| GET / POST | `/admin/cabinets` | liste / création d'un cabinet **+ son premier utilisateur** (email + mdp provisoire) |
| GET / PUT | `/admin/cabinets/:id` | détail (avec consommation des quotas) / modification (nom, plan_id) |
| PUT | `/admin/cabinets/:id/subscription` | statut `active`/`suspended` + échéance (simulation d'abonnement) |

### 3.3 Studio cabinet — `/api/studio` (requireCabinet, cloisonné par cabinet_id)

**Ventes**
| Méthode | Route | Description |
|---|---|---|
| GET / POST | `/studio/sales` | liste / création (statut `draft`) |
| GET / PUT / DELETE | `/studio/sales/:id` | détail / modification / suppression (draft uniquement) |
| PUT | `/studio/sales/:id/status` | transitions `draft→published` (vérifie quota max_active_sales + ≥1 lot avec ≥1 image active), `published→archived`, `archived→published` |

**Lots**
| Méthode | Route | Description |
|---|---|---|
| GET / POST | `/studio/sales/:saleId/lots` | liste / création (quota max_lots_per_sale) |
| GET / PUT / DELETE | `/studio/lots/:id` | détail (avec ses images et ressources) / modification / suppression |

**Images de référence**
| Méthode | Route | Description |
|---|---|---|
| POST | `/studio/lots/:lotId/image-references` | upload multipart (JPEG/PNG, validation dimensions ≥ 224×224, quota stockage) |
| PUT | `/studio/image-references/:id` | label, is_active |
| DELETE | `/studio/image-references/:id` | supprime ligne + fichier |

**Ressources**
| Méthode | Route | Description |
|---|---|---|
| GET / POST | `/studio/lots/:lotId/resources` | liste / création — multipart pour fichiers (`image_hd`/`video`/`pdf`), JSON pour `text`/`link` |
| PUT / DELETE | `/studio/resources/:id` | modification (titre, body, sort_order) / suppression |

### 3.4 Public acheteur — `/api/public` (anonyme, lecture seule, ventes `published` de cabinets `active` uniquement)
| Méthode | Route | Description |
|---|---|---|
| GET | `/public/sales/:slug` | infos vente (titre, cabinet, date, lieu) + liste sommaire des lots (consultation manuelle sans scan, et fallback si caméra refusée) |
| GET | `/public/sales/:slug/recognition-manifest` | **endpoint clé** : `{ threshold, references: [{ id, src, lotId }] }` — toutes les images de référence actives de la vente |
| GET | `/public/lots/:id` | fiche lot complète + ressources triées (404 si la vente n'est pas publiée) |

### 3.5 Fichiers
- `GET /uploads/*` : fichiers servis statiquement par Express. Les refs et ressources de ventes publiées sont publiques par nature (le catalogue papier l'est aussi) — pas de contrôle d'accès fichier en v1, mais chemins non devinables (nom de fichier = id aléatoire).

---

## 4. Découpage en phases

Chaque phase livre un système **fonctionnel et démontrable** de bout en bout.

### Phase 0 — Socle technique
**Construit :** monorepo `client/` + `server/` ; Express + better-sqlite3 + système de migrations + seed (1 admin, 2 plans) ; SPA Vite avec routage 3 espaces (pages vides) ; proxy dev ; healthcheck `GET /api/health` ; conventions Git du projet (reprise du flux feature → develop → main d'eVision).
**Reporté :** tout le métier.
**Démontrable :** les deux serveurs tournent, la SPA s'affiche, l'API répond.

### Phase 1 — Auth & administration des cabinets
**Construit :** tables `plans`, `cabinets`, `users` ; sessions + login/logout ; middlewares de rôles ; espace admin : CRUD cabinets, assignation de plan, activation/suspension d'abonnement ; page de login commune ; garde de routes côté client.
**Reporté :** quotas appliqués (les plans existent mais rien ne les consomme encore), ventes/lots.
**Démontrable :** l'admin crée un cabinet avec son compte ; le cabinet se connecte et voit un studio vide ; un cabinet suspendu ne peut plus se connecter au studio.

### Phase 2 — Studio : ventes et lots (sans fichiers)
**Construit :** tables `sales`, `lots` ; CRUD complet côté API et UI studio ; cycle de vie draft/published/archived avec règles de transition ; génération et gel du slug ; cloisonnement par cabinet testé ; application des quotas max_active_sales et max_lots_per_sale.
**Reporté :** images, ressources, tout le côté public.
**Démontrable :** un cabinet crée une vente, ses lots, la publie ; les quotas bloquent au-delà du plan.

### Phase 3 — Uploads : images de référence et ressources
**Construit :** infrastructure upload (multer, stockage `server/uploads/<cabinetId>/…`, noms aléatoires, validation type/taille/dimensions) ; tables `image_references` (n→1 lot) et `resources` ; UI studio : ajout de plusieurs images de référence par lot avec label et toggle actif, gestion des ressources (upload fichier ou saisie texte/lien, réordonnancement) ; quota stockage appliqué ; suppression en cascade fichiers + BDD.
**Reporté :** consultation publique, reconnaissance.
**Démontrable :** un lot porte 3 images de référence et 5 ressources de types variés ; le quota stockage bloque.

### Phase 4 — Espace acheteur : consultation publique
**Construit :** routes `/api/public/*` (sauf manifeste) ; pages publiques responsive : `/v/:slug` (en-tête vente + liste des lots) et fiche lot avec ses ressources (visionneuse image HD, lecteur vidéo, lien PDF, textes) ; filtrage strict published/active ; règle de publication « ≥ 1 lot avec ≥ 1 image active ».
**Reporté :** le scan caméra.
**Démontrable :** sur smartphone, un acheteur anonyme parcourt une vente publiée et consulte les fiches enrichies. **Le produit a déjà de la valeur sans le scan** — c'est le filet de sécurité si la reconnaissance déçoit en conditions réelles.

### Phase 5 — Intégration eVision : le scan
**Construit :** copie du composant `ImageRecognizer` (+ CSS + script `copy-wasm.mjs` + fichiers `public/tfwasm/`) d'`evision/` vers `client/` **sans modification** ; endpoint `recognition-manifest` ; page de scan `/v/:slug/scan` en route lazy (TF.js hors du bundle principal) ; mapping imageRefId → lotId ; à la reconnaissance : redirection vers la fiche lot ; gestion permission caméra refusée (fallback liste) ; champ `recognition_threshold` par vente exposé dans le studio avec mode debug (`debugOverlay`) pour la calibration par le cabinet ; setup HTTPS de dev pour test mobile (`vite --host` + certificat ou ngrok, cf. README eVision) ; kit catalogue dans le studio : QR code de la vente généré et téléchargeable (à imprimer sur la page d'informations pratiques du catalogue) + icône « scannable » (formats vectoriel + PNG, à placer à côté de chaque image scannable), avec consignes d'usage.
**Reporté :** raffinements UX du scan.
**Démontrable :** scan d'une page de catalogue imprimée → fiche du lot en < 2 s après reconnaissance ; deux photos différentes du même lot mènent à la même fiche.

### Phase 6 — Finitions et durcissement
**Construit :** tableau de bord cabinet (consommation quotas) ; page admin de vue d'ensemble ; écrans d'erreur et états de chargement (notamment les 5–15 s de chargement MobileNet : écran d'attente explicite) ; validation d'entrées systématique ; rate limiting sur `/auth/login` ; tests automatisés des règles critiques (cloisonnement, quotas, transitions de statut, manifeste) ; documentation de déploiement.
**Reporté (hors périmètre v1) :** vrai paiement, multi-utilisateurs par cabinet (le schéma le permet déjà), statistiques de scan, PWA/offline, migration PostgreSQL + stockage objet.

---

## 5. Points d'attention techniques

### 5.1 Intégration d'ImageRecognizer (intangible)
- **Copie, pas import cross-projet** : le composant et ses assets (`tfwasm/`) sont copiés tels quels dans `client/`. `evision/` reste la source de vérité de référence. Dépendances TF.js reprises de `evision/package.json` aux mêmes versions.
- **Contrat respecté** : on lui fournit `references=[{id, src}]` où `id` = `image_references.id` (en chaîne) et `src` = URL `/uploads/...`. La logique métier (id → lot) reste dans la page hôte. Le `threshold` vient de `sale.recognition_threshold`.
- **WASM** : les fichiers `public/tfwasm/` doivent être servis à la racine du site client (reprendre le mécanisme `scripts/copy-wasm.mjs`).
- **Poids** : TF.js + MobileNet ne doivent charger que sur la route `/v/:slug/scan` (lazy). Première visite : 5–15 s de chargement modèle → UX d'attente obligatoire.
- **Volume de références** : une vente de 200 lots × 2-3 images = ~500 embeddings à précalculer au montage. Acceptable pour la v1 ; si problème, levier produit = scan par section de catalogue (pas de modification du composant).

### 5.2 Images de référence côté serveur
- Validation à l'upload : JPEG/PNG, ≥ 224×224 px (exigence MobileNet), taille max raisonnable (~10 Mo). Les conseils qualité du README eVision (fond neutre, objet 60-80 % du cadre) sont affichés dans l'UI d'upload du studio.
- `is_active` permet de retirer du manifeste une image qui crée des faux positifs, sans la supprimer.
- Le manifeste ne sert que les images actives de lots de la vente demandée, vente publiée, cabinet actif.

### 5.3 Uploads de ressources
- `multer` en stockage disque, arborescence par cabinet, noms de fichiers aléatoires (UUID + extension).
- Limites par type : image ~15 Mo, PDF ~30 Mo, vidéo ~200 Mo (et privilégier `type=link` vers YouTube/Vimeo pour les vidéos lourdes — recommandation affichée dans l'UI).
- Quota stockage du plan vérifié avant écriture ; `file_size` persisté pour le calcul.
- Suppression : transaction applicative BDD puis fichier (et job de cohérence simple en cas d'orphelins).

### 5.4 HTTPS et caméra mobile
- `getUserMedia` exige HTTPS (ou localhost). En dev, le scan ne se teste sur smartphone que via tunnel (ngrok) ou certificat local + `--host`. À documenter en Phase 5 ; prévoir un message clair côté UI si le contexte n'est pas sécurisé.
- Safari iOS : l'accès caméra peut exiger une interaction utilisateur préalable → la page de scan démarre sur un bouton « Activer la caméra », jamais en auto-start.

### 5.5 SQLite provisoire
- `better-sqlite3`, WAL activé, FK ON. Suffisant pour la cible (dizaines de cabinets).
- Discipline pour la migration future PostgreSQL : pas de SQL exotique SQLite, dates en ISO 8601 TEXT, accès BDD centralisés dans une couche `server/db/` (pas de SQL dans les routes).

---

## 6. Vérification globale (fil rouge de recette)

Scénario de recette complet rejoué à la fin de chaque phase (sur la partie déjà construite) :
1. L'admin crée le cabinet « Études Martin » sur le plan Essentiel, avec son compte utilisateur.
2. Le cabinet se connecte, crée la vente « Tableaux anciens — juin 2026 », y ajoute 3 lots.
3. Il uploade 2 images de référence pour le lot 1 (deux vues) et des ressources variées sur chaque lot.
4. Il publie la vente → URL `/v/tableaux-anciens-juin-2026`.
5. Sur smartphone (HTTPS), un acheteur anonyme ouvre l'URL, consulte la liste, puis scanne l'une **ou l'autre** des deux vues imprimées du lot 1 → même fiche enrichie.
6. L'admin suspend le cabinet → l'URL publique devient 404, le studio est bloqué.
7. Les quotas du plan bloquent la 2ᵉ vente publiée simultanée (si plan Essentiel = 1 vente active).
