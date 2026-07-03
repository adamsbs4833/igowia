# Igow'Ia — Chatbot Web Design

## Contexte

Créer un chatbot web nommé **Igow'Ia**, gratuit à faire fonctionner, capable de répondre à
n'importe quelle question tout en étant particulièrement fiable sur les sujets liés à Discord
(API développeurs, bots, modération, configuration de serveur, fonctionnalités, etc.).

## Objectif

Une application web **accessible publiquement via un lien** (hébergée gratuitement), avec une
interface de chat animée et moderne, où n'importe quel visiteur discute avec Igow'Ia et obtient
des réponses générées par un modèle de langage via une API gratuite. Un administrateur peut
mettre le service en maintenance à distance via une page d'admin protégée par un code.

## Approche technique

- **Backend** : Node.js + Express
  - Sert le frontend statique (HTML/CSS/JS)
  - Expose `POST /api/chat` : reçoit l'historique de conversation, appelle l'API Groq
    (`groq-sdk`, modèle **Llama 3.1 8B**) avec un system prompt fixe, renvoie la réponse.
    Refuse (message de maintenance) si le mode maintenance est actif.
  - Expose les routes admin (voir section dédiée)
  - Clé API Groq lue depuis `.env` (`GROQ_API_KEY`), jamais exposée au client
- **Frontend** : HTML/CSS/JS vanilla, pas de framework
  - Interface de chat : zone de messages, champ de saisie, bouton d'envoi
  - Historique de conversation gardé en mémoire JS (tableau), envoyé à chaque requête pour
    conserver le contexte ; perdu à la fermeture de l'onglet (pas de persistance disque)
- **Hébergement** : Render (plan gratuit), déploiement depuis un dépôt Git, URL publique type
  `igowia.onrender.com`. Le plan gratuit met le service en veille après inactivité (~30s de
  réveil au premier accès suivant une pause) — mentionné dans le README.

## Choix du modèle (contrainte de quota)

Le plan gratuit Groq limite l'usage. Le modèle **Llama 3.3 70B** n'autorise que 1000
requêtes/jour au total (tous visiteurs confondus) — trop risqué pour un lien public. On utilise
donc **Llama 3.1 8B** : 14 400 requêtes/jour, 500 000 tokens/jour, qualité de réponse largement
suffisante pour du chat généraliste + expertise Discord.

## System prompt (comportement d'Igow'Ia)

Igow'Ia se présente comme un assistant généraliste capable de répondre à toute question, avec
une expertise particulière et fiable sur Discord. Aucune base de connaissances externe n'est
utilisée : on s'appuie sur les connaissances déjà intégrées au modèle Llama 3.1 8B servi par
Groq.

## Identité visuelle

- **Nom** : Igow'Ia, affiché en typographie avec effet néon/dégradé (violet → bleu)
- **Icône** : petit symbole SVG abstrait (bulle de dialogue stylisée avec une étincelle),
  affiché à côté du nom
- **Thème** : sombre, dégradés violet/bleu néon, effets de lueur (glow) sur les éléments clés
  (logo, bouton d'envoi, bulles de réponse du bot)

## Animations

- Fond avec dégradé animé subtil, mouvement lent façon "aurore"
- Apparition en fondu/glissement des bulles de message (envoyées et reçues)
- Indicateur de frappe animé (points pulsants) pendant qu'Igow'Ia génère sa réponse
- Lueur pulsante douce sur le logo/nom
- Micro-interactions au survol/clic sur les boutons

## Panel admin (`/admin`)

Accès protégé par un code secret (pas de nom d'utilisateur, juste un code).

- **Authentification** : champ de saisie masqué (type `password`). Le code est comparé côté
  serveur à `ADMIN_CODE` (stocké dans `.env`). Il n'est jamais renvoyé par l'API, jamais loggé,
  jamais visible dans le HTML/JS envoyé au navigateur. Une session admin simple (cookie signé
  ou token en mémoire serveur) évite de renvoyer le code à chaque action une fois connecté.
- **Activer/Désactiver la maintenance** : bouton toggle. Quand actif, `POST /api/chat` renvoie
  directement le message de maintenance sans appeler Groq, et le frontend désactive le champ de
  saisie en affichant ce message à la place du chat.
- **Message de maintenance personnalisable** : champ texte modifiable depuis le panel (stocké
  en mémoire serveur, valeur par défaut fournie), sans avoir à toucher au code ni redéployer.
- **Limite de messages par visiteur** : réglage du nombre max de messages autorisés par IP et
  par heure (valeur par défaut raisonnable fournie), pour éviter qu'un petit groupe de visiteurs
  épuise le quota gratuit Groq pour tout le monde. Compteurs simples en mémoire serveur
  (réinitialisés au redémarrage — pas besoin de base de données pour ce besoin).
- **Compteur d'utilisation** : affichage du nombre de messages envoyés aujourd'hui (remis à
  zéro chaque jour), pour surveiller la consommation du quota gratuit de 14 400 requêtes/jour.

## Configuration & secrets

- `.env` (exclu de git) : `GROQ_API_KEY=...` et `ADMIN_CODE=...`
- `README.md` : instructions pour créer un compte gratuit sur console.groq.com et générer
  une clé API (aucune carte bancaire requise), comment définir le code admin, comment lancer
  l'application en local, et comment la déployer sur Render

## Gestion des erreurs

- Clé API absente ou invalide, quota dépassé, ou échec réseau : un message d'erreur clair et
  lisible s'affiche directement dans le fil de discussion (pas de crash, pas d'erreur brute
  exposée à l'utilisateur)
- Code admin incorrect : message d'erreur simple sur la page `/admin`, pas d'indice sur la
  raison précise de l'échec
- Limite de messages par visiteur atteinte : message clair indiquant de réessayer plus tard

## Hors périmètre (explicitement exclu)

- Pas de persistance de conversation entre sessions
- Pas de comptes utilisateurs / authentification pour les visiteurs (seul l'admin a un accès
  protégé)
- Pas d'intégration Discord réelle (bot Discord) — il s'agit d'un chatbot web *expert en
  sujets Discord*, pas d'un bot qui tourne dans Discord
- Pas de base de connaissances externe (documentation Discord non intégrée séparément)
- Pas de tests automatisés formels (vérification manuelle du bon fonctionnement une fois
  implémenté)
- Pas de base de données : compteurs et réglages admin gardés en mémoire serveur (réinitialisés
  à chaque redémarrage/redéploiement du service)
