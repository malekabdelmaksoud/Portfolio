# Architecture du Système de Sauvegarde Automatisée & Chiffrement — Melek AI

## 1. Vue d'Ensemble & Objectifs

Le système de sauvegarde de **Melek AI Portfolio** garantit la durabilité, la confidentialité et l'intégrité de l'ensemble des données critiques (faits de connaissance Melek AI, projets, comptes utilisateurs, sessions, et historiques complets de conversations et messages).

Il respecte les principes directeurs suivants :
1. **Confidentialité absolue** : Toutes les sauvegardes stockées sont chiffrées de bout en bout avec **AES-256-GCM**. Même avec un accès direct au stockage R2, les données brutes restent indéchiffrables sans la clé secrète.
2. **Intégrité cryptographique** : Calcul systématique de doubles empreintes **SHA-256** (données en clair et bundle chiffré) avec vérification de l'étiquette d'authentification (Auth Tag GCM de 128 bits) avant toute manipulation.
3. **Gratuité & Conformité Cloudflare Free Tier** :
   - Cloudflare Workers Cron Trigger (1 exécution par jour = ~30 req/mois, inclus dans les 100k req/jour gratuites).
   - Cloudflare R2 (10 Go de stockage gratuit, 1 million d'opérations Class A/mois). La taille moyenne d'une sauvegarde compressée/chiffrée étant de ~15 Ko, 30 jours de rétention consomment moins de **500 Ko** par mois.
4. **Indépendance vis-à-vis de l'hébergeur** : Les sauvegardes sont exportables et restaurables hors de Cloudflare à tout moment grâce à des outils standards (script autonome `scripts/export-backup.mjs` et SQLite standard).

---

## 2. Diagramme de Flux de Sauvegarde

```
   +-----------------------------------------------------------+
   |                Cloudflare Cron Trigger                    |
   |                   (03:00 UTC / daily)                     |
   +-----------------------------+-----------------------------+
                                 |
                                 v
   +-----------------------------------------------------------+
   |              Worker exportD1Database(env)                 |
   |  - Extraction des tables: facts, projects, users,         |
   |    user_chats, user_chat_messages, analytics, backup_logs |
   |  - Sérialisation JSON normalisée                          |
   +-----------------------------+-----------------------------+
                                 |
                                 v
   +-----------------------------------------------------------+
   |           Chiffrement AES-256-GCM (WebCrypto)             |
   |  - Génération d'un IV aléatoire de 96 bits (12 octets)    |
   |  - Chiffrement du JSON + Authentification Tag (16 octets) |
   |  - Calcul SHA-256 (clair) & SHA-256 (chiffré)             |
   +-----------------------------+-----------------------------+
                                 |
                                 v
   +-----------------------------------------------------------+
   |             Validation Immédiate (Self-Test)              |
   |  - Déchiffrement à blanc pour valider la clé et le flux   |
   |  - Échec immédiat si l'empreinte ne correspond pas        |
   +-----------------------------+-----------------------------+
                                 |
                 +---------------+---------------+
                 |                               |
                 v                               v
   +---------------------------+   +---------------------------+
   | Cloudflare R2 Bucket      |   | Cloudflare D1 Database    |
   | backups/YYYY-MM-DD/       |   | Table: backup_logs        |
   | backup_*.enc              |   | Enregistrement métadonnées|
   +---------------------------+   +---------------------------+
                 |
                 v
   +-----------------------------------------------------------+
   |          Épuration Automatique (pruneOldBackups)          |
   |  - Suppression des sauvegardes > 30 jours dans R2         |
   |  - Mise à jour des statuts dans backup_logs               |
   +-----------------------------------------------------------+
```

---

## 3. Spécifications Cryptographiques (AES-256-GCM)

Le chiffrement est exécuté nativement via l'API standard **WebCrypto** (`crypto.subtle`), sans dépendances externes vulnérables :

- **Algorithme** : AES-GCM (Galois/Counter Mode).
- **Taille de clé** : 256 bits (32 octets), dérivée ou fournie via le secret de Worker `BACKUP_ENCRYPTION_KEY`.
- **Vecteur d'Initialisation (IV)** : 12 octets (96 bits) cryptographiquement sécurisés (`crypto.getRandomValues(new Uint8Array(12))`), unique pour chaque sauvegarde.
- **Tag d'authentification** : 128 bits (16 octets), garantissant qu'aucune altération ou corruption de bloc chiffré ne peut être injectée sans déclencher une exception immédiate.
- **Format du Bundle binaire chiffré** :
  ```
  +--------------+---------------+-------------------------------------+
  | Version (1B) |   IV (12B)    | Ciphertext + Auth Tag (Variable)    |
  | 0x01         | Random Nonce  | Données chiffrées + 16 octets tag   |
  +--------------+---------------+-------------------------------------+
  ```
- **Contrôle d'intégrité à double niveau** :
  1. `plain_sha256` : Empreinte SHA-256 hexadécimale calculée sur la charge utile JSON avant chiffrement.
  2. `cipher_sha256` : Empreinte SHA-256 hexadécimale calculée sur le fichier binaire `.enc` stocké dans R2.

---

## 4. Schéma de Stockage & Structure des Données

### 4.1. Conventions de Nommage dans R2
Les objets sont stockés sous l'arborescence :
```
backups/{YYYY-MM-DD}/backup_{YYYYMMDD_HHMMSS}_{bundleId}.enc
```
*Exemple :* `backups/2026-11-22/backup_20261122_030000_a1b2c3d4e5f6.enc`

### 4.2. Métadonnées Associées aux Objets R2
Chaque upload injecte des métadonnées personnalisées HTTP :
- `x-amz-meta-version`: `"1.0"`
- `x-amz-meta-bundle-id`: Identifiant unique du bundle
- `x-amz-meta-plain-sha256`: Hash du clair
- `x-amz-meta-cipher-sha256`: Hash du bundle
- `x-amz-meta-record-count`: Nombre total d'enregistrements

### 4.3. Table D1 `backup_logs`
Créée via la migration `0010_backup_logs.sql` :
```sql
CREATE TABLE IF NOT EXISTS backup_logs (
    id TEXT PRIMARY KEY,
    backup_type TEXT NOT NULL,       -- 'scheduled' | 'manual' | 'pre_restore'
    status TEXT NOT NULL,            -- 'success' | 'failed' | 'pruned'
    storage_provider TEXT NOT NULL,  -- 'cloudflare_r2' | 'local_export'
    file_key TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    record_count INTEGER NOT NULL,
    plain_sha256 TEXT NOT NULL,
    cipher_sha256 TEXT NOT NULL,
    tables_included TEXT NOT NULL,   -- JSON array: ["facts","projects",...]
    error_message TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
);
```

---

## 5. Tables D1 Sauvegardées

| Table | Rôle & Contenu | Sensibilité |
|---|---|---|
| `facts` | Base de connaissances de Melek AI (faits vérifiés) | Haute (Propriété intellectuelle) |
| `projects` | Projets du portfolio, imports GitHub/GitLab | Publique / Administrateur |
| `users` | Comptes utilisateurs, hashes de mots de passe, rôles | Critique (Données personnelles) |
| `user_chats` | Titres des conversations, timestamps, liaison `user_email` | Critique (Confidentialité) |
| `user_chat_messages` | Contenu textuel complet des requêtes et réponses de Melek AI | Critique (Secret des correspondances) |
| `analytics` | Statistiques de visite anonymisées | Faible |
| `backup_logs` | Historique et état des sauvegardes | Haute (Audit & Traçabilité) |

---

## 6. Politique de Rétention (Retention & Rotation)

- **Fréquence** : 1 exécution par jour à 03:00 UTC via Worker Cron.
- **Durée de conservation** : 30 jours glissants.
- **Mécanisme d'épuration** :
  À chaque cycle de sauvegarde réussi, la fonction `pruneOldBackups(env, 30)` :
  1. Calcule la date limite `cutoff = Date.now() - 30 jours`.
  2. Parcourt les objets dans R2 sous le préfixe `backups/`.
  3. Supprime les objets plus anciens que la limite.
  4. Marque les entrées correspondantes dans `backup_logs` avec `status = 'pruned'`.

---

## 7. Indépendance Hors Cloudflare (Zero Vendor Lock-in)

Pour garantir qu'une défaillance totale ou un verrouillage de compte Cloudflare ne compromette pas les données :
1. **Script Autonome `scripts/export-backup.mjs`** : Permet à l'administrateur d'exécuter un export complet ou de déchiffrer un bundle `.enc` en local avec sa clé `BACKUP_ENCRYPTION_KEY`.
2. **Format Ouvert** : La charge utile déchiffrée est un JSON standard contenant les structures de tables et les listes d'objets, directement importable dans n'importe quelle base SQLite3, PostgreSQL ou MySQL.
