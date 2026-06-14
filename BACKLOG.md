# AuctionLens — Backlog produit

> Document vivant, propriété du Product Owner.
> Référence architecture : `PLAN.md`. Chaque EPIC est rattachée à une phase du plan.
>
> **Personas :**
> - **Admin** — administrateur de la plateforme (nous).
> - **Cabinet** — utilisateur d'un cabinet de commissaires-priseurs (client B2B).
> - **Acheteur** — visiteur anonyme sur smartphone, en salle des ventes ou chez lui.

## Definition of Done (commune à toutes les US)

- Les conditions d'acceptation de l'US sont toutes vérifiées manuellement.
- Les règles de sécurité s'appliquent côté serveur (jamais uniquement côté client).
- Le cloisonnement par cabinet est respecté pour toute donnée touchée.
- L'UI concernée est responsive (mobile-first pour l'espace acheteur).
- Le code est mergé sur `develop` via une branche `feature/<nom>`.

---

## EPIC 1 — Socle technique *(Phase 0)*

> Mettre en place le monorepo, le serveur, la base et la SPA pour que tout le reste puisse se construire dessus.

### US-1.1 — Démarrage de l'environnement
**En tant que** développeur, **je veux** démarrer le client et le serveur avec une commande chacun, **afin de** travailler sur une base saine et reproductible.

Conditions d'acceptation :
- [x] Étant donné un clone du dépôt, quand je lance l'installation puis le serveur et le client, alors la SPA s'affiche sur `http://localhost:5173` et `GET /api/health` répond `200`. *(Affichage validé par le PO le 2026-06-11.)*
- [x] Les appels `/api/*` et `/uploads/*` du client sont proxyfiés vers Express en développement.
- [x] La base SQLite est créée automatiquement au premier démarrage, migrations appliquées (table `schema_migrations` renseignée).
- [x] Le dossier `evision/` n'est ni modifié ni référencé par le build.

### US-1.2 — Données initiales (seed)
**En tant que** développeur, **je veux** une base seedée avec un compte admin et deux plans, **afin de** pouvoir tester sans saisie manuelle préalable.

