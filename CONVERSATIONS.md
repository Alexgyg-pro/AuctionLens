# AuctionLens — Journal des conversations

> Trace des échanges entre Alexandre (Product Owner) et Claude (équipe de
> développement) qui ont façonné le produit : décisions, revirements,
> enseignements. Le code, lui, vit dans Git — ici on garde le *pourquoi*.
>
> Convention : une entrée par conversation marquante, avec la décision ou
> l'enseignement en gras à la fin.

---

## 2026-06-11 — L'accès acheteur : du QR code à l'élégance du catalogue

Le plan initial prévoyait un QR code à côté de chaque œuvre dans le catalogue
papier. Alexandre l'a refusé : un catalogue de vente aux enchères se doit
d'être élégant, et le constellé de QR codes le dénaturerait. Première
itération : scanner directement l'image de l'œuvre, signalée par une petite
icône discrète.

Puis, après une nuit de réflexion, Alexandre est revenu avec un constat
d'usage : taper une URL, même courte, c'est fastidieux. Or la page 3 d'un
catalogue porte traditionnellement les informations pratiques (dates,
adresses) — un QR code y est à sa place. Décision finale en deux temps :

1. **Un QR code unique sur la page d'informations pratiques** pour accéder au
   site de la vente.
2. **Le scan se fait sur l'image de l'œuvre elle-même**, signalée par une
   petite icône « scannable ».

**Enseignement : une bonne décision produit peut demander deux itérations.
Le refus initial (pas de QR près des œuvres) était esthétique ; la solution
finale a réconcilié l'esthétique et la praticité en déplaçant le QR là où il
ne choque pas.**

## 2026-06-11 — Trois arbitrages structurants validés en une passe

Au moment d'écrire le backlog, trois questions produit ont été tranchées :

- **L'acheteur est anonyme.** Pas de compte, pas de donnée personnelle : une
  URL publique par vente suffit. En salle des ventes, chaque seconde de
  friction fait perdre des utilisateurs.
- **Cycle de vie d'une vente : Brouillon → Publiée → Archivée**, avec retour
  possible d'Archivée vers Publiée. Le slug (l'URL) est figé à la première
  publication, parce que les QR imprimés ne peuvent pas casser.
- **Les abonnements sont simulés mais les quotas sont réels.** Pas de
  paiement en v1, mais les plans (ventes actives, lots par vente, stockage)
  bloquent vraiment — la mécanique commerciale a du sens dès la démo.

**Enseignement : simuler le paiement mais appliquer réellement les quotas
donne un produit démontrable à un client sans construire la facturation.**

## 2026-06-11 — Le flux GitHub : une seule branche visible

Alexandre supposait que `develop` serait mergée dans `main` avant chaque
push. Discussion sur le rôle du dépôt distant : pour lui, GitHub est autant
une vitrine de démonstration qu'une sauvegarde. Décision : **une seule
branche distante, `main`. On travaille en local sur `feature/*` et
`develop`, et on ne pousse vers `main` qu'en fin d'EPIC validée par le PO.**

**Enseignement : le dépôt distant sert un objectif (montrer un historique
propre, EPIC par EPIC), et le flux Git doit servir cet objectif — pas
l'inverse.**

## 2026-06-12 — « Ce n'est pas une révélation de Dieu le père »

La consigne « ne pas toucher à eVision » figeait le composant de
reconnaissance. Quand l'amélioration de l'affichage caméra est venue sur la
table, Alexandre a challengé sa propre règle : pourquoi serait-elle
intouchable ?

Réponse de l'équipe : la règle n'a rien de sacré, c'est une décision du PO —
mais elle protégeait trois choses pendant l'intégration : un acquis testé
sur un sujet difficile, une source de vérité unique (le README d'eVision
décrit exactement ce qui tourne), et une discipline qui a forcé une
frontière propre entre le composant et l'application (le contrat
`{id, src}` → événement de reconnaissance).

Décision d'Alexandre : **maintenir la règle, mais pour une raison nouvelle —
les évolutions d'eVision se feront dans son projet externe, à son rythme, et
ne seront réintégrées que stabilisées.** AuctionLens reste protégé, le
laboratoire reste libre.

