# Audit de Sécurité Google Drive (GAS)

![License MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Platform](https://img.shields.io/badge/Platform-Google%20Apps%20Script-green)
![Runtime](https://img.shields.io/badge/Google%20Apps%20Script-V8-green)
![Author](https://img.shields.io/badge/Auteur-Fabrice%20Faucheux-orange)

**gas-drive-security-audit** est une solution backend automatisée développée en Google Apps Script. Elle permet d'identifier proactivement les fichiers exposés publiquement (accessibles via lien sans connexion) au sein de l'organisation.

Ce script couvre deux périmètres critiques : l'espace personnel ("Mon Drive") et l'espace collaboratif ("Drives Partagés" / Team Drives).

## 🚀 Fonctionnalités Clés

* **Double Scope d'Audit :**
    * **Mon Drive :** Analyse récursive des fichiers dont l'utilisateur est propriétaire.
    * **Shared Drives :** Itération automatique sur tous les Drives Partagés accessibles à l'utilisateur.
* **Détection Précise :** Cible les fichiers avec les attributs `visibility = 'anyoneWithLink'` ou `visibility = 'anyoneCanFind'`.
* **Reporting HTML Avancé :** Génération d'un email récapitulatif stylisé (Charte graphique intégrée) avec liens directs vers les fichiers incriminés.
* **Performance :** Utilisation des opérations par lots (batch) et gestion de la pagination (`pageToken`) pour traiter de grands volumes de données.

## 🛠 Prérequis Techniques

Pour fonctionner, ce script nécessite l'activation explicite d'un service avancé dans l'éditeur Apps Script :

1.  Ouvrir le projet Apps Script.
2.  Aller dans **Services** (colonne de gauche) > **Ajouter un service**.
3.  Sélectionner **Drive API**.
4.  **IMPORTANT :** Choisir la **Version v2** (Le script utilise `Drive.Teamdrives` et la syntaxe de requête v2).

## 📦 Installation Manuelle

1.  Créer un nouveau projet Google Apps Script : `audit-drive-securite`.
2.  Copier le contenu de `Code.js` dans l'éditeur.
3.  Activer le service **Drive API v2** (voir prérequis).
4.  Exécuter `lancerScanDrive()` ou `lancerScanSharedDrives()` manuellement pour tester.

## ⚙️ Automatisation

Il est recommandé de créer des déclencheurs (Triggers) pour une surveillance continue :
* **Fréquence :** Hebdomadaire ou Mensuelle.
* **Fonctions cibles :** `lancerScanDrive` et `lancerScanSharedDrives`.
