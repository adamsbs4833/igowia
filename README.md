# Igow'Ia

Chatbot web gratuit, généraliste avec une expertise Discord, propulsé par l'API Groq (modèle
Llama 3.1 8B).

## Configuration

1. Copie `.env.example` en `.env` :
   ```bash
   cp .env.example .env
   ```
2. Crée une clé API Groq gratuite (aucune carte bancaire requise) :
   - Va sur https://console.groq.com
   - Crée un compte
   - Dans le menu de gauche, clique sur "API Keys" puis "Create API Key"
   - Copie la clé (commence par `gsk_...`) dans `.env`, sur la ligne `GROQ_API_KEY=`
3. Choisis un code admin (une suite de chiffres/lettres de ton choix) et mets-le dans `.env`,
   sur la ligne `ADMIN_CODE=`. Ce code protège la page `/admin` qui permet de mettre le site en
   maintenance.

## Lancer en local

```bash
npm install
npm start
```

- Chat : http://localhost:3000
- Admin : http://localhost:3000/admin

## Déployer gratuitement sur Render

**Note sur `package-lock.json` :** ce dépôt ne contient pas de `package-lock.json` car
l'environnement de développement utilisé ne disposait que de Bun (pas de npm). Avant ton premier
déploiement, il est recommandé de lancer `npm install` une fois sur une machine avec Node.js/npm
installés, puis de committer le `package-lock.json` généré pour des builds reproductibles. Sans
ça, `npm install` fonctionnera quand même sur Render (il résout des versions compatibles à chaque
build), mais les versions ne sont pas figées.

1. Pousse ce projet sur un dépôt GitHub.
2. Crée un compte gratuit sur https://render.com.
3. Clique sur "New" → "Blueprint", puis sélectionne ton dépôt (Render détecte `render.yaml`
   automatiquement).
4. Render te demandera de renseigner `GROQ_API_KEY` et `ADMIN_CODE` (les valeurs de ton `.env`
   local) dans les variables d'environnement du service — elles ne sont jamais lues depuis le
   dépôt Git.
5. Une fois déployé, ton site est accessible via un lien du type
   `https://igowia.onrender.com`.

**Note :** le plan gratuit de Render met le service en veille après une période d'inactivité.
Le premier visiteur après une pause peut attendre ~30 secondes le temps que le service se
réveille.

## Limites du plan gratuit Groq

Le modèle Llama 3.1 8B autorise jusqu'à 14 400 messages par jour, tous visiteurs confondus. Le
nombre de messages du jour est visible dans le panel `/admin`.

À noter : ce compteur et les limites de débit par visiteur sont stockés en mémoire et repartent
donc à zéro si le service redémarre (par exemple lors du réveil après une pause d'inactivité sur
le plan gratuit de Render).