**Enseignement : challenger une règle et la reconduire en connaissance de
cause vaut mieux que la subir. La règle a changé de nature : de contrainte
d'intégration, elle est devenue stratégie de gestion du risque.**

## 2026-06-12 — Le « rectangle renifleur » : l'histoire derrière le produit

Alexandre a raconté l'origine du projet : vers 2018-19, une application
inspirée du livre de Foat Akhmadeev (2015), construite avec JSFeat et
tracking.js. Le pipeline : mise en noir et blanc → détection des arêtes →
repérage des points aux extrémités → ces points servent de référence.
Visuellement réussi : un rectangle se dessinait autour de l'objet candidat
et changeait de couleur à la reconnaissance formelle. Mais c'était instable,
incompatible Safari, et la syntaxe avait vieilli.

Sur conseil de Claude AI, le présent projet a basculé sur TensorFlow.js /
MobileNet. Le gain : robustesse et universalité (la recette PO l'a
confirmé : reconnaissance immédiate dans des conditions dégradées). Le prix :
MobileNet résume toute la zone du viseur en une signature globale — il dit
« combien ça ressemble », jamais « où c'est ». Le rectangle qui suit l'objet
est donc impossible avec cette technique seule.

Nuance importante : le viseur d'eVision joue déjà une partie du rôle — blanc
au repos, orange quand le score approche du seuil, vert avec flash à la
reconnaissance. Le « renifleur » existe ; il est juste fixe.

Pistes actées au backlog (hors périmètre v1) : **eVision v2** avec une
brique de localisation (OpenCV.js : la version moderne et maintenue du
pipeline de 2018) et un **comparateur de techniques** en page
d'administration.

**Enseignement : l'intuition technique de 2018 (détection de points
caractéristiques) était la bonne école — ce sont les bibliothèques qui
étaient obsolètes, pas l'idée. Et chaque approche a un compromis :
localisation contre robustesse.**

## 2026-06-12 — Choix du moteur de scan : le défaut intelligent

Constat d'Alexandre : lumière, navigateur, réseau… les conditions réelles
varient tellement qu'une technique de reconnaissance peut gagner dans une
situation et perdre dans une autre. D'où l'idée d'offrir le choix à
l'acheteur, sous un nom « un peu technique ».

Contre-proposition UX de l'équipe, validée par le PO : **pas de choix
technique d'entrée de jeu.** L'acheteur en salle a dix secondes de patience
et ne veut pas arbitrer entre des technologies qu'il ne connaît pas. À la
place : un **défaut intelligent + un repli contextuel** — le scan démarre
sur le meilleur moteur sans rien demander ; si rien n'est reconnu après
quelques secondes, on propose « essayer un autre mode de scan », nommé par
son bénéfice (« mode lumière difficile »), jamais par sa technologie.

**Enseignement : offrir un choix n'est pas un service si l'utilisateur n'a
pas les moyens de choisir. Le bon moment pour proposer une alternative,
c'est quand l'utilisateur vient de constater le problème qu'elle résout.**

## 2026-06-12 — Le rythme de travail : le PO n'est pas développeur

Alexandre l'a dit simplement : « Quand je te vois générer du code, j'en ai
un peu le tournis et je n'arrive pas toujours à suivre. » Il développe sans
années de pratique professionnelle, et les gros volumes de code générés
d'un coup le perdent.

Ajustement de l'équipe : expliquer l'intention avant de coder, résumer en
termes accessibles ce que fait chaque livraison, et garder la porte ouverte
à « explique-moi ce bout-là » à tout moment.

**Enseignement : c'est à l'équipe de s'adapter au PO, pas l'inverse. Un PO
n'a pas besoin de lire le code ; il a besoin de comprendre ce qui a été
fait, pourquoi, et ce que ça change pour le produit.**

## 2026-06-12 — Bilan de la v1 : pourquoi ça a été si vite

Au moment de la dernière release, Alexandre s'est dit impressionné : une
application qu'un professionnel aurait mise des semaines à produire, sortie
en quelques heures de collaboration.

L'analyse de l'équipe, à verser au dossier : la vitesse venait en grande
partie du travail de PO lui-même —

- **Un prompt initial travaillé en amont** (une soirée avec Claude AI) : le
  contexte produit était complet dès la première minute.
