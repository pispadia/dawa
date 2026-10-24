# Dawa : cahier des charges V1

> Une application gratuite pour les urgences médicales partout au Sénégal, surtout là où le transport et l'accès aux soins sont difficiles.

## Décisions prises

| Sujet | Choix |
|---|---|
| Prix | Gratuit pour tous |
| Zone | Tout le Sénégal |
| Langues | Français et wolof (pulaar, sérère et diola plus tard) |
| Canaux | App Android, WhatsApp, SMS et USSD |
| Alerte envoyée à | Secours officiels (SAMU 1515, pompiers 18), proches, poste de santé le plus proche |
| Équipe | Le porteur du projet et Claude |
| Financement | À chercher plus tard, avec la démo en main |
| V1 | Les 4 briques ensemble, chacune dans sa version la plus simple |

## Les 4 briques de la V1

### 1. SOS urgence
- Un **gros bouton SOS** sur l'écran d'accueil, qu'on peut utiliser même paniqué.
- On choisit le type d'urgence : accouchement, accident, malaise, morsure, brûlure, enfant malade, autre.
- L'app **ouvre l'appel** vers le 1515 (SAMU) ou le 18 (pompiers), selon le type d'urgence.
- En même temps, elle **envoie un SMS** aux proches enregistrés et au poste de santé le plus proche. Le SMS contient le type d'urgence, la position GPS (lien Google Maps), le nom et la fiche médicale résumée.
- **Fonctionne sans internet** : le GPS marche sans données mobiles, et le SMS passe par le réseau normal.
- Ce qu'on ne peut pas faire : envoyer automatiquement la position au SAMU. Il faudrait un partenariat avec eux (objectif de la V2).

### 2. Santé proche
- Carte et liste des hôpitaux, centres de santé, postes de santé et cases de santé les plus proches, avec distance, téléphone et itinéraire.
- Pharmacies de garde, en reprenant la partie déjà construite.
- **Données** : OpenStreetMap et healthsites.io au départ, puis la carte sanitaire du ministère et des corrections par les utilisateurs. **C'est le plus gros travail** : sans numéros fiables pour les postes de santé, l'alerte poste de santé ne marche pas.
- Les données sont gardées sur le téléphone pour marcher hors connexion.

### 3. Premiers secours
- Fiches courtes avec des gestes simples : accouchement imprévu, hémorragie, morsure de serpent, brûlure, convulsions, étouffement, accident de la route, déshydratation de l'enfant, piqûre de scorpion.
- Texte et **audio en wolof et en français**, avec images.
- Disponibles hors connexion.
- **Obligatoire** : chaque fiche doit être relue et validée par un professionnel de santé avant publication. On peut partir des guides de la Croix-Rouge.

### 4. Fiche médicale
- Nom, âge, groupe sanguin, allergies, maladies (diabète, drépanocytose, hypertension, épilepsie, grossesse), traitements, contacts d'urgence.
- **Stockée seulement sur le téléphone** : rien sur nos serveurs, pour la confidentialité.
- Affichée en grand sur l'écran SOS pour que les secours la voient, et résumée dans le SMS d'alerte.

## Canaux

| Canal | V1 | Plus tard |
|---|---|---|
| **App Android** (PWA installable, puis Play Store) | Tout | Envoi de SMS automatique (sans appuyer sur « envoyer ») |
| **WhatsApp** | Santé proche, pharmacies, premiers secours, rappel des numéros d'urgence | SOS via le partage de position |
| **SMS** | Envoi des alertes depuis le téléphone de l'utilisateur | Recevoir « SOS » par SMS sur un numéro court |
| **USSD** (#xxx#) | Non | Nécessite un accord avec Orange, Free et Expresso (ou un agrégateur) : à demander dès maintenant, car c'est long |

## Choix techniques (simples à maintenir pour une personne seule)

- **Une seule application web installable (PWA)** : marche sur Android et sur ordinateur, sans passer par le Play Store au début, avec un mode hors connexion.
- On garde le **serveur Node actuel** pour les données (structures de santé, pharmacies) et le bot WhatsApp.
- Plus tard, on emballe la PWA avec Capacitor pour la publier sur le Play Store et envoyer les SMS automatiquement.

## Ce dont on aura besoin, hors code

1. **Un professionnel de santé** pour valider les fiches de premiers secours. C'est non négociable.
2. **Une voix wolof** pour enregistrer les audios.
3. **Les numéros des postes de santé** : à collecter et vérifier.
4. Un premier contact avec le **SAMU national** et le **ministère de la Santé**, pour la légitimité et le partenariat de la V2.
5. Une demande de **code USSD** auprès des opérateurs.

## Risques

| Risque | Comment on le réduit |
|---|---|
| Un mauvais conseil de premiers secours aggrave une situation | Validation médicale obligatoire. Message clair : « Appelle d'abord le 1515 ». |
| Numéro de poste de santé faux ou injoignable | Vérification et signalement par les utilisateurs. Les proches et le 1515 reçoivent toujours l'alerte. |
| Pas de réseau du tout | La fiche médicale et les premiers secours restent consultables hors ligne. Le SMS part dès que le réseau revient. |
| Fausses alertes | Confirmation avant l'envoi, et un compte à rebours de 5 secondes pour annuler. |
