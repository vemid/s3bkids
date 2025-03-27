// webhook-handler.js - Dodaj ovaj fajl u image-resizer projekat
const express = require('express');
const axios = require('axios');
const router = express.Router();

// Konfiguracija
const MINIO_TO_FTP_WEBHOOK_URL = process.env.MINIO_TO_FTP_WEBHOOK_URL || 'http://minio-to-ftp:3100/process';

// Handler za završen resize process
async function notifyExportService(bucket, objectName) {
    try {
        console.log(`Notifikacija za izvoz slike ${objectName} na FTP...`);

        // Samo za završene resize-ove (slike u /thumb/, /medium/, /large/ folderima)
        if (objectName.includes('/thumb/') ||
            objectName.includes('/medium/') ||
            objectName.includes('/minithumb/') ||
            objectName.includes('/large/')) {

            console.log(`Slanje notifikacije na ${MINIO_TO_FTP_WEBHOOK_URL}`);

            // Slanje notifikacije minio-to-ftp servisu
            await axios.post(MINIO_TO_FTP_WEBHOOK_URL, {
                bucket: bucket,
                object: objectName,
                action: 'export_to_ftp'
            });

            console.log(`Notifikacija poslata za ${objectName}`);
        } else {
            console.log(`Preskačem notifikaciju za originalnu sliku: ${objectName}`);
        }

        return true;
    } catch (err) {
        console.error(`Greška pri notifikaciji za izvoz slike ${objectName}:`, err);
        return false;
    }
}

// Dodaj u postojeći webhook endpoint - treba integrisati u webhook-image-resize-service.js
// U originalnoj funkciji processImage, dodaj na kraju:
/*
// Nakon što su sve verzije slika kreirane, pošalji notifikaciju za izvoz
for (const config of resizeConfigs) {
  // Notifikacija za WebP verziju
  const webpObjectName = `${sku}/${config.folder}/${fileInfo.name}.webp`;
  await notifyExportService(bucketName, webpObjectName);

  // Notifikacija za originalnu verziju ako je sačuvana
  if (OPTIONS.saveOriginalFormat) {
    const origObjectName = `${sku}/${config.folder}/${fileInfo.name}${fileInfo.ext}`;
    await notifyExportService(bucketName, origObjectName);
  }
}
*/

// Eksportuj funkciju za korišćenje u glavnom fajlu
module.exports = { notifyExportService };