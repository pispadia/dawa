# Dawa : urgences médicales au Sénégal

Application gratuite pour les urgences médicales, pensée pour les zones où le transport et l'accès aux soins sont difficiles. Voir le [cahier des charges](CAHIER-DES-CHARGES.md).

- **SOS** : on choisit le type d'urgence, puis on a 5 secondes pour annuler. L'app propose ensuite :
  - l'appel au 1515 (SAMU) ou au 18 (pompiers) ;
  - un SMS déjà rempli avec la position GPS et la fiche médicale, pour les proches et pour la structure de santé joignable la plus proche ;
  - les gestes de premiers secours à faire en attendant.
- **Santé proche** : hôpitaux, centres, postes et cases de santé, maternités et pharmacies de tout le Sénégal, triés par distance, avec appel et itinéraire. Ça marche avec le GPS ou une ville choisie.
- **Premiers secours** : 11 fiches (inconscient, étouffement, saignement, accouchement, serpent, scorpion, brûlure, convulsions, accident, diarrhée, fièvre). Le bouton « Écouter » les lit à voix haute.
- **Ma fiche** : groupe sanguin, allergies, maladies, traitements et contacts d'urgence. Elle est stockée **uniquement sur le téléphone**.
- **Langues** : français et wolof.
- **Hors ligne** : l'app s'installe sur Android (PWA) et s'ouvre sans internet. Les structures de santé et les fiches sont gardées sur le téléphone.
- **Bot WhatsApp** : il répond à « urgence », à une position partagée, à « hôpital + ville » et à « serpent », « brûlure », etc. Il garde la recherche de médicaments à Dakar.

## En ligne

**https://dawa-81yj.onrender.com** : hébergé sur Render (offre gratuite, région Francfort), depuis le dépôt [github.com/pispadia/dawa](https://github.com/pispadia/dawa).

- Chaque `git push` sur `main` redéploie automatiquement, en 1 à 2 minutes.
- Le jeton de l'espace équipe (`ADMIN_TOKEN`) est dans le tableau de bord Render, à la rubrique dawa › Environment.
- **Offre gratuite** : le service s'endort après 15 minutes sans visite (environ 30 secondes au réveil). Une fois l'app ouverte une première fois, elle démarre instantanément sur le téléphone, même hors ligne. **La base est effacée à chaque redéploiement ou redémarrage**, donc les numéros vérifiés, les structures ajoutées et les signalements sont perdus. Avant de collecter de vrais numéros, il faut passer à une offre Render avec disque persistant (par exemple monté sur `/var/data`) et définir la variable `DATA_DIR=/var/data`.
- Si une modification ne s'affiche pas sur le téléphone, change `VERSION` dans `public/sw.js`.

## Lancer

Il faut Node.js 22.13 ou plus récent. Aucune installation de paquets n'est nécessaire.

```bash
npm start
```

| Page | Adresse |
|---|---|
| Application d'urgence | http://localhost:3000/ |
| Simulateur WhatsApp | http://localhost:3000/whatsapp |
| Pharmacies : recherche de médicaments (Dakar, démo) | http://localhost:3000/pharmacies |
| Espace pharmacie (démo) | http://localhost:3000/pharmacie : identifiants `pharma1` à `pharma15`, mot de passe `demo1234` |

Pour remettre à zéro les données de démo des pharmacies, serveur arrêté :

```bash
npm run reset
```

## Mettre à jour les structures de santé

Les structures viennent d'**OpenStreetMap** (licence ODbL, la mention est affichée dans l'app). Pour les télécharger à nouveau depuis l'API Overpass :

```bash
node import-osm.js
```

Ça réécrit `data/structures-osm.json` (la base), puis republie `public/data/structures.json` en y ajoutant les numéros vérifiés par l'équipe. Les numéros vérifiés ne sont jamais perdus lors d'un nouvel import. Après une mise à jour en ligne, change `VERSION` dans `public/sw.js` pour que les téléphones récupèrent le nouveau fichier.

## Compléter les numéros de téléphone (espace équipe)

Page : http://localhost:3000/equipe. Elle est protégée par un jeton : définis `ADMIN_TOKEN` en production. Sinon, un jeton est généré à chaque démarrage et affiché dans la console du serveur.

Les numéros arrivent par quatre chemins, et **un numéro n'est publié qu'une fois vérifié** :

