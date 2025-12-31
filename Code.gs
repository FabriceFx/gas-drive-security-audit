/**
 * @fileoverview Script d'audit de sécurité Google Drive (Mon Drive & Drives Partagés).
 * Détecte les fichiers avec une visibilité publique (lien ouvert) et notifie l'utilisateur par email.
 * @author Fabrice Faucheux
 * @version 1.0.1
 * @license MIT
 */

/**
 * Point d'entrée pour l'application Web (si déployée).
 * @return {HtmlOutput} La page HTML évaluée.
 */
const doGet = () => {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Audit Drive Sécurité')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
};

// ==========================================
// 1. AUDIT "MON DRIVE"
// ==========================================

/**
 * Scanne le "Mon Drive" de l'utilisateur courant pour trouver les fichiers publics.
 * Filtre sur 'owner' pour ne remonter que les fichiers dont l'utilisateur est propriétaire.
 * @return {string} Message de résultat pour l'interface utilisateur.
 */
const lancerScanDrive = () => {
  const emailUtilisateur = Session.getActiveUser().getEmail();
  console.log("Scan 'Mon Drive' démarré...");
  
  try {
    // Optimisation : On laisse Google filtrer par propriétaire et visibilité
    const requete = "'me' in owners and trashed = false and (visibility = 'anyoneWithLink' or visibility = 'anyoneCanFind')";
    const fichiersPublics = [];
    let pageToken = null;

    do {
      const resultats = Drive.Files.list({
        q: requete,
        maxResults: 1000,
        pageToken: pageToken,
        fields: "nextPageToken, items(title, alternateLink, userPermission(role))" 
      });

      if (resultats.items) {
        resultats.items.forEach(f => {
          // Double vérification stricte du rôle Owner
          if (f.userPermission && f.userPermission.role === 'owner') {
            fichiersPublics.push({ nom: f.title, url: f.alternateLink });
          }
        });
      }
      pageToken = resultats.nextPageToken;
    } while (pageToken);

    if (fichiersPublics.length > 0) {
      envoyerEmailRecap(fichiersPublics, emailUtilisateur, "MON_DRIVE");
      return `Succès : ${fichiersPublics.length} fichiers publics trouvés dans VOTRE Drive.`;
    } else {
      return "Mon Drive : Aucun fichier public détecté.";
    }

  } catch (e) {
    gestionErreur(e);
  }
};

// ==========================================
// 2. AUDIT "DRIVES PARTAGÉS" (Shared Drives)
// ==========================================

/**
 * Scanne l'ensemble des Drives Partagés accessibles pour trouver les fichiers publics.
 * Itère sur chaque Drive Partagé trouvé.
 * @return {string} Message de résultat pour l'interface utilisateur.
 */
const lancerScanSharedDrives = () => {
  const emailUtilisateur = Session.getActiveUser().getEmail();
  console.log("Scan 'Drives Partagés' démarré...");

  try {
    // Étape A : Récupérer la liste des Drives Partagés accessibles
    let teamDrives = [];
    let pageTokenTD = null;
    do {
      const tdList = Drive.Teamdrives.list({
        maxResults: 100,
        pageToken: pageTokenTD,
        fields: "nextPageToken, items(id, name)"
      });
      if (tdList.items) teamDrives = teamDrives.concat(tdList.items);
      pageTokenTD = tdList.nextPageToken;
    } while (pageTokenTD);

    console.log(`${teamDrives.length} Drives Partagés trouvés. Analyse en cours...`);

    // Étape B : Scanner chaque Drive Partagé
    const resultatsGroupes = {}; // Objet pour stocker : { "Nom Drive": [fichiers...] }
    let totalFichiers = 0;

    teamDrives.forEach(td => {
      const requete = "trashed = false and (visibility = 'anyoneWithLink' or visibility = 'anyoneCanFind')";
      let pageToken = null;
      
      do {
        // Paramètres spécifiques pour les Team Drives (corpora, includeItemsFromAllDrives)
        const resultats = Drive.Files.list({
          q: requete,
          corpora: 'drive',           // Recherche dans un drive spécifique
          driveId: td.id,             // ID du Team Drive actuel
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
          maxResults: 1000,
          pageToken: pageToken,
          fields: "nextPageToken, items(title, alternateLink)"
        });

        if (resultats.items && resultats.items.length > 0) {
          if (!resultatsGroupes[td.name]) resultatsGroupes[td.name] = [];
          
          resultats.items.forEach(f => {
            resultatsGroupes[td.name].push({ nom: f.title, url: f.alternateLink });
            totalFichiers++;
          });
        }
        pageToken = resultats.nextPageToken;
      } while (pageToken);
    });

    // Étape C : Envoi du rapport
    if (totalFichiers > 0) {
      envoyerEmailRecap(resultatsGroupes, emailUtilisateur, "SHARED_DRIVE");
      return `Succès : ${totalFichiers} fichiers publics trouvés dans ${Object.keys(resultatsGroupes).length} Drives Partagés.`;
    } else {
      return "Drives Partagés : Aucun fichier public détecté.";
    }

  } catch (e) {
    gestionErreur(e);
  }
};

