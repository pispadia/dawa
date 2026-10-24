# Plan de campagne : compléter les numéros des structures de santé

**Objectif :** que chaque personne en urgence puisse joindre la structure de soins la plus proche, avec un numéro **vérifié**.

**Point de départ (OpenStreetMap, octobre 2026) :** 1 030 structures de soins, 195 numéros à vérifier, 835 sans numéro, 0 vérifié.

## Phase 1 : vérifier les numéros qui existent déjà (2 semaines, depuis Dakar)

Les 195 numéros OpenStreetMap sont surtout dans le nord : Saint-Louis, Podor, Richard-Toll, Ourossogui, Dakar. On les appelle tous. C'est rapide, et on obtient tout de suite des numéros ✔ vérifiés dans l'app.

1. Espace équipe → *Campagne d'appels* → Structures : **« À vérifier ou à trouver »**, zone par zone.
2. On appelle chaque numéro de la colonne `numero_actuel`.
3. Si la structure répond : on recopie le numéro dans `numero_verifie`, avec la source `appel`.
4. Si le numéro est faux ou ne répond pas après 3 essais (à des heures différentes) : on le note dans `note` et on laisse `numero_verifie` vide. Ensuite, dans l'espace équipe, on clique sur « Numéro faux ».
5. On réimporte le fichier.

**Objectif :** 120 numéros vérifiés.

## Phase 2 : région pilote Kolda (1 mois)

Kolda n'a **aucun numéro** et seulement 14 structures dans OpenStreetMap, alors que la région compte beaucoup plus de postes et de cases de santé. C'est exactement le public visé par Dawa.

1. **District d'abord** : contacter les médecins-chefs des districts de la région (Kolda, Vélingara, Médina Yoro Foulah). Leur demander la liste de leurs postes et cases de santé, avec le numéro de service de chaque infirmier chef de poste (ICP).
2. **Ajouter les structures manquantes** dans l'espace équipe : nom, type, position (lien Google Maps), numéro.
3. **Appeler chaque numéro** pour confirmer avant de publier.
4. **Relais locaux** : radio communautaire, mairies, badienou gox (marraines de quartier), relais communautaires. Ils peuvent faire connaître l'app et faire remonter des numéros via le bouton « Je connais le numéro ».

**Objectif :** 80 % des postes et centres de santé de la région avec un numéro vérifié.

## Phase 3 : étendre région par région

Ordre suggéré, des plus mal couvertes aux mieux couvertes : Kédougou → Tambacounda → Sédhiou → Ziguinchor → Matam → Kaffrine → le reste.

## Script d'appel

> **FR :** Bonjour, je m'appelle [prénom], je travaille sur Dawa, une application gratuite qui aide les gens en urgence médicale à trouver le poste de santé le plus proche. Je suis bien au [nom de la structure], à [village / commune] ?
> Est-ce que ce numéro est le bon pour vous joindre, ou pour joindre l'infirmier ou la sage-femme en cas d'urgence ?
> Est-ce que vous êtes d'accord pour que ce numéro soit affiché dans l'application ?
> Merci beaucoup !

> **WO (à faire relire) :** Salaamaalekum, maa ngi tudd [tur]. Damay liggéey ci Dawa, aplikasiyoŋ bu dul fey buy dimbali nit ñi am jamono bu metti, ñu gis poste de santé bi gën a jege. Ndax [tur fajukaay bi] laa woo, ci [dëkk bi] ?
> Ndax nimero bii lañuy jëfandikoo ngir woo infirmier walla sage-femme bi bu am jamono bu metti ?
> Ndax nangu ngeen ñu wone nimero bi ci aplikasiyoŋ bi ?
> Jërëjëf !

## Règles

- **On publie uniquement des numéros de service**, ou un numéro personnel si la personne a **clairement accepté** qu'il soit affiché.
- Un numéro est marqué vérifié **seulement si quelqu'un de la structure a répondu** et confirmé.
- **On ne publie jamais** un numéro trouvé sur internet sans l'avoir appelé.
- On revérifie chaque numéro **tous les 6 mois** : les infirmiers changent de poste.

## Équipe et coût

| | Phase 1 | Phase 2 (Kolda) |
|---|---|---|
| Bénévoles appelants | 2 à 3 | 3 à 5 (dont 1 qui parle pulaar) |
| Crédit téléphone | ~15 000 FCFA | ~40 000 FCFA |
| Temps estimé | ~10 h d'appels | ~40 h, plus les échanges avec les districts |

Ce sont des estimations à affiner après la première semaine.

## Suivi

L'espace équipe affiche tout en direct : vérifiés, à vérifier et sans numéro, au total et par zone (onglet *Par zone*). Un point chaque semaine : nombre vérifié, taux de numéros faux, zones bloquées.
