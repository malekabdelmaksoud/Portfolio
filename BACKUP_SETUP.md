# Guide de Configuration des Sauvegardes & Stockage R2 — Melek AI

Ce guide décrit pas à pas la mise en service du système de sauvegarde automatique chiffré pour **Melek AI Portfolio**.

---

## 1. Prérequis & Limites Gratuites (Cloudflare Free Tier)

Le système utilise les fonctionnalités 100% gratuites de Cloudflare :
- **Cloudflare R2** :
  - Stockage gratuit : jusqu'à **10 Go/mois**.
  - Opérations Class A (écritures, listes) : **1 000 000/mois**.
  - Opérations Class B (lectures) : **10 000 000/mois**.
  - Frais de sortie réseau : **0 $** (Egress gratuit).
- **Cloudflare Workers Cron Triggers** :
  - 1 exécution par jour = 30 requêtes par mois (sur un quota gratuit de 100 000 requêtes/jour).

---

## 2. Étape 1 : Création du Bucket R2

Vous pouvez créer le bucket de stockage soit depuis le tableau de bord Cloudflare, soit via la CLI `wrangler`.

### Option A : Via le Cloudflare Dashboard
1. Connectez-vous sur [dash.cloudflare.com](https://dash.cloudflare.com).
2. Sélectionnez votre compte (`31f53982982f23473273a9bb34164265`).
3. Dans la barre latérale gauche, cliquez sur **Storage & Databases** > **R2**.
4. Cliquez sur **Create bucket**.
5. Donnez le nom exact : `melek-portfolio-backups`.
6. Choisissez l'emplacement par défaut (Automatic) et validez.

### Option B : Via la CLI Wrangler
Exécutez dans votre terminal local :
```bash
npx wrangler r2 bucket create melek-portfolio-backups
```

---

## 3. Étape 2 : Configuration de la Clé de Chiffrement (Secret)

Le Worker a besoin d'une clé de chiffrement pour AES-256-GCM. Cette clé ne doit **jamais** être stockée dans le code source ou dans Git.

1. Générez une clé hexadécimale de 256 bits (64 caractères hex) ou une phrase secrète robuste (au moins 32 caractères) :
   ```bash
   # Générer une clé aléatoire forte sous Node.js :
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Injectez la clé dans les secrets du Worker :
   ```bash
   cd worker
   npx wrangler secret put BACKUP_ENCRYPTION_KEY
   ```
   *Collez la clé générée lorsque l'invite s'affiche.*
3. Conservez cette clé en lieu sûr (dans votre gestionnaire de mots de passe). **Sans cette clé, aucune sauvegarde ne peut être déchiffrée.**

---

## 4. Étape 3 : Application de la Migration D1 pour les Logs

Pour enregistrer l'historique et les statistiques des sauvegardes, appliquez la migration `0010_backup_logs.sql` sur la base D1 de production :

```bash
cd worker
npx wrangler d1 migrations apply melek-portfolio-db --remote
```

*Note : En environnement local, la migration est appliquée automatiquement ou testée dans `worker/test/worker.test.js`.*

---

## 5. Étape 4 : Déploiement du Worker avec le Binding R2 et le Cron

Assurez-vous que le fichier `worker/wrangler.toml` contient la configuration du bucket R2 et du cron :

```toml
# Configuration active dans worker/wrangler.toml
[[r2_buckets]]
binding = "BACKUP_BUCKET"
bucket_name = "melek-portfolio-backups"

[triggers]
crons = ["0 3 * * *"]
```

Puis déployez le Worker :
```bash
cd worker
npx wrangler deploy
```

---

## 6. Étape 5 : Vérification & Tests de Santé

### 6.1. Vérification du statut via l'API Admin
Depuis votre navigateur connecté avec votre compte administrateur Cloudflare Access (`melekabdelmaksoud72@gmail.com`) sur `https://portfolio.melekabdelmaksoud72.workers.dev/admin.html` :
1. Accédez à l'onglet **Sauvegardes & Restauration**.
2. Vérifiez le statut du système :
   - R2 Binding : Connecté (`melek-portfolio-backups`)
   - Chiffrement : Actif (AES-256-GCM)
   - Fréquence automatique : Tous les jours à 03:00 UTC.

### 6.2. Déclencher une sauvegarde manuelle immédiate
Dans le tableau de bord Administrateur, cliquez sur **Créer une sauvegarde maintenant**.
Le Worker effectuera immédiatement :
1. L'extraction de toutes les tables D1.
2. Le chiffrement AES-256-GCM et le calcul des hachages SHA-256.
3. Le test de déchiffrement immédiat (self-test).
4. Le stockage dans R2 et l'enregistrement dans la table D1 `backup_logs`.

La nouvelle sauvegarde doit apparaître instantanément dans la table avec le statut `Valide (AES-256-GCM)`.
