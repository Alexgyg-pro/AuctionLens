# Instructions pour Claude — projet eVision

## Politique Git

### Structure des branches

```
main
└── develop
    └── feature/<nom>   ← branche de travail
```

- **`main`** : code stable et validé. Mis à jour uniquement par merge depuis `develop` lors d'une release.
- **`develop`** : branche d'intégration. Toujours dans un état fonctionnel.
- **`feature/<nom>`** : branche de travail créée depuis `develop` pour chaque modification ou ajout.

### Règles obligatoires

1. **Ne jamais committer directement sur `main` ou `develop`.**
2. Toute modification, même mineure, se fait sur une branche `feature/<nom>` créée depuis `develop`.
3. Quand la modification est validée, merger dans `develop` puis supprimer la branche de travail.
4. La branche `main` ne reçoit des merges que depuis `develop`, lors d'une release explicitement demandée.

### Flux de travail standard

```bash
# 1. Créer la branche de travail depuis develop
git checkout -b feature/<nom> develop

# 2. Faire les modifications et committer
git add <fichiers>
git commit -m "type: description courte"

# 3. Merger dans develop et supprimer la branche
git checkout develop
git merge feature/<nom>
git branch -d feature/<nom>
```

### Convention de nommage des commits

Utiliser le préfixe conventionnel :

| Préfixe  | Usage                                      |
| -------- | ------------------------------------------ |
| `feat:`  | Nouvelle fonctionnalité                    |
| `fix:`   | Correction de bug                          |
| `docs:`  | Documentation uniquement                   |
| `style:` | Mise en forme, CSS                         |
| `refactor:` | Refactoring sans changement de comportement |
| `chore:` | Tâches de maintenance (dépendances, config) |

## Serveur de développement

Ne jamais lancer `npm run dev` depuis Claude Code — l'utilisateur ne peut pas arrêter le processus sans quitter Claude. Toujours fournir la commande et laisser l'utilisateur l'exécuter dans son propre terminal.