| Source | Comment |
|---|---|
| OpenStreetMap | Déjà affichés, avec le badge orange « À vérifier ». Bouton « J'ai appelé, ce numéro marche » ou « Numéro faux ». |
| Utilisateurs | Bouton « Je connais le numéro » dans l'app. Ça arrive dans l'onglet *Propositions* : appeler, puis valider ou rejeter. |
| Équipe et bénévoles | Saisie directe sur une structure, ou campagne d'appels : *Campagne d'appels* → télécharger la liste d'une zone (CSV pour Excel) → remplir `numero_verifie` et `source` → réimporter. |
| District et ministère | Même fichier CSV, avec la source `district` ou `ministere`. |

**Structures manquantes** : beaucoup de postes et de cases de santé ne sont pas dans OpenStreetMap. Elles s'ajoutent dans l'espace équipe (« + Ajouter une structure ») avec un lien Google Maps ou des coordonnées, ou par le CSV (ligne avec `id` vide). Elles sont gardées en base et survivent à un nouvel import OSM.

Le plan de collecte est dans [docs/campagne-appels.md](docs/campagne-appels.md). Un brouillon de lettre au ministère de la Santé est dans [docs/lettre-ministere.md](docs/lettre-ministere.md) : il faut le compléter, rien n'a été envoyé.

Un numéro vérifié s'affiche avec **✔ vérifié** dans l'app et dans le bot WhatsApp. Il est utilisé en priorité dans l'étape « Préviens la structure la plus proche » de l'alerte SOS. Les signalements des utilisateurs (« fermé », « mauvais endroit »…) arrivent dans l'onglet *Signalements*.

Tout est stocké dans la table `numeros` de `data/dawa.db`, avec la source, la date et une note.

## Fichiers

| Fichier | Rôle |
|---|---|
| `public/index.html`, `app.js`, `app.css` | Application d'urgence (SOS, santé proche, secours, fiche) |
| `public/i18n.js` | Textes en français et en wolof |
| `public/secours.js` | Fiches de premiers secours |
| `public/villes.js` | Coordonnées des villes (sans GPS), partagées avec le bot |
| `public/sw.js`, `manifest.webmanifest` | Mode hors ligne et installation |
| `public/data/structures.json` | Structures de santé (généré par `import-osm.js`) |
| `import-osm.js` | Import et classement des structures OpenStreetMap |
| `bot.js` | Bot WhatsApp |
| `server.js`, `db.js`, `services.js` | API, base SQLite, partie pharmacies |

## Brancher le vrai WhatsApp

`POST /api/whatsapp` accepte le format Twilio : `From` et `Body`, plus `Latitude` et `Longitude` quand la personne partage sa position. Il répond en TwiML.

1. Créer un compte Twilio et activer le *WhatsApp Sandbox*.
2. Mettre le serveur en ligne, ou utiliser `ngrok http 3000` en local.
3. Dans Twilio, sous *When a message comes in*, mettre `https://ton-domaine/api/whatsapp`.

## Limites connues

- **Seules 19 % des structures de soins ont un numéro** dans OpenStreetMap, et aucun n'est encore vérifié. Le sud et l'est n'en ont presque aucun (Kolda, Kédougou, Tambacounda, Ziguinchor, Matam : 0). Ces zones manquent aussi de structures dans OSM (Kolda : 14), il faudra donc aussi en **ajouter**, pas seulement trouver leurs numéros. Voir « Compléter les numéros » ci-dessus.
- **Limite d'envois par adresse IP** : 10 par heure pour les propositions, signalements et réservations ; 10 essais par 15 minutes pour les connexions pharmacie et équipe. Derrière un hébergeur (Render, Railway…), il faut définir `TRUST_PROXY=1` pour que l'IP réelle soit utilisée. Les compteurs sont en mémoire et remis à zéro à chaque redémarrage.
- **Les données OSM contiennent des doublons et des erreurs** de type ou de nom. Le bouton « Signaler une erreur » sert à les corriger au fil du temps.
- **Le SMS n'est pas envoyé automatiquement** : il s'ouvre déjà rempli et il faut appuyer sur « Envoyer ». L'envoi automatique demandera une vraie app Android (Capacitor).
- **La position n'est pas transmise au SAMU** : il faudra un partenariat avec lui.
- **Pas encore d'USSD** : il faut un accord avec les opérateurs.
- **Le wolof est une première traduction** : à faire relire par un locuteur. Les fiches restent en français, et l'audio wolof est à enregistrer (`public/audio/<fiche>-wo.mp3`, par exemple `serpent-wo.mp3`).
- **Les fiches de premiers secours sont un brouillon** : elles doivent être validées par un professionnel de santé avant tout lancement public.
- **Les numéros 1515, 18 et 17** sont à reconfirmer auprès des autorités avant le lancement.
- **La partie pharmacies (Dakar) utilise des données fictives.**
