# AuctionLens

Plateforme SaaS B2B pour cabinets de commissaires-priseurs : une couche numérique
sur les ventes aux enchères physiques. L'acheteur scanne une image du catalogue
papier avec son smartphone et accède aux ressources enrichies du lot.

- Architecture et découpage : voir `PLAN.md`
- Backlog produit (EPICs, US, conditions d'acceptation) : voir `BACKLOG.md`
- Brique de reconnaissance d'image (composant intangible) : voir `evision/README.md`

## Structure

```
client/   — SPA React + Vite (espaces acheteur, studio cabinet, admin)
server/   — API Express + SQLite
evision/  — composant ImageRecognizer (terminé, ne pas modifier)
```

## Démarrage (développement)

Prérequis : Node.js ≥ 22.

```bash
# 1. Installer les dépendances
cd server && npm install
cd ../client && npm install

# 2. Initialiser la base (migrations + données initiales, idempotent)
cd ../server && npm run seed

# 3. Lancer l'API (terminal 1)
npm run dev          # → http://localhost:3000  (santé : /api/health)

# 4. Lancer le client (terminal 2)
cd ../client && npm run dev   # → http://localhost:5173
```

Le client proxe `/api` et `/uploads` vers l'API en développement.

## Tester le scan caméra

La caméra n'est accessible que sur `localhost` ou en HTTPS (`getUserMedia`).

- **Sur le PC de dev** : `http://localhost:5173` est considéré sécurisé — la
  webcam fonctionne directement sur la page de scan (`/v/<slug>/scan`).
- **Sur smartphone** : il faut un tunnel HTTPS vers le serveur Vite, par
  exemple [ngrok](https://ngrok.com) (compte gratuit + authtoken requis à la
  première utilisation) :

  ```bash
  # 1. Une seule fois : installer ngrok et enregistrer son authtoken
  #    (téléchargement et token sur https://dashboard.ngrok.com)
  ngrok config add-authtoken <votre-token>

  # 2. À chaque session de test, avec client et serveur déjà lancés :
  ngrok http 5173
  ```

  ngrok affiche alors une ligne `Forwarding` avec une URL du type
  `https://a1b2c3d4.ngrok-free.app` — c'est **cette URL** (elle change à
  chaque lancement) qu'il faut ouvrir sur le téléphone, suivie du chemin de
  la vente : `https://a1b2c3d4.ngrok-free.app/v/<slug>`.

  Les domaines ngrok sont autorisés dans `client/vite.config.js`
  (`server.allowedHosts`) — sans cela Vite répond « Blocked request ».
  (Alternative sans ngrok : `vite --host` + certificat local de confiance.)

Le premier chargement du modèle MobileNet prend 5–15 s selon la connexion ;
les fichiers WASM de TF.js sont copiés dans `client/public/tfwasm/` par le
script `postinstall` (`scripts/copy-wasm.mjs`).

## Tests

```bash
cd server && npm test
```

Rejoue les 7 scripts de vérification (117 contrôles : auth, admin, studio,
médias, public, scan, durcissement). Chaque script démarre son propre serveur
sur le port 3100 et nettoie ses données de test. **Règle d'équipe : `npm test`
doit passer sur `develop` avant tout merge vers `main`.**

## Production locale (démo un seul processus)

```bash
cd client && npm run build   # génère client/dist
cd ../server && npm start    # sert l'API ET la SPA sur http://localhost:3000
```

Quand `client/dist` existe, Express sert lui-même le build du client —
plus besoin de Vite. (Supprimer `client/dist` pour revenir au mode dev pur.)

## Identifiants de développement (seed)

| Rôle    | Email                        | Mot de passe  |
| ------- | ---------------------------- | ------------- |
| Admin   | `admin@auctionlens.local`    | `admin123!`   |
| Cabinet | `cabinet@auctionlens.local`  | `cabinet123!` |
| Cabinet | `contact@corto-ventes.local` | `CVabc123!`   |
| Cabinet | `contact@soda.local`         | `Soda123!`    |

Le seed crée aussi les plans « Essentiel » et « Pro », ainsi qu'un
« Cabinet Démo » (plan Essentiel) rattaché au compte cabinet.
La base SQLite vit dans `server/data/` (non versionnée).

## Conventions Git

`main` (stable) ← `develop` (intégration) ← `feature/<nom>` (travail).
Jamais de commit direct sur `main` ou `develop`. Commits préfixés
(`feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `chore:`).
