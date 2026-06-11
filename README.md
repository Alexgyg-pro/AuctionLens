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
  exemple [ngrok](https://ngrok.com) :

  ```bash
  ngrok http 5173
  ```

  Puis ouvrir l'URL `https://…ngrok…/v/<slug>` sur le téléphone. (Alternative :
  `vite --host` + certificat local de confiance.)

Le premier chargement du modèle MobileNet prend 5–15 s selon la connexion ;
les fichiers WASM de TF.js sont copiés dans `client/public/tfwasm/` par le
script `postinstall` (`scripts/copy-wasm.mjs`).

## Identifiants de développement (seed)

| Rôle    | Email                       | Mot de passe  |
|---------|-----------------------------|---------------|
| Admin   | `admin@auctionlens.local`   | `admin123!`   |
| Cabinet | `cabinet@auctionlens.local` | `cabinet123!` |

Le seed crée aussi les plans « Essentiel » et « Pro », ainsi qu'un
« Cabinet Démo » (plan Essentiel) rattaché au compte cabinet.
La base SQLite vit dans `server/data/` (non versionnée).

## Conventions Git

`main` (stable) ← `develop` (intégration) ← `feature/<nom>` (travail).
Jamais de commit direct sur `main` ou `develop`. Commits préfixés
(`feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `chore:`).
