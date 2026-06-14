# AuctionLens — Aide-mémoire pour une démo

Comment montrer AuctionLens sur un téléphone (le scan du catalogue), par
exemple en visio. Aucune compétence technique requise : on lance trois
programmes, on lit une adresse, on scanne.

## Préparatifs (déjà faits, une seule fois)

- `cloudflared` est téléchargé ici :
  `C:\Users\alexg\cloudflared\cloudflared.exe`
  (l'outil qui crée un tunnel HTTPS temporaire vers ton ordinateur).
- La config Vite autorise déjà les adresses Cloudflare (`.trycloudflare.com`).

## Lancer la démo : trois terminaux

Ouvre trois fenêtres de terminal.

**1. Le serveur** — dans le dossier `server` :

    npm run dev

**2. Le client** — dans le dossier `client` :

    npm run dev

   (attends qu'il affiche `Local: http://localhost:5173`)

**3. Le tunnel** — n'importe quel dossier :

    C:\Users\alexg\cloudflared\cloudflared.exe tunnel --url http://localhost:5173

   cloudflared affiche un cadre avec une ligne du type :

    https://xxxx-xxxx-xxxx.trycloudflare.com

   👉 C'est **l'adresse du jour**. Note-la.

## Montrer le produit sur le téléphone

**Option A — accès direct à une vente**
Ouvre sur le téléphone :

    https://xxxx-xxxx-xxxx.trycloudflare.com/v/figurines-manga-resine

→ la fiche de la vente s'affiche → bouton « 📷 Scanner le catalogue »
→ « Activer la caméra » (autoriser) → présenter l'image dans le viseur
→ la fiche du lot s'ouvre.

**Option B — la boucle complète avec le QR code (plus parlant)**
1. Sur le PC, ouvre le studio via le tunnel :
   `https://xxxx-xxxx-xxxx.trycloudflare.com/studio`
2. Connecte-toi (cabinet : `cabinet@auctionlens.local` / `cabinet123!`).
3. Ouvre la vente publiée → section « Kit catalogue ».
4. Le QR affiché encode l'adresse du tunnel : montre-le à l'écran.
5. Scanne ce QR avec l'appareil photo du téléphone → le site s'ouvre sur le
   téléphone → « Scanner le catalogue » → présenter l'image → fiche du lot.

## À retenir

- L'adresse `…trycloudflare.com` **change à chaque lancement** du tunnel.
  Lis toujours la nouvelle dans le terminal 3 ; ne réutilise pas une ancienne.
- Garde les **trois terminaux ouverts** pendant toute la démo. Fermer le
  terminal 3 coupe l'adresse.
- Au premier scan, le modèle de reconnaissance met **5 à 15 s** à charger
  (normal, une seule fois).

## Pour arrêter

Ferme les trois terminaux (Ctrl+C dans chacun). Le tunnel et l'adresse
disparaissent — plus rien n'est exposé sur Internet.

## Et après ? (hors démo)

Cette adresse est **temporaire**, faite pour le test et la démo. Pour un vrai
QR imprimé et **permanent**, il faut héberger AuctionLens à un domaine fixe
(étape de déploiement) — voir `PLAN.md` et `CONVERSATIONS.md` (2026-06-14).