- **Des arbitrages rapides et nets** à chaque question posée : aucune heure
  perdue sur des chemins parallèles.
- **La partie la plus risquée (eVision) isolée et terminée d'avance** :
  l'intégration a pris une EPIC au lieu d'un projet.
- **Une discipline de recette** : tester et valider explicitement chaque
  EPIC avant la release, ce qui empêche un projet rapide de devenir un
  château de cartes.

**Enseignement : diriger un développement — backlog, priorités, arbitrages,
recettes, releases — est un travail à part entière, et c'est lui qui
détermine la vitesse utile d'une équipe, humaine ou IA. Ce dépôt en est la
démonstration.**

---

## Note technique — changement de modèle (2026-06-14)

Les sessions des 11 et 12 juin 2026 ont été menées par **Claude Fable 5**
(c'est ce nom qui co-signe les commits de cette période). À partir du
14 juin 2026, le projet continue avec **Claude Opus 4.8**.

Pourquoi le changement : le 12 juin 2026, le gouvernement américain a émis une
directive de contrôle à l'exportation (motif de sécurité nationale) imposant à
Anthropic de suspendre l'accès à Fable 5 et Mythos 5 pour **tous** les
utilisateurs dans le monde. Ne pouvant pas distinguer en temps réel les
ressortissants étrangers visés par la directive, Anthropic a désactivé les deux
modèles pour tout le monde. L'entreprise conteste la mesure, la qualifie de
« malentendu » (le « jailbreak » invoqué serait étroit et non universel) et
travaille à rétablir l'accès ; les autres modèles ne sont pas touchés.
*(Sources : page officielle Anthropic « fable-mythos-access » ; heise online ;
TechTimes — juin 2026.)*

Rien ne change au code ni aux décisions : seul le nom de l'auteur dans
l'historique Git diffère selon la période.

---

## 2026-06-14 — Le test smartphone et la question de l'URL permanente

Reste à valider la dernière case du projet : le scan caméra sur un vrai
smartphone, qui exige une adresse en HTTPS (impossible avec `localhost` sur
un téléphone). La solution est un **tunnel** : un outil qui donne une adresse
web publique et temporaire pointant vers l'application qui tourne sur le PC.

Alexandre voulait éviter la création d'un compte ngrok (la friction qu'il
avait repoussée la veille). Bascule vers **Cloudflare Tunnel
(`cloudflared`)**, qui fait la même chose **sans aucun compte** — au prix
d'une ligne de config ajoutée dans Vite pour autoriser le domaine
`.trycloudflare.com`. Le test a réussi : sur le téléphone, la fiche du lot
s'ouvre ; et la boucle complète **scanner le QR → arriver sur le site →
scanner l'image** fonctionne.

Puis Alexandre a pointé le vrai sujet : cette adresse est **provisoire**
(elle change à chaque lancement du tunnel et disparaît quand on le coupe).
Or un QR code s'imprime sur papier : il est permanent. Mise au clair :

- Le **chemin** de l'URL (`/v/figurines-manga-resine`) est déjà permanent —
  c'est la décision « slug figé à la première publication » prise dès le
  départ, justement pour que les QR imprimés ne cassent jamais.
- Le **domaine** (`xxxx.trycloudflare.com`) est temporaire, parce que c'est
  un outil de test. Pour un QR permanent, il faut **héberger** l'application
  à un domaine fixe (ex. `auctionlens.fr`) — c'est l'étape de déploiement,
  laissée hors de la v1 (l'appli tourne en local, base SQLite + fichiers sur
  disque). Le QR du « Kit catalogue » se générant à partir de l'adresse de
  navigation, il pointera tout seul vers la bonne adresse le jour du
  déploiement.

**Enseignement : un support physique (un QR imprimé) impose une contrainte
numérique permanente — tout ce vers quoi il pointe doit être stable. La
moitié était déjà anticipée (slug figé = chemin permanent) ; l'autre moitié,
le domaine permanent, c'est le déploiement. Distinguer « le produit marche »
(v1, prouvé) de « le produit est en ligne pour de vrais cabinets »
(déploiement) est un jalon de feuille de route à part entière — c'est la
prochaine étape naturelle du projet.**
