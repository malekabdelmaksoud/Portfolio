# Guide de Restauration & Plan de Reprise d'Activité (Disaster Recovery) — Melek AI

Ce document détaille les procédures pour vérifier, simuler et restaurer l'intégralité des données du portfolio Melek AI en cas d'incident, de corruption de données ou de sinistre majeur.

---

## 1. Principes de Sécurité lors de la Restauration

Pour éviter toute perte accidentelle de données :
1. **Sauvegarde Préalable Obligatoire** : Tout processus de restauration réelle déclenche en amont un instantané automatique (`pre_restore`) de l'état actuel de la base.
2. **Simulation Obligatoire (Dry-Run)** : Il est fortement recommandé d'exécuter systématiquement une simulation avant toute restauration réelle pour vérifier le déchiffrement, l'intégrité de la structure et les volumétries de données.
3. **Chaîne de Confirmation Stricte** : La restauration en direct exige la saisie exacte du jeton de sécurité :
   ```
   CONFIRM_RESTORE_OVERWRITE_PRODUCTION
   ```
   Toute autre valeur ou chaîne incomplète avorte immédiatement l'opération avec un code HTTP 400.
4. **Transaction Atomique par Lots** : La restauration est injectée par lots atomiques (`env.DB.batch(...)`), évitant ainsi un état partiellement corrompu en cas d'erreur réseau ou SQL.

---

## 2. Procédure 1 : Restauration via le Tableau de Bord Admin (Web)

Cette méthode est la plus simple et s'effectue directement depuis l'interface d'administration sécurisée par Cloudflare Zero Trust.

### Étape 1 : Accéder à l'interface
1. Ouvrez `https://portfolio.melekabdelmaksoud72.workers.dev/admin.html`.
2. Connectez-vous avec votre compte administrateur Cloudflare Access (`melekabdelmaksoud72@gmail.com`).
3. Cliquez sur l'onglet **Sauvegardes & Restauration**.

### Étape 2 : Vérification d'intégrité de la sauvegarde
1. Dans la liste des sauvegardes disponibles, localisez la sauvegarde souhaitée.
2. Cliquez sur **Vérifier l'intégrité**.
3. Le système télécharge le bundle chiffré depuis R2, teste le déchiffrement AES-256-GCM, compare les empreintes SHA-256 et affiche :
   - Statut du déchiffrement
   - Nombre de tables et nombre total d'enregistrements
   - Correspondance exacte des empreintes SHA-256

### Étape 3 : Simulation à blanc (Dry-Run)
1. Cliquez sur **Simuler la restauration (Dry-Run)**.
2. Le Worker déchiffre le bundle en mémoire et inspecte chaque table sans rien écrire en base.
3. Le rapport affiche le nombre d'enregistrements qui seraient restaurés pour chaque table (`facts`, `projects`, `users`, `user_chats`, `user_chat_messages`, `analytics`).

### Étape 4 : Restauration Réelle en Production
1. Cliquez sur **Restaurer la sauvegarde**.
2. Une boîte de dialogue de confirmation exigeante s'affiche.
3. Saisissez scrupuleusement la chaîne :
   ```
   CONFIRM_RESTORE_OVERWRITE_PRODUCTION
   ```
4. Cliquez sur **Confirmer et écraser**.
5. Le Worker exécute :
   - Un instantané de secours préalable (`pre_restore`)
   - Le vidage contrôlé des tables actuelles
   - La réinsertion des données de la sauvegarde par lots atomiques
   - La vérification du décompte final
6. Un message de succès vert confirme la fin de la restauration avec le détail des lignes restaurées.

---

## 3. Procédure 2 : Restauration Hors-Ligne & Indépendante (CLI)

En cas d'indisponibilité totale de l'interface Cloudflare ou de perte d'accès au Worker, vous pouvez restaurer la base en local de manière complètement autonome.

### Prérequis
- Node.js version 18 ou supérieure.
- La clé secrète de chiffrement (`BACKUP_ENCRYPTION_KEY`).
- Le fichier binaire `.enc` téléchargé depuis R2 ou exporté localement.

### Étape 1 : Déchiffrement du bundle en local
Utilisez le script autonome `scripts/export-backup.mjs` :

```bash
# Déchiffrer un bundle R2 en fichier JSON clair
node scripts/export-backup.mjs decrypt \
  --file backups/2026-11-22/backup_20261122_030000_a1b2c3.enc \
  --key VOTRE_CLE_AES_256 \
  --output restored_data.json
```

Le script :
1. Valide l'en-tête de version (0x01).
2. Extrait l'IV de 12 octets.
3. Déchiffre avec l'API WebCrypto et valide l'Auth Tag de 16 octets.
4. Vérifie l'empreinte `plain_sha256`.
5. Génère le fichier JSON clair `restored_data.json`.

### Étape 2 : Injection dans une base SQLite ou D1 de secours
Le fichier `restored_data.json` contient les instructions SQL et les enregistrements prêts à être injectés.

#### Injection directe dans Cloudflare D1 via Wrangler :
```bash
# Exporter en instructions SQL
node scripts/export-backup.mjs to-sql \
  --file restored_data.json \
  --output restore.sql

# Appliquer sur la base D1 de test ou de production
npx wrangler d1 execute melek-portfolio-db --remote --file=restore.sql
```

#### Injection dans une base SQLite locale pour vérification immédiate :
```bash
sqlite3 test_restore.db < restore.sql
sqlite3 test_restore.db "SELECT count(*) FROM user_chats;"
sqlite3 test_restore.db "SELECT count(*) FROM user_chat_messages;"
```

---

## 4. Vérification Post-Restauration

Après toute restauration (web ou CLI), effectuez les contrôles suivants :

1. **Vérification des faits Melek AI** :
   ```bash
   curl -s "https://melek-portfolio-api.melekabdelmaksoud72.workers.dev/api/health"
   ```
   Doit renvoyer `{"status":"healthy","database":"connected",...}`.
2. **Vérification des Projets Publiques** :
   Ouvrez le portfolio et vérifiez que les projets s'affichent correctement en français et en anglais.
3. **Vérification des Conversations Utilisateurs** :
   Connectez-vous sur `account.html` avec un compte utilisateur existant et vérifiez que l'historique des conversations passées est fidèlement restitué.
