# Igow'Ia v2 — Chat Enrichment & Admin Expansion

## Contexte

Igow'Ia (chatbot web gratuit, thème gold/black, propulsé par Groq) est en production sur Render.
Cette itération ajoute des fonctionnalités de confort côté chat public, et étoffe le panel admin
avec du contenu éditable, de la visibilité sur l'usage, et de la gestion des visiteurs
limités/bloqués.

## Objectif

Rendre le chat plus vivant et pratique à utiliser, et donner à l'admin plus de contrôle et de
visibilité sans jamais introduire de base de données (contrainte héritée du design original).

## Partie A — Chat public

### A1. Suggestions de démarrage

Quand la conversation est vide (avant le premier message), 4 boutons-suggestions s'affichent
au-dessus du champ de saisie (questions fixes, orientées Discord/généraliste, codées en dur
côté frontend). Cliquer sur une suggestion remplit le champ et envoie le message immédiatement.
Les suggestions disparaissent dès qu'un message est envoyé.

### A2. Bouton "Effacer la conversation"

Un bouton dans l'en-tête du chat vide le tableau `history` côté client, vide le DOM des
messages, et réaffiche l'écran d'accueil (message de bienvenue + suggestions). Aucun appel
réseau nécessaire — c'est un reset purement client.

### A3. Copier une réponse

Chaque bulle de réponse d'Igow'Ia affiche un petit bouton "copier" (icône), qui copie le texte
brut de la réponse dans le presse-papier via `navigator.clipboard.writeText`.

### A4. Rendu Markdown léger

Les réponses d'Igow'Ia sont d'abord échappées (HTML-escape complet), puis une fonction maison
transforme un sous-ensemble minimal de Markdown en HTML sûr : `**gras**`, `*italique*`,
`` `code en ligne` ``, et blocs de code ``` ``` ```. Pas de support des liens/images (évite
d'introduire une surface d'injection via `href`). Implémentée dans un nouveau fichier
`public/js/markdown.js`, sans dépendance externe.

### A5. Effet machine à écrire

La réponse (après rendu Markdown) s'affiche progressivement, caractère par caractère (ou par
petits groupes pour rester fluide), au lieu d'apparaître d'un coup. L'indicateur de frappe
existant disparaît dès que le texte commence à s'afficher.

### A6. Particules dorées en fond

Un `<canvas>` en fond de page (derrière le contenu, `position: fixed`) anime une vingtaine de
petits points dorés qui dérivent lentement et bouclent en haut/bas de l'écran. Implémenté dans
un nouveau fichier `public/js/particles.js`, indépendant du reste du chat (peut échouer sans
casser le chat).

### A7. Sons discrets

Deux sons courts générés via l'API Web Audio (oscillateur, pas de fichiers audio à charger) :
un bip doux à l'envoi d'un message, un bip légèrement différent à la réception d'une réponse.
Nouveau fichier `public/js/sounds.js`.

### A8. Message d'accueil éditable

Un message de bienvenue s'affiche dans la zone de messages au chargement de la page (avant tout
échange), tant que `history` est vide. Sa valeur vient du backend (voir Partie B) via un nouvel
appel `GET /api/config` (public, sans authentification) au chargement de la page.

## Partie B — Panel admin

### B1. Message d'accueil + note de ton

Deux nouveaux champs dans le panel admin, sauvegardés en mémoire serveur (comme le message de
maintenance actuel) :
- **Message d'accueil** : texte affiché aux visiteurs (voir A8)
- **Note de ton** : instruction libre ajoutée à la fin du system prompt d'Igow'Ia (ex: "Sois
  plus familier et utilise des emojis"). Vide par défaut (aucun ajout au comportement de base).

Une nouvelle route `POST /api/admin/content` (protégée) met à jour les deux champs. Le system
prompt effectif envoyé à Groq devient : `SYSTEM_PROMPT + "\n\n" + noteDeTon` (si non vide).

### B2. Graphique d'utilisation (7 jours)

`src/state.js` garde désormais un historique glissant des 7 derniers jours (tableau de
`{date, count}`, le jour le plus ancien est supprimé quand un nouveau jour commence). Une
nouvelle route `GET /api/admin/usage-history` (protégée) renvoie ce tableau. Le panel admin
l'affiche en histogramme simple (barres construites en CSS, hauteur proportionnelle au nombre de
messages, pas de librairie de graphiques). Une note rappelle que l'historique repart à zéro si
le service redémarre (même limite que le compteur du jour actuel).

### B3. Visiteurs limités / tentatives de connexion échouées

`src/state.js` expose la liste des IP actuellement au-dessus de leur limite horaire de messages,
et la liste des IP actuellement bloquées après 5 échecs de code admin. Une nouvelle route
`GET /api/admin/blocked` (protégée) renvoie les deux listes. Le panel admin les affiche avec un
bouton "Débloquer" par entrée, qui appelle `POST /api/admin/unblock` (protégée,
`{ type: 'rate-limit' | 'login', ip }`) pour réinitialiser l'entrée correspondante.

## Flux de données (nouveaux appels)

- Chargement de la page de chat → `GET /api/config` → `{ welcomeMessage }` → affiché si
  `history` est vide
- Envoi d'un message → `POST /api/chat` (inchangé) → le backend ajoute la note de ton au system
  prompt avant l'appel Groq
- Panel admin au chargement → `GET /api/admin/status` (existant, inchangé) +
  `GET /api/admin/usage-history` + `GET /api/admin/blocked`
- Sauvegarde admin → `POST /api/admin/content` (nouveau, message d'accueil + ton),
  `POST /api/admin/maintenance` / `POST /api/admin/rate-limit` (existants, inchangés)
- Déblocage → `POST /api/admin/unblock`

## Gestion des erreurs

- `GET /api/config` échoue (réseau) : le chat fonctionne quand même, juste sans message
  d'accueil affiché (pas de blocage)
- Rendu Markdown : toute construction imprévue retombe sur l'affichage du texte brut échappé
  (jamais de HTML non échappé affiché)
- Déblocage d'une IP qui n'est déjà plus bloquée : réponse `{ ok: true }` idempotente (pas
  d'erreur si l'entrée a expiré naturellement entre-temps)

## Hors périmètre (explicitement exclu)

- Changer le code admin (`ADMIN_CODE`) depuis le panel — nécessiterait de modifier la variable
  d'environnement Render, abandonné faute de solution propre
- Persistance des données au-delà de la mémoire serveur (toujours pas de base de données) —
  l'historique 7 jours, le message d'accueil, la note de ton, et les listes de blocage
  redémarrent à zéro si le service redémarre
- Liens/images dans le rendu Markdown (risque d'injection, non supporté)
- Personnalisation des suggestions de démarrage depuis l'admin (restent codées en dur)