Conditions d'acceptation :
- [x] Après le seed, un admin peut se connecter avec des identifiants documentés dans le README. *(Compte créé et documenté ; la connexion elle-même arrive avec l'US-2.1.)*
- [x] Les plans « Essentiel » et « Pro » existent avec leurs quotas (`max_active_sales`, `max_lots_per_sale`, `max_storage_mb`) et un prix d'affichage.
- [x] Relancer le seed ne duplique pas les données (idempotent).

---

## EPIC 2 — Authentification & rôles *(Phase 1)*

> Permettre aux admins et aux cabinets de se connecter, et protéger chaque espace selon le rôle.

### US-2.1 — Connexion
**En tant qu'**utilisateur (admin ou cabinet), **je veux** me connecter avec mon email et mon mot de passe, **afin d'** accéder à mon espace.

Conditions d'acceptation :
- [x] Étant donné des identifiants valides, quand je me connecte, alors une session est créée (cookie HTTP-only) et je suis redirigé vers mon espace (`/admin` ou `/studio` selon le rôle).
- [x] Étant donné des identifiants invalides, quand je me connecte, alors un message d'erreur générique s'affiche (sans révéler si l'email existe).
- [x] Les mots de passe sont stockés hashés (bcrypt) — jamais en clair, jamais renvoyés par l'API.

### US-2.2 — Déconnexion et session
**En tant qu'**utilisateur connecté, **je veux** me déconnecter, **afin de** protéger mon compte sur un poste partagé.

Conditions d'acceptation :
- [x] Quand je me déconnecte, alors la session est détruite côté serveur et toute requête suivante sur une route protégée répond `401`.
- [x] `GET /api/auth/me` renvoie mon rôle et, pour un cabinet, son plan et son statut d'abonnement.

### US-2.3 — Protection des espaces
**En tant que** plateforme, **je veux** que chaque route soit réservée à son rôle, **afin qu'**aucun utilisateur n'accède aux données d'un autre.

Conditions d'acceptation :
- [x] Étant donné un utilisateur cabinet, quand il appelle une route `/api/admin/*`, alors la réponse est `403`.
- [x] Étant donné un visiteur non connecté, quand il appelle une route `/api/studio/*` ou `/api/admin/*`, alors la réponse est `401`.
- [x] Étant donné un cabinet A, quand il tente d'accéder à une vente, un lot, une image ou une ressource du cabinet B (par id direct), alors la réponse est `404`. *(Vérifié pour ventes et lots à l'EPIC 4 ; images et ressources suivront le même helper à l'EPIC 5.)*

---

## EPIC 3 — Administration des cabinets & abonnements simulés *(Phase 1)*

> Donner à l'admin les moyens de gérer le cycle de vie commercial des cabinets.

### US-3.1 — Création d'un cabinet
**En tant qu'**Admin, **je veux** créer un cabinet avec son premier compte utilisateur et son plan, **afin d'**onboarder un nouveau client.

Conditions d'acceptation :
- [x] Quand je crée un cabinet (nom, email de contact, plan, email + mot de passe provisoire du premier utilisateur), alors le cabinet apparaît dans la liste et son utilisateur peut se connecter au studio.
- [x] Un email d'utilisateur déjà pris est refusé avec un message clair.
- [x] Le cabinet est créé avec le statut `active` et une date d'échéance d'abonnement.

### US-3.2 — Suivi et modification d'un cabinet
**En tant qu'**Admin, **je veux** consulter le détail d'un cabinet (plan, consommation des quotas) et le modifier, **afin de** suivre mes clients.

Conditions d'acceptation :
- [x] La fiche cabinet affiche : plan courant, statut, échéance, nombre de ventes actives, nombre total de lots, stockage consommé en Mo. *(Compteurs à 0 tant que ventes/lots n'existent pas — deviendront réels à l'EPIC 4 sans changement de code.)*
- [x] Quand je change le plan d'un cabinet, alors les nouveaux quotas s'appliquent immédiatement aux prochaines actions (sans casser l'existant qui dépasse).

### US-3.3 — Suspension / réactivation
**En tant qu'**Admin, **je veux** suspendre ou réactiver l'abonnement d'un cabinet, **afin de** simuler les impayés et résiliations.

Conditions d'acceptation :
- [x] Étant donné un cabinet suspendu, quand son utilisateur tente d'utiliser le studio, alors l'accès est bloqué avec un message explicite (la session existante ne suffit pas : vérifié à chaque requête).
- [x] Étant donné un cabinet suspendu, quand un acheteur ouvre l'URL publique d'une de ses ventes publiées, alors la réponse est `404`. *(Vérifié à l'EPIC 6 — `check-public.mjs`.)*
- [x] Quand je réactive le cabinet, alors le studio et les URLs publiques refonctionnent sans autre action. *(Studio vérifié à l'EPIC 3 ; URLs publiques à l'EPIC 6.)*

---

## EPIC 4 — Gestion des ventes & lots *(Phase 2)*

> Permettre au cabinet de préparer son catalogue numérique : ventes, lots, cycle de publication.

### US-4.1 — Création et édition d'une vente
**En tant que** Cabinet, **je veux** créer une vente (titre, description, date de l'événement, lieu), **afin de** préparer sa couche numérique.

Conditions d'acceptation :
- [x] Quand je crée une vente, alors elle est en statut `draft` et invisible des acheteurs.
- [x] Un slug court est généré depuis le titre ; en cas de collision un suffixe est ajouté.
- [x] Je peux modifier les informations d'une vente ; je ne peux supprimer une vente que si elle est en `draft`.

### US-4.2 — Cycle de vie d'une vente
**En tant que** Cabinet, **je veux** publier, archiver et republier une vente, **afin de** contrôler ce que voient les acheteurs.

Conditions d'acceptation :
- [x] Étant donné une vente `draft` avec au moins 1 lot portant au moins 1 image de référence active, quand je la publie, alors elle devient accessible sur `/v/:slug`. *(Règle « ≥ 1 lot » vérifiée à l'EPIC 4 ; la condition « image active » sera ajoutée à l'EPIC 5, l'accessibilité publique à l'EPIC 6.)*
- [x] Étant donné une vente sans lot, quand je tente de la publier, alors la publication est refusée avec un message expliquant la règle.
- [x] Le slug est définitivement figé à la première publication (le QR imprimé pointe dessus) ; modifier le titre ensuite ne le change pas.
- [x] Les transitions autorisées sont exactement : `draft→published`, `published→archived`, `archived→published`.
- [x] Étant donné une vente archivée, quand un acheteur ouvre son URL, alors la réponse est `404`. *(Vérifié à l'EPIC 6 — `check-public.mjs`.)*

### US-4.3 — Gestion des lots
**En tant que** Cabinet, **je veux** ajouter, modifier, ordonner et supprimer les lots d'une vente, **afin de** refléter le catalogue papier.

Conditions d'acceptation :
- [x] Un lot porte : numéro de catalogue, titre, artiste, description, estimation basse/haute, ordre d'affichage.
- [x] Deux lots d'une même vente ne peuvent pas avoir le même numéro de catalogue.
- [x] Quand je supprime un lot, alors ses images de référence et ressources (et leurs fichiers) sont supprimées avec lui. *(Vérifié à l'EPIC 5 : lignes BDD et fichiers disque.)*

---

## EPIC 5 — Images de référence & ressources enrichies *(Phase 3)*

> Alimenter chaque lot avec ce que verra l'acheteur (ressources) et ce que reconnaîtra la caméra (images de référence).

### US-5.1 — Images de référence multiples par lot
**En tant que** Cabinet, **je veux** associer plusieurs images de référence à un même lot, **afin que** chaque vue du catalogue (face, détail, signature…) mène à la même fiche enrichie.

Conditions d'acceptation :
- [x] Quand j'uploade une image (JPEG/PNG) sur un lot, alors elle est acceptée seulement si elle fait au moins 224×224 px ; sinon, message d'erreur expliquant l'exigence.
- [x] Je peux donner un label à chaque image (« vue de face », « détail signature ») et en ajouter plusieurs au même lot.
- [x] L'écran d'upload affiche les conseils qualité (fond neutre, objet 60–80 % du cadre, image nette).
- [x] Je peux désactiver une image (`is_active = false`) sans la supprimer : elle disparaît du manifeste de reconnaissance mais reste visible dans le studio. *(« Hors manifeste » vérifié via la règle de publication ; le manifeste lui-même arrive à l'EPIC 7.)*

### US-5.2 — Ressources enrichies d'un lot
**En tant que** Cabinet, **je veux** attacher à un lot des ressources de types variés, **afin d'**offrir à l'acheteur un contenu qui dépasse le catalogue papier.

Conditions d'acceptation :
- [x] Types supportés : image HD (upload), vidéo (upload), PDF (upload), texte d'expertise (saisie), lien externe (URL — article de presse, YouTube…).
- [x] Chaque ressource a un titre et un ordre d'affichage que je peux modifier.
- [x] Les limites de taille par type sont appliquées et affichées avant l'upload ; pour les vidéos lourdes, l'UI recommande le type « lien ».
- [x] Quand je supprime une ressource, alors son fichier est supprimé du serveur.

### US-5.3 — Quotas du plan appliqués
**En tant qu'**Admin (et en tant que plateforme), **je veux** que les quotas du plan soient réellement bloquants, **afin que** la mécanique d'abonnement ait un sens.

Conditions d'acceptation :
- [x] Étant donné un cabinet au plafond de `max_lots_per_sale`, quand il crée un lot de plus, alors la création est refusée (`403`) avec un message mentionnant le plan. *(Vérifié dès l'EPIC 4.)*
- [x] Étant donné un cabinet au plafond de `max_active_sales`, quand il publie une vente de plus, alors la publication est refusée. *(Vérifié dès l'EPIC 4.)*
- [x] Étant donné un upload qui ferait dépasser `max_storage_mb` (somme des images de référence + ressources du cabinet), alors l'upload est refusé avant l'écriture du fichier. *(Pré-contrôle sur Content-Length avant écriture + contrôle exact sur la taille réelle après.)*
- [x] Le studio affiche la consommation courante des trois quotas.

---

## EPIC 6 — Consultation publique acheteur *(Phase 4)*

> L'acheteur anonyme parcourt la vente et consulte les fiches enrichies — le produit a de la valeur avant même le scan.

### US-6.1 — Page publique d'une vente
**En tant qu'**Acheteur, **je veux** ouvrir l'URL d'une vente (via le QR de la page d'informations du catalogue) et voir la liste de ses lots, **afin de** parcourir le contenu enrichi sans créer de compte.

Conditions d'acceptation :
- [x] Étant donné une vente publiée d'un cabinet actif, quand j'ouvre `/v/:slug`, alors je vois le titre, le cabinet, la date, le lieu et la liste ordonnée des lots (numéro, titre, artiste, estimation).
- [x] Étant donné une vente `draft`, archivée ou d'un cabinet suspendu, quand j'ouvre son URL, alors j'obtiens une page 404 propre (message neutre, sans révéler l'existence de la vente).
- [x] La page est utilisable sur smartphone (consultation à une main, en salle des ventes). *(Conçue mobile-first ; vérification visuelle lors de la recette PO.)*
- [x] Aucune authentification ni donnée personnelle n'est demandée. *(Les routes `/api/public/*` n'exigent aucune session.)*

### US-6.2 — Fiche enrichie d'un lot
**En tant qu'**Acheteur, **je veux** consulter la fiche d'un lot avec toutes ses ressources, **afin de** m'informer avant d'enchérir.

Conditions d'acceptation :
- [x] La fiche affiche la notice du lot puis ses ressources dans l'ordre défini par le cabinet : visionneuse pour les images HD, lecteur pour les vidéos uploadées, lien d'ouverture pour les PDFs, texte mis en forme pour les expertises, lien sortant pour les ressources externes.
- [x] Étant donné un lot dont la vente n'est pas publiée, quand j'accède à sa fiche par URL directe, alors la réponse est `404`. *(Vérifié pour draft, archivée et cabinet suspendu.)*
- [x] Je peux revenir à la liste des lots en un geste. *(Lien « ← Tous les lots » en tête de fiche.)*

---

## EPIC 7 — Scan & reconnaissance d'image *(Phase 5)*

> Le cœur différenciant : scanner l'image du catalogue papier pour ouvrir la fiche du lot, via le composant eVision intégré tel quel.

### US-7.1 — Scanner une image du catalogue
**En tant qu'**Acheteur, **je veux** pointer ma caméra sur une image du catalogue (signalée par la petite icône « scannable »), **afin d'**ouvrir directement la fiche enrichie du lot.

Conditions d'acceptation :
- [x] Depuis la page de la vente, un bouton « Scanner le catalogue » ouvre la page de scan ; la caméra ne démarre qu'après un geste explicite (exigence Safari iOS). *(Le bouton « Activer la caméra » est géré par le composant eVision lui-même.)*
- [x] Étant donné une image de référence active imprimée, quand je la cadre dans le viewfinder, alors la fiche du lot correspondant s'ouvre. *(Recette PO sur ordinateur le 2026-06-12 ; test smartphone validé le 2026-06-14 via tunnel Cloudflare — reconnaissance immédiate, même en conditions dégradées.)*
- [x] Étant donné un lot avec plusieurs images de référence, quand je scanne n'importe laquelle, alors c'est la même fiche qui s'ouvre. *(Équivalence garantie par le manifeste — toutes les vues actives d'un lot pointent vers la même fiche, vérifié par `check-scan.mjs` ; scan smartphone validé le 2026-06-14.)*
- [x] Pendant le chargement du modèle (5–15 s la première fois), un écran d'attente explicite est affiché. *(« Chargement du modèle IA… » + spinner, intégrés au composant.)*
- [x] Le composant `ImageRecognizer` d'eVision est intégré **sans aucune modification** ; TensorFlow.js n'est chargé que sur la route de scan (lazy). *(Copie identique octet pour octet ; TF.js isolé dans le chunk ScanView au build.)*

### US-7.2 — Manifeste de reconnaissance
**En tant que** plateforme, **je veux** livrer au client le mapping des images de référence d'une vente, **afin d'**alimenter le composant de reconnaissance.

Conditions d'acceptation :
- [x] `GET /api/public/sales/:slug/recognition-manifest` renvoie `{ threshold, references: [{ id, src, lotId }] }` avec uniquement les images **actives** des lots de cette vente, vente publiée et cabinet actif. *(Vérifié par `check-scan.mjs`.)*
- [x] Le `threshold` renvoyé est celui configuré sur la vente (`recognition_threshold`, défaut 0.55).
- [x] Après reconnaissance (`onImageRecognized({id})`), le client résout `id → lotId` via le manifeste, sans appel serveur supplémentaire. *(Map construite au chargement de la page de scan.)*

### US-7.3 — Dégradé sans caméra
**En tant qu'**Acheteur ayant refusé (ou ne pouvant pas donner) l'accès caméra, **je veux** être ramené à la consultation par liste, **afin de** ne pas être bloqué.

Conditions d'acceptation :
- [x] Étant donné une permission caméra refusée, quand j'arrive sur la page de scan, alors un message clair propose la consultation par liste (pas d'écran cassé, pas d'erreur technique brute). *(Message du composant + lien permanent « Consultez la liste des lots » sous le scanner.)*
- [x] Étant donné un contexte non sécurisé (HTTP hors localhost), alors un message explique que le scan nécessite HTTPS au lieu d'échouer silencieusement. *(Détection `window.isSecureContext` avant de monter le composant.)*

### US-7.4 — Calibration du seuil par le cabinet
**En tant que** Cabinet, **je veux** régler le seuil de reconnaissance de ma vente et le tester en conditions réelles, **afin de** trouver l'équilibre entre détection et faux positifs sur mon catalogue imprimé.

Conditions d'acceptation :
- [x] Le studio permet de modifier `recognition_threshold` (plage guidée 0.40–0.70, recommandation 0.50–0.60 pour images imprimées affichée à l'écran). *(Validation serveur de la plage ; vérifié par `check-scan.mjs`.)*
- [x] Un mode test accessible au cabinet active le `debugOverlay` d'eVision pour relever les scores en direct, suivant la méthode de calibration du README eVision. *(Lien « ouvrir le scan avec les scores affichés » — `/v/:slug/scan?debug=1` — avec la méthode des 90 % rappelée à l'écran.)*
- [x] Étant donné une image qui génère des faux positifs, quand je la désactive, alors elle sort du manifeste sans suppression. *(Vérifié par `check-scan.mjs`.)*

### US-7.5 — Kit catalogue (QR + icône)
**En tant que** Cabinet, **je veux** télécharger le QR code de ma vente et l'icône « scannable », **afin de** les intégrer à la maquette de mon catalogue papier.

Conditions d'acceptation :
- [x] Le studio fournit, pour une vente, son QR code pointant vers `/v/:slug` (téléchargeable, qualité d'impression). *(PNG 1024 px ≈ 8,5 cm à 300 dpi, et SVG vectoriel.)*
- [x] L'icône « scannable » est téléchargeable en vectoriel et PNG, accompagnée de la consigne d'usage : QR sur la page d'informations pratiques du catalogue, icône à côté de chaque image scannable.
- [x] Le QR n'est proposé qu'à partir de la première publication (slug figé). *(Section « Kit catalogue » affichée seulement si `published_at` est renseigné.)*

---

## EPIC 8 — Finitions & durcissement *(Phase 6)*

> Rendre la plateforme présentable et robuste pour les démonstrations clients.

### US-8.1 — Tableaux de bord
**En tant que** Cabinet, **je veux** un tableau de bord (mes ventes par statut, consommation des quotas), **afin de** piloter mon activité d'un coup d'œil.

Conditions d'acceptation :
- [x] Le tableau de bord cabinet affiche les ventes par statut et la consommation des trois quotas du plan. *(Page « Mes ventes » : compteurs par statut + widget quotas.)*
- [x] L'admin dispose d'une vue d'ensemble : cabinets par statut, échéances d'abonnement proches. *(Page « Cabinets » : compteurs actifs/suspendus + bandeau des échéances sous 30 jours, marquage ⚠ dans la liste.)*

### US-8.2 — Robustesse et sécurité
**En tant que** plateforme, **je veux** des entrées validées, des erreurs propres et une protection contre la force brute, **afin de** tenir une utilisation réelle.

Conditions d'acceptation :
- [x] Toute entrée API est validée (types, longueurs, valeurs d'énumération) avec des erreurs `{ error: { code, message } }` cohérentes. *(Types et énumérations depuis les EPICs 2–7 ; plafonds de longueur et JSON malformé → 400 ajoutés ici — `check-hardening.mjs`.)*
- [x] `/api/auth/login` est limité en fréquence (rate limiting) ; les tentatives échouées répétées sont ralenties. *(5 échecs par couple IP + email sur 15 min → 429 ; remise à zéro à la connexion réussie.)*
- [x] Tous les états vides, de chargement et d'erreur des écrans principaux sont conçus (pas d'écran blanc). *(Chargement/vide/erreur présents sur les pages admin, studio et publiques ; vérification visuelle en recette PO.)*

### US-8.3 — Tests des règles critiques
**En tant qu'**équipe, **je veux** des tests automatisés sur les invariants métier, **afin d'**éviter les régressions sur ce qui protège les données et le modèle économique.

Conditions d'acceptation :
- [x] Tests automatisés couvrant : cloisonnement inter-cabinets, application des trois quotas, transitions de statut de vente, contenu du manifeste de reconnaissance (images actives uniquement, vente publiée uniquement). *(7 scripts, 117 contrôles, lancés d'une commande : `npm test` dans `server/`.)*
- [x] Les tests passent sur `develop` avant tout merge vers `main`. *(Règle documentée au README et appliquée à chaque release.)*

---

## Hors périmètre v1 (vu, décidé, reporté)

- Paiement réel (l'abonnement reste simulé, géré par l'admin).
- Comptes acheteurs, favoris, historique.
- Plusieurs utilisateurs par cabinet (le schéma le permet déjà, pas d'UI).
- Statistiques de scan pour les cabinets.
- Application mobile native, PWA, mode hors-ligne.
- Migration PostgreSQL et stockage objet (S3).
- **eVision v2 — « rectangle renifleur »** : localisation visuelle de l'objet dans l'image caméra (rectangle qui suit l'objet et change de couleur à la reconnaissance, comme le projet 2018-19 inspiré d'Akhmadeev). Nécessite une brique de localisation par points caractéristiques (ex. OpenCV.js : niveaux de gris → détection d'arêtes/coins → mise en correspondance + homographie), éventuellement hybride avec MobileNet. À développer dans le projet eVision externe, réintégré seulement une fois au point.
- **Comparateur de techniques de reconnaissance** : pouvoir basculer entre les moteurs (MobileNet actuel / eVision v2) depuis une page d'administration pour comparer détection, faux positifs et confort visuel en conditions réelles. Piste complémentaire côté acheteur : exposer le choix sous un nom simple évoquant le bénéfice (pas la technologie), de préférence en repli contextuel — proposer « essayer un autre mode de scan » quand rien n'est reconnu après quelques secondes, plutôt qu'un choix technique d'entrée de jeu.
