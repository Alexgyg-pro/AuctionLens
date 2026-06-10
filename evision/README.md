# eVision — Reconnaissance d'images en temps réel

Composant React réutilisable qui utilise la caméra de l'appareil et TensorFlow.js (MobileNet) pour reconnaître des images de référence en temps réel.

---

## Démarrage rapide

```bash
npm install
npm run dev
```

Ouvrir [http://localhost:5173](http://localhost:5173) dans le navigateur.

> **HTTPS requis sur mobile.** La caméra n'est accessible que sur `localhost` ou via HTTPS.
> Pour tester sur smartphone : exposez le serveur via `ngrok` ou utilisez Vite avec l'option `--host` + un certificat.

---

## Ajouter des images de référence

1. Placer l'image dans `public/refs/` (JPEG ou PNG, idéalement ≥ 224×224 px).
2. Ajouter une entrée dans le tableau `REFERENCES` de `src/App.jsx` :

```js
const REFERENCES = [
  { id: 'mon-objet', src: '/refs/mon-objet.jpg' },
  // …
]
```

3. Passer ce tableau à la prop `references` du composant `<ImageRecognizer>`.

**Conseils pour de meilleures images de référence :**
- Fond neutre et uniforme (blanc ou gris)
- Éclairage diffus, sans ombres marquées
- L'objet doit occuper 60–80 % de l'image
- Éviter les images floues ou pixelisées

---

## Calibrer le seuil (`threshold`)

Le seuil contrôle la sensibilité de la reconnaissance.

> **Note importante :** les valeurs de similarité cosinus obtenues avec MobileNet sur des images imprimées/affichées vues par caméra sont **bien inférieures** aux valeurs obtenues sur des images numériques pures. Des scores de **0.45–0.65** sont normaux pour ce type d'usage — ne pas s'attendre aux valeurs de 0.85+ de la valeur par défaut initiale.

| Valeur | Comportement |
|--------|--------------|
| `0.60–0.70` | Strict : peu de faux positifs, mais nécessite un bon éclairage et un cadrage précis. |
| `0.50–0.60` | **Plage recommandée pour images imprimées.** Bon équilibre entre détection et fiabilité. |
| `0.40–0.50` | Permissif : détecte dans des conditions difficiles mais avec plus de faux positifs. |

**Méthode de calibration :**

1. Laisser `debugOverlay={true}` pour voir le score en direct.
2. Allumer une source de lumière directe sur l'image à reconnaître.
3. Pointer la caméra sur l'image en la faisant entrer entièrement dans le carré du viewfinder.
4. Relever le score maximal affiché (pic quand le cadrage est optimal).
5. Répéter pour chaque image de référence, noter le score le plus bas observé.
6. Fixer `threshold` à environ 90 % de ce score le plus bas.

```jsx
// Exemple : score pic à 0.55 sur toutes les images → threshold à 0.50
<ImageRecognizer threshold={0.50} debugOverlay={true} />
```

**Impact de l'éclairage :**

L'éclairage est le facteur le plus important. Une bonne lumière directe peut faire monter le score de 0.35 à 0.55 sur la même image. Toujours calibrer dans les conditions réelles d'utilisation.

**Pourquoi le viewfinder est carré :**

MobileNet traite toutes les images en 224×224 pixels (carré). Un viewfinder carré évite toute déformation lors du rognage, ce qui améliore la qualité des embeddings et donc les scores de similarité.

---

## Intégrer le composant dans une application

```jsx
import ImageRecognizer from './components/ImageRecognizer'

const REFERENCES = [
  { id: 'produit-a', src: '/refs/produit-a.jpg' },
  { id: 'produit-b', src: '/refs/produit-b.jpg' },
]

function MyApp() {
  function handleRecognized({ id, score }) {
    console.log(`Reconnu : ${id} avec score ${score.toFixed(3)}`)
    // déclencher une action métier ici
  }

  return (
    <ImageRecognizer
      references={REFERENCES}
      onImageRecognized={handleRecognized}
      threshold={0.85}
      cooldown={5000}
      intervalMs={800}
      viewfinderSize={{ width: '70%', height: '40%' }}
      viewfinderColorIdle="#FFFFFF"
      viewfinderColorClose="#FF9900"
      viewfinderColorSuccess="#00CC00"
      debugOverlay={false}
    />
  )
}
```

### Référence des props

| Prop | Type | Défaut | Description |
|------|------|--------|-------------|
| `references` | `Array<{id, src}>` | `[]` | Images de référence à charger |
| `onImageRecognized` | `Function({id, score})` | — | Callback déclenché à la reconnaissance |
| `threshold` | `number` | `0.85` | Seuil de similarité cosinus (0–1) |
| `cooldown` | `number` | `5000` | Délai minimum entre deux déclenchements pour un même id (ms) |
| `intervalMs` | `number` | `800` | Intervalle entre deux analyses de frame (ms) |
| `viewfinderSize` | `{width, height}` | `{width:'70%', height:'40%'}` | Taille relative du viewfinder |
| `viewfinderColorIdle` | `string` | `#FFFFFF` | Couleur du viewfinder en attente |
| `viewfinderColorClose` | `string` | `#FF9900` | Couleur quand le score approche le seuil |
| `viewfinderColorSuccess` | `string` | `#00CC00` | Couleur lors d'une reconnaissance |
| `debugOverlay` | `boolean` | `true` | Afficher le score en overlay |

---

## Architecture technique

```
src/
  components/
    ImageRecognizer/
      ImageRecognizer.jsx   — logique + rendu
      ImageRecognizer.css   — styles responsive
      index.js              — point d'entrée
  App.jsx                   — démo avec notifications
public/
  refs/                     — images de référence statiques
```

**Pipeline de reconnaissance :**

1. Au montage : sélection automatique du backend TF.js (WebGL → WASM → CPU)
2. Chargement de MobileNet v2 (modèle léger optimisé mobile)
3. Précalcul et mise en cache des embeddings de chaque image de référence
4. À chaque intervalle : rognage du viewfinder via canvas → embedding → similarité cosinus vs références
5. Déclenchement du callback si `score ≥ threshold` et cooldown respecté

---

## Limitations connues

| Limitation | Impact |
|------------|--------|
| **Performances mobile** | Le premier chargement du modèle MobileNet prend 5–15 s selon la connexion. Les analyses suivantes sont rapides (< 100 ms sur GPU). |
| **Éclairage** | La similarité cosinus est sensible aux variations d'éclairage importantes. Préférer un éclairage stable et diffus. |
| **Angle de vue** | Les objets présentés sous un angle très différent de l'image de référence seront moins bien reconnus. Envisager plusieurs images de référence par objet. |
| **Objets similaires** | MobileNet peut confondre des objets visuellement proches. Augmenter `threshold` pour réduire les faux positifs. |
| **HTTPS obligatoire** | `getUserMedia` n'est disponible que sur `localhost` ou HTTPS. Les tests en réseau local non chiffré ne fonctionneront pas. |
| **Safari iOS** | Les contraintes `facingMode: environment` sont supportées mais peuvent nécessiter une interaction utilisateur préalable. |
| **Fond de page** | MobileNet a été entraîné sur ImageNet ; il reconnaît mieux des objets isolés que des scènes complexes. |
