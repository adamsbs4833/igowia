# Igow'Ia — Chatbot Web Design

## Contexte

Créer un chatbot web nommé **Igow'Ia**, gratuit à faire fonctionner, capable de répondre à
n'importe quelle question tout en étant particulièrement fiable sur les sujets liés à Discord
(API développeurs, bots, modération, configuration de serveur, fonctionnalités, etc.).

## Objectif

Une application web locale avec une interface de chat animée et moderne, où l'utilisateur
discute avec Igow'Ia et obtient des réponses générées par un modèle de langage via une API
gratuite.

## Approche technique

- **Backend** : Node.js + Express
  - Sert le frontend statique (HTML/CSS/JS)
  - Expose `POST /api/chat` : reçoit l'historique de conversation, appelle l'API Groq
    (`groq-sdk`, modèle Llama 3.3 70B) avec un system prompt fixe, renvoie la réponse
  - Clé API lue depuis `.env` (`GROQ_API_KEY`), jamais exposée au client
- **Frontend** : HTML/CSS/JS vanilla, pas de framework
  - Interface de chat : zone de messages, champ de saisie, bouton d'envoi
  - Historique de conversation gardé en mémoire JS (tableau), envoyé à chaque requête pour
    conserver le contexte ; perdu à la fermeture de l'onglet (pas de persistance disque)

## System prompt (comportement d'Igow'Ia)

Igow'Ia se présente comme un assistant généraliste capable de répondre à toute question, avec
une expertise particulière et fiable sur Discord. Aucune base de connaissances externe n'est
utilisée : on s'appuie sur les connaissances déjà intégrées au modèle Llama 3.3 70B servi par
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

## Configuration & secrets

- `.env` (exclu de git) : `GROQ_API_KEY=...`
- `README.md` : instructions pour créer un compte gratuit sur console.groq.com et générer
  une clé API (aucune carte bancaire requise), et comment lancer l'application localement

## Gestion des erreurs

- Clé API absente ou invalide, quota dépassé, ou échec réseau : un message d'erreur clair et
  lisible s'affiche directement dans le fil de discussion (pas de crash, pas d'erreur brute
  exposée à l'utilisateur)

## Hors périmètre (explicitement exclu)

- Pas de persistance de conversation entre sessions
- Pas de comptes utilisateurs / authentification
- Pas d'intégration Discord réelle (bot Discord) — il s'agit d'un chatbot web *expert en
  sujets Discord*, pas d'un bot qui tourne dans Discord
- Pas de base de connaissances externe (documentation Discord non intégrée séparément)
- Pas de tests automatisés formels (vérification manuelle du bon fonctionnement une fois
  implémenté)
