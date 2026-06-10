# Backlog — ImageRecognizer

Composant React · TensorFlow.js · v1.0

---

## Epics

| ID  | Epic                                  | Description                                                       |
| --- | ------------------------------------- | ----------------------------------------------------------------- |
| E1  | Initialisation & chargement du modèle | Chargement de TensorFlow.js et calcul des embeddings de référence |
| E2  | Capture & analyse caméra              | Accès au flux caméra et analyse de la zone viewfinder             |
| E3  | Viewfinder & feedback visuel          | Rectangle de scan avec états visuels et responsive                |
| E4  | Événement & intégration               | Déclenchement du callback et documentation                        |

---

## À FAIRE

Aucune user story en attente.

---

## TERMINÉ

### E1 — Initialisation & chargement du modèle

**US-01 · Chargement de MobileNet au montage** · 3 pts · Priorité haute

> En tant qu'utilisateur, quand j'ouvre l'app, le modèle se charge en arrière-plan sans bloquer l'interface.

Critères d'acceptation :

- Un indicateur de chargement est visible pendant le téléchargement du modèle ✓
- Le bouton "Scanner" est désactivé jusqu'à la fin du chargement ✓
- Le fallback WASM/CPU est activé automatiquement si WebGL est indisponible ✓

---

**US-02 · Calcul des embeddings de référence** · 5 pts · Priorité haute

> En tant que développeur intégrateur, je fournis un tableau `references` et les embeddings sont calculés une seule fois au chargement.

Critères d'acceptation :

- Chaque image de référence est passée dans MobileNet une seule fois ✓
- Les vecteurs sont stockés en mémoire avec leur `id` ✓
- Les tenseurs sont correctement disposés après calcul (`tf.dispose`) ✓

---

### E2 — Capture & analyse caméra

**US-03 · Accès au flux caméra** · 3 pts · Priorité haute

> En tant qu'utilisateur, quand je clique sur "Scanner", la caméra s'active et le flux s'affiche dans l'interface.

Critères d'acceptation :

- Compatibilité Safari et navigateurs mobiles via `getUserMedia` ✓
- Message clair si la permission caméra est refusée ✓
- Bouton pour couper/réactiver la caméra ✓

---

**US-04 · Analyse de la zone viewfinder** · 8 pts · Priorité haute

> En tant qu'utilisateur, seule la zone du rectangle de scan est analysée, ce qui optimise les performances sur mobile.

Critères d'acceptation :

- Un canvas intermédiaire capture uniquement la zone du viewfinder ✓
- L'analyse se déclenche à intervalle régulier (prop `intervalMs`) ✓
- Pas de memory leak : `tf.tidy` appliqué à chaque frame ✓

---

### E3 — Viewfinder & feedback visuel

**US-05 · Rectangle de scan avec états visuels** · 5 pts · Priorité haute

> En tant qu'utilisateur, je vois un rectangle sur l'image caméra qui change de couleur selon l'état de la reconnaissance.

Critères d'acceptation :

- État _scanning_ : couleur neutre avec animation de balayage ✓
- État _proche_ : couleur d'avertissement (score entre seuil - 0.1 et seuil) ✓
- État _reconnu_ : couleur de succès avec flash visuel bref ✓
- Taille configurable via prop `viewfinderSize` ✓

---

**US-06 · Overlay de debug** · 2 pts · Priorité moyenne

> En tant que développeur, je vois le score de la meilleure correspondance en temps réel pour calibrer le seuil.

Critères d'acceptation :

- Score affiché en overlay sur le flux caméra ✓
- Désactivable via prop `debugOverlay={false}` ✓

---

**US-07 · Responsive portrait / paysage** · 3 pts · Priorité moyenne

> En tant qu'utilisateur mobile, l'interface s'adapte à l'orientation de mon écran sans casser le viewfinder.

Critères d'acceptation :

- Le viewfinder reste centré en portrait et en paysage ✓
- Le flux caméra occupe la largeur disponible ✓

---

### E4 — Événement & intégration

**US-08 · Déclenchement de `onImageRecognized`** · 3 pts · Priorité haute

> En tant que développeur intégrateur, quand une image est reconnue, je reçois un callback avec l'id et le score.

Critères d'acceptation :

- Callback déclenché uniquement si score ≥ `threshold` ✓
- Cooldown respecté : un même `id` ne se redéclenche pas avant `cooldown` ms ✓
- Signature : `({ id, score })` ✓

---

**US-09 · App de démo** · 2 pts · Priorité moyenne

> En tant que développeur, je dispose d'une app `App.jsx` fonctionnelle qui illustre l'intégration du composant.

Critères d'acceptation :

- Images de référence câblées dans `/public/refs/` ✓
- Notification UI visible 3 secondes à chaque reconnaissance ✓
- Affichage de l'id et du score reconnus ✓

---

**US-10 · README développeur** · 1 pt · Priorité basse

> En tant que développeur intégrateur, je dispose d'une documentation claire pour brancher le composant dans mon projet.

Critères d'acceptation :

- Instructions d'ajout d'images de référence ✓
- Guide de calibration du seuil avec valeurs réelles ✓
- Exemple d'intégration dans une app englobante ✓
- Limitations connues documentées ✓

---

## Récapitulatif

| ID    | User Story                           | Epic | Points     | Priorité | Statut   |
| ----- | ------------------------------------ | ---- | ---------- | -------- | -------- |
| US-01 | Chargement de MobileNet au montage   | E1   | 3          | Haute    | ✅ Terminé |
| US-02 | Calcul des embeddings de référence   | E1   | 5          | Haute    | ✅ Terminé |
| US-03 | Accès au flux caméra                 | E2   | 3          | Haute    | ✅ Terminé |
| US-04 | Analyse de la zone viewfinder        | E2   | 8          | Haute    | ✅ Terminé |
| US-05 | Rectangle de scan avec états visuels | E3   | 5          | Haute    | ✅ Terminé |
| US-06 | Overlay de debug                     | E3   | 2          | Moyenne  | ✅ Terminé |
| US-07 | Responsive portrait / paysage        | E3   | 3          | Moyenne  | ✅ Terminé |
| US-08 | Déclenchement de `onImageRecognized` | E4   | 3          | Haute    | ✅ Terminé |
| US-09 | App de démo                          | E4   | 2          | Moyenne  | ✅ Terminé |
| US-10 | README développeur                   | E4   | 1          | Basse    | ✅ Terminé |
|       | **Total**                            |      | **35 pts** |          |          |
