// webhook-image-resize-service.js - UPDATED VERSION
const Minio = require('minio');
const sharp = require('sharp');
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Kreiranje Express aplikacije za webhook
const app = express();
app.use(express.json({ limit: '50mb' }));
const PORT = 3000;

// Konfiguracija iz env varijabli
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000');
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'admin';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'password123';
const BUCKET_NAME = process.env.BUCKET_NAME || 'products';

// Konfiguracija za MinIO-to-FTP webhook
const MINIO_TO_FTP_WEBHOOK_URL = process.env.MINIO_TO_FTP_WEBHOOK_URL || 'http://minio-to-ftp:3100/process';
const ENABLE_FTP_EXPORT = process.env.ENABLE_FTP_EXPORT === 'true' || true;

// Privremeni direktorijum za fajlove
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// Konfiguracija MinIO klijenta
const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: false,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY
});

// Definisanje konfiguracija za različite veličine slika
const resizeConfigs = [
  {
    suffix: 'minithumbnail',
    folder: 'minithumb',
    width: 75
  },
  {
    suffix: 'thumbnail',
    folder: 'thumb',
    width: 150
  },
  {
    suffix: 'medium',
    folder: 'medium',
    width: 800
  },
  {
    suffix: 'large',
    folder: 'large',
    width: 1200
  }
];

// Opcije servisa
const OPTIONS = {
  // Da li čuvati originalni format pored WebP formata
  saveOriginalFormat: true,
  // Da li brisati originalne fajlove nakon obrade
  deleteOriginalAfterProcess: true
};

console.log(`Servis za promenu veličine slika se pokreće...`);
console.log(`MinIO konfiguracija: ${MINIO_ENDPOINT}:${MINIO_PORT}`);
console.log(`Bucket: ${BUCKET_NAME}`);
console.log(`FTP izvoz ${ENABLE_FTP_EXPORT ? 'omogućen' : 'onemogućen'}`);
if (ENABLE_FTP_EXPORT) {
  console.log(`MinIO-to-FTP webhook URL: ${MINIO_TO_FTP_WEBHOOK_URL}`);
}

// Dodaj health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('Servis je aktivan');
});

// Funkcija za izvlačenje SKU iz naziva fajla
function extractSKU(filename) {
  // Uzmi samo naziv fajla bez putanje
  const basename = path.basename(filename);

  // Izdvoji SKU (prvih 13 karaktera)
  // Podržava nazive poput: 251OM0M43B00.jpg, 251OM0M43B00_1.jpg, itd.
  const match = basename.match(/^([A-Za-z0-9]{13})/);

  if (match && match[1]) {
    return match[1];
  }

  // Ako ne možemo izdvojiti prema pravilu, vrati ceo naziv bez ekstenzije
  return path.parse(basename).name;
}