// ==========================================
// 3. UTILITAIRES (Email & Gestion d'erreurs)
// ==========================================

/**
 * Gère les erreurs et lance une exception formatée.
 * Vérifie spécifiquement les erreurs de configuration API.
 * @param {Error} e - L'objet erreur capturé.
 */
const gestionErreur = (e) => {
  console.error(e);
  if (e.message.includes("Invalid field selection") || e.message.includes("items") || e.message.includes("Teamdrives")) {
    throw new Error("Erreur Config : Assurez-vous que le service 'Drive API' est activé en version 'v2'.");
  }
  throw new Error("Erreur Backend : " + e.message);
};

/**
 * Génère et envoie le rapport HTML par email.
 * @param {Array|Object} data - Les données trouvées (Tableau pour Mon Drive, Objet pour Shared Drives).
 * @param {string} destinataire - L'email du destinataire.
 * @param {string} typeAudit - Le type d'audit ("MON_DRIVE" ou "SHARED_DRIVE").
 */
const envoyerEmailRecap = (data, destinataire, typeAudit) => {
  const CHARTE = {
    bleu: "#045973",
    gris: "#f4f6f8",
    // Placeholder générique (image 150x50px)
    logo: "https://via.placeholder.com/150x50?text=Logo+Entreprise" 
  };
  
  const estMyDrive = typeAudit === "MON_DRIVE";
  const sujetTag = estMyDrive ? "[AUDIT MON DRIVE]" : "[AUDIT SHARED DRIVES]";
  
  let nombreTotal = 0;
  let contenuHTML = "";

  if (estMyDrive) {
    nombreTotal = data.length;
    contenuHTML = genererTableauHTML(data, CHARTE.bleu);
  } else {
    Object.keys(data).forEach(driveName => {
      const fichiers = data[driveName];
      nombreTotal += fichiers.length;
      contenuHTML += `
        <h3 style="color: ${CHARTE.bleu}; margin-top: 20px; border-bottom: 2px solid #ddd; padding-bottom: 5px;">
          📂 Drive : ${driveName}
        </h3>
        ${genererTableauHTML(fichiers, CHARTE.bleu)}
      `;
    });
  }

  const sujet = `${sujetTag} Sécurité : ${nombreTotal} fichiers publics détectés`;
  const dateAudit = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date());

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <body style="margin: 0; padding: 0; background-color: ${CHARTE.gris}; font-family: 'Source Sans Pro', sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding: 20px;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background: white; border-radius: 8px; overflow: hidden;">
            <tr><td align="center" style="padding: 20px; border-bottom: 4px solid ${CHARTE.bleu};">
              <img src="${CHARTE.logo}" width="150" style="display: block; alt: 'Logo Organisation'">
            </td></tr>
            <tr><td style="padding: 30px;">
              <h1 style="color: ${CHARTE.bleu}; text-align: center; font-size: 22px;">Rapport d'Audit : ${estMyDrive ? "Mon Espace" : "Drives Partagés"}</h1>
              <p style="text-align: center; color: #555;">Analyse du <strong>${dateAudit}</strong></p>
              
              <div style="background: #e8f4f8; border: 1px solid #d1e7dd; color: #0f5132; padding: 15px; border-radius: 6px; text-align: center; margin-bottom: 20px;">
                <strong style="font-size: 18px;">${nombreTotal} fichier(s) public(s)</strong>
              </div>

              ${contenuHTML}

            </td></tr>
            <tr><td style="background: #f9f9f9; padding: 15px; text-align: center; font-size: 12px; color: #999;">
              Département IT • Sécurité des Données
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  MailApp.sendEmail({ to: destinataire, subject: sujet, htmlBody: htmlBody, name: "Audit Sécurité" });
};

/**
 * Helper pour générer le tableau HTML des fichiers.
 * @param {Array} liste - Liste des fichiers.
 * @param {string} couleurBtn - Couleur hexadécimale du bouton.
 * @return {string} HTML du tableau.
 */
const genererTableauHTML = (liste, couleurBtn) => {
  const max = 50; 
  const listeAffichee = liste.slice(0, max);
  let html = `<table width="100%" style="border: 1px solid #eee; margin-bottom: 20px;">`;
  
  html += listeAffichee.map(f => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee; font-size: 13px; color: #333;">${f.nom}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
        <a href="${f.url}" style="background:${couleurBtn}; color:white; text-decoration:none; padding:4px 10px; border-radius:4px; font-size:11px; font-weight:bold;">Voir</a>
      </td>
    </tr>`).join('');
    
  if (liste.length > max) {
    html += `<tr><td colspan="2" style="padding:10px; text-align:center; color:#888; font-size:12px;">... et ${liste.length - max} autres.</td></tr>`;
  }
  html += "</table>";
  return html;
};