// Funkcija za notifikaciju o obrađenoj slici za izvoz na FTP
async function notifyExportService(bucket, objectName) {
  if (!ENABLE_FTP_EXPORT) return true;

  try {
    console.log(`Notifikacija za izvoz slike ${objectName} na FTP...`);

    // Šaljemo notifikaciju samo za resized slike
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

// Funkcija za obradu slike
async function processImage(bucketName, objectName) {
  try {
    console.log(`Obrada slike: ${objectName} iz bucket-a ${bucketName}`);

    // Preskoči već obrađene slike (slike u SKU folderima)
    if (objectName.includes('/thumb/') ||
        objectName.includes('/medium/') ||
        objectName.includes('/minithumb/') ||
        objectName.includes('/large/')) {
      console.log(`Preskačem već obrađenu sliku: ${objectName}`);
      return;
    }

    // Izvuci SKU iz naziva fajla
    const sku = extractSKU(objectName);
    console.log(`Izdvojen SKU: ${sku} iz ${objectName}`);

    // Priprema privremenog fajla
    const tempFilePath = path.join(TEMP_DIR, `original_${Date.now()}_${path.basename(objectName)}`);

    // Preuzimanje originalne slike
    await minioClient.fGetObject(bucketName, objectName, tempFilePath);
    console.log(`Slika preuzeta u: ${tempFilePath}`);

    // Priprema naziva fajla
    const filename = path.basename(objectName);
    const fileInfo = path.parse(filename);

    // Obrada za svaku konfiguraciju veličine
    for (const config of resizeConfigs) {
      try {
        // 1. Prvo obradi WebP verziju
        const webpTempPath = path.join(TEMP_DIR, `${fileInfo.name}_${config.suffix}_${Date.now()}.webp`);

        // Pripremi sharp instancu sa resize opcijama
        const sharpInstance = sharp(tempFilePath)
            .resize({
              width: config.width,
              height: null, // Automatski računa visinu za očuvanje proporcija
              withoutEnlargement: true  // Ne uvećava slike koje su manje od ciljne veličine
            });

        // Snimi WebP verziju
        await sharpInstance
            .clone()
            .webp({ quality: 100 })
            .toFile(webpTempPath);

        // Kreiraj putanju za WebP sliku u SKU strukturi
        const webpObjectName = `${sku}/${config.folder}/${fileInfo.name}.webp`;

        // Postavljanje WebP slike u MinIO
        await minioClient.fPutObject(
            bucketName,
            webpObjectName,
            webpTempPath
        );

        console.log(`Kreirana WebP slika: ${webpObjectName}`);

        // Obriši WebP privremeni fajl
        if (fs.existsSync(webpTempPath)) {
          fs.unlinkSync(webpTempPath);
        }

        // Šalji notifikaciju za WebP verziju
        await notifyExportService(bucketName, webpObjectName);

        // 2. Sačuvaj i originalni format ako je opcija uključena
        if (OPTIONS.saveOriginalFormat) {
          const origTempPath = path.join(TEMP_DIR, `${fileInfo.name}_${config.suffix}_${Date.now()}${fileInfo.ext}`);

          // Snimi u originalnom formatu
          await sharpInstance
              .clone()
              .toFile(origTempPath);

          // Kreiraj putanju za originalnu sliku u SKU strukturi
          const origObjectName = `${sku}/${config.folder}/${fileInfo.name}${fileInfo.ext}`;

          // Postavljanje originalne slike u MinIO
          await minioClient.fPutObject(
              bucketName,
              origObjectName,
              origTempPath
          );

          console.log(`Kreirana originalna slika: ${origObjectName}`);

          // Obriši originalni privremeni fajl
          if (fs.existsSync(origTempPath)) {
            fs.unlinkSync(origTempPath);
          }

          // Šalji notifikaciju za originalnu verziju
          await notifyExportService(bucketName, origObjectName);
        }
      } catch (resizeErr) {
        console.error(`Greška pri resize-u za ${config.suffix}:`, resizeErr);
      }
    }

    // Obriši originalni privremeni fajl
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    console.log('Privremeni fajlovi obrisani');

    // Obriši originalni fajl iz bucket-a ako je opcija uključena
    if (OPTIONS.deleteOriginalAfterProcess) {
      try {
        console.log(`Brisanje originalne slike iz bucket-a: ${objectName}`);
        await minioClient.removeObject(bucketName, objectName);
        console.log(`Originalna slika obrisana: ${objectName}`);
      } catch (deleteErr) {
        console.error(`Greška pri brisanju originalne slike: ${deleteErr}`);
      }
    }

  } catch (err) {
    console.error('Greška pri obradi slike:', err);
  }
}

// Ručni endpoint za obradu slike
app.post('/resize', async (req, res) => {
  try {
    const { bucket, object } = req.body;

    if (!bucket || !object) {
      return res.status(400).send('Nedostaju parametri bucket i object');
    }

    // Pokreni obradu u pozadini
    processImage(bucket, object)
        .then(() => console.log(`Ručna obrada završena za ${bucket}/${object}`))
        .catch(err => console.error(`Greška pri ručnoj obradi: ${err}`));

    // Odmah vrati odgovor klijentu
    res.status(202).send(`Obrada slike ${object} je pokrenuta`);
  } catch (error) {
    console.error('Greška pri obradi zahteva:', error);
    res.status(500).send('Interna greška servera');
  }
});

// Webhook endpoint za MinIO notifikacije
app.post('/webhook', async (req, res) => {
  console.log('Primljena webhook notifikacija');

  try {
    // Brzo vrati odgovor da ne blokiramo MinIO
    res.status(200).send('Notifikacija primljena');

    const records = req.body.Records || [];
    console.log(`Primljeno ${records.length} zapisa u notifikaciji`);

    for (const record of records) {
      if (record.eventName && record.eventName.startsWith('s3:ObjectCreated:')) {
        const bucketName = record.s3.bucket.name;
        const objectName = record.s3.object.key;

        console.log(`Detektovano kreiranje objekta: ${bucketName}/${objectName}`);

        // Obrađujemo samo slike i preskačemo već obrađene
        if (objectName.includes('/thumb/') ||
            objectName.includes('/medium/') ||
            objectName.includes('/minithumb/') ||
            objectName.includes('/large/')) {
          console.log(`Preskačem već obrađenu sliku: ${objectName}`);
          continue;
        }

        // Pokreni obradu u pozadini
        processImage(bucketName, objectName)
            .catch(err => console.error(`Greška pri obradi slike ${objectName}: ${err}`));
      }
    }
  } catch (error) {
    console.error('Greška pri obradi webhook notifikacije:', error);
  }
});

// Test endpoint
app.get('/', (req, res) => {
  res.send('Image Resizer servis je aktivan! Koristite /webhook za MinIO notifikacije ili /resize za ručnu obradu.');
});

// Funkcija za obradu postojećih slika
async function processExistingImages(bucketName) {
  console.log(`Obrada postojećih slika u bucket-u: ${bucketName}`);

  try {
    // Provera da li bucket postoji
    const bucketExists = await minioClient.bucketExists(bucketName);
    if (!bucketExists) {
      console.log(`Bucket ${bucketName} ne postoji. Kreiranje...`);
      await minioClient.makeBucket(bucketName);
      console.log(`Bucket ${bucketName} kreiran.`);
      return; // Nema slika za obradu u novom bucket-u
    }

    const objects = await listAllObjects(bucketName);
    console.log(`Pronađeno ${objects.length} objekata u bucket-u ${bucketName}`);

    let imageCount = 0;

    for (const obj of objects) {
      // Preskoči već obrađene slike (slike u SKU folderima)
      if (obj.name.includes('/thumb/') ||
          obj.name.includes('/medium/') ||
          obj.name.includes('/large/')) {
        continue;
      }

      // Provera da li je fajl slika (po ekstenziji)
      const fileExtension = path.extname(obj.name).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(fileExtension)) {
        imageCount++;
        await processImage(bucketName, obj.name);
      }
    }

    console.log(`Obrada postojećih slika završena. Obrađeno ${imageCount} slika.`);
  } catch (err) {
    console.error('Greška pri obradi postojećih slika:', err);
  }
}

// Pomoćna funkcija za izlistavanje svih objekata u bucket-u
async function listAllObjects(bucketName) {
  return new Promise((resolve, reject) => {
    const objects = [];
    const stream = minioClient.listObjects(bucketName, '', true);

    stream.on('data', (obj) => objects.push(obj));
    stream.on('error', reject);
    stream.on('end', () => resolve(objects));
  });
}

// Glavni deo programa
async function main() {
  // Pokreni Express server za webhook
  app.listen(PORT, () => {
    console.log(`Webhook server pokrenut na portu ${PORT}`);
    console.log(`Čekam MinIO notifikacije na http://localhost:${PORT}/webhook`);

    // Obradi postojeće slike
    setTimeout(() => {
      processExistingImages(BUCKET_NAME)
          .then(() => {
            console.log('Inicijalna obrada završena, čekam nove slike...');
          })
          .catch(err => {
            console.error('Greška pri inicijalnoj obradi:', err);
          });
    }, 10000); // Sačekaj 10 sekundi da se MinIO potpuno inicijalizuje
  });
}

main().catch(err => {
  console.error('Greška u glavnom programu:', err);
});