const Minio = require('minio');
const sharp = require('sharp');
const express = require('express');
const fs = require('fs');
const path = require('path');
const FTPClient = require('ftp'); // Dodajemo FTP klijent

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

// FTP konfiguracija iz env varijabli
const ENABLE_FTP_EXPORT = process.env.ENABLE_FTP_EXPORT === 'true' || false;
const FTP_HOST = process.env.FTP_HOST;
const FTP_PORT = parseInt(process.env.FTP_PORT || '21');
const FTP_USER = process.env.FTP_USER;
const FTP_PASSWORD = process.env.FTP_PASSWORD;
const FTP_SECURE = process.env.FTP_SECURE === 'true' || false;
const FTP_EXPORT_PATH = process.env.FTP_EXPORT_PATH || '/';
const EXTENSIONS_TO_EXPORT = (process.env.EXTENSIONS_TO_EXPORT || '.jpg').split(',');
const SIZES_TO_EXPORT = (process.env.SIZES_TO_EXPORT || 'medium,large').split(',');
const OVERWRITE_EXISTING = process.env.OVERWRITE_EXISTING === 'false' || true;

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

// Logiranje FTP konfiguracije ako je omogućeno
if (ENABLE_FTP_EXPORT) {
  console.log(`FTP izvoz je omogućen`);
  console.log(`FTP konfiguracija: ${FTP_HOST}:${FTP_PORT}`);
  console.log(`FTP putanja: ${FTP_EXPORT_PATH}`);
  console.log(`Ekstenzije za izvoz: ${EXTENSIONS_TO_EXPORT.join(', ')}`);
  console.log(`Veličine za izvoz: ${SIZES_TO_EXPORT.join(', ')}`);
} else {
  console.log('FTP izvoz je onemogućen');
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

// Pomoćne funkcije za FTP
function ftpConnect() {
  return new Promise((resolve, reject) => {
    if (!ENABLE_FTP_EXPORT) {
      reject(new Error('FTP izvoz je onemogućen'));
      return;
    }

    const client = new FTPClient();

    client.on('ready', () => {
      resolve(client);
    });

    client.on('error', (err) => {
      reject(err);
    });

    client.connect({
      host: FTP_HOST,
      port: FTP_PORT,
      user: FTP_USER,
      password: FTP_PASSWORD,
      secure: FTP_SECURE
    });
  });
}

// Funkcija za FTP upload
function ftpPut(client, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    client.put(localPath, remotePath, (err) => {
      if (err) reject(err);
      else resolve(true);
    });
  });
}

// Funkcija za proveru da li treba izvesti sliku na FTP
function shouldExportToFTP(objectName) {
  // Ako FTP izvoz nije omogućen, ne izvozimo ništa
  if (!ENABLE_FTP_EXPORT) return false;

  // Provera veličine (folder)
  const isSizeToExport = SIZES_TO_EXPORT.length === 0 ||
      SIZES_TO_EXPORT.some(size => objectName.includes(`/${size}/`));

  if (!isSizeToExport) return false;

  // Provera ekstenzije
  const extension = path.extname(objectName).toLowerCase();
  const isExtensionToExport = EXTENSIONS_TO_EXPORT.length === 0 ||
      EXTENSIONS_TO_EXPORT.includes(extension);

  return isExtensionToExport;
}

// Funkcija za export slike na FTP
async function exportToFTP(bucketName, objectName) {
  if (!shouldExportToFTP(objectName)) {
    return false;
  }

  let client;
  try {
    console.log(`Izvoz slike ${objectName} na FTP...`);

    // Privremena putanja za preuzimanje
    const tempFilePath = path.join(TEMP_DIR, `ftp_${Date.now()}_${path.basename(objectName)}`);

    // Preuzimanje slike iz MinIO
    await minioClient.fGetObject(bucketName, objectName, tempFilePath);
    console.log(`Slika preuzeta u: ${tempFilePath}`);

    // Povezivanje na FTP
    client = await ftpConnect();
    console.log(`Povezan na FTP server`);

    // Putanja na FTP serveru (samo ime fajla, bez foldera)
    const ftpPath = path.posix.join(FTP_EXPORT_PATH, path.basename(objectName));

    // Upload na FTP
    await ftpPut(client, tempFilePath, ftpPath);
    console.log(`Slika ${objectName} uspešno izvezena na FTP kao ${ftpPath}`);

    // Brisanje privremenog fajla
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
      console.log(`Privremeni fajl ${tempFilePath} obrisan`);
    }

    return true;
  } catch (err) {
    console.error(`Greška pri izvozu slike ${objectName} na FTP:`, err);
    return false;
  } finally {
    if (client) {
      client.end();
    }
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

    // Lista obrađenih slika za FTP izvoz
    const processedImages = [];

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

        // Dodaj u listu obrađenih slika
        processedImages.push(webpObjectName);

        // Obriši WebP privremeni fajl
        if (fs.existsSync(webpTempPath)) {
          fs.unlinkSync(webpTempPath);
        }

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

          // Dodaj u listu obrađenih slika
          processedImages.push(origObjectName);

          // Obriši originalni privremeni fajl
          if (fs.existsSync(origTempPath)) {
            fs.unlinkSync(origTempPath);
          }
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

    // Izvoz obrađenih slika na FTP ako je omogućeno
    if (ENABLE_FTP_EXPORT) {
      console.log(`Pokretanje izvoza ${processedImages.length} slika na FTP...`);
      for (const img of processedImages) {
        await exportToFTP(bucketName, img);
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

// Endpoint za ručni izvoz na FTP
app.post('/export-to-ftp', async (req, res) => {
  try {
    const { bucket, object } = req.body;

    if (!bucket || !object) {
      return res.status(400).send('Nedostaju parametri bucket i object');
    }

    if (!ENABLE_FTP_EXPORT) {
      return res.status(400).send('FTP izvoz je onemogućen');
    }

    // Pokreni izvoz u pozadini
    exportToFTP(bucket, object)
        .then(success => console.log(`Ručni izvoz ${success ? 'uspešan' : 'neuspešan'} za ${bucket}/${object}`))
        .catch(err => console.error(`Greška pri ručnom izvozu: ${err}`));

    // Odmah vrati odgovor klijentu
    res.status(202).send(`Izvoz slike ${object} na FTP je pokrenut`);
  } catch (error) {
    console.error('Greška pri obradi zahteva za izvoz:', error);
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

          // Ako je resize slika i FTP izvoz je omogućen, izvozimo je na FTP
          if (ENABLE_FTP_EXPORT && shouldExportToFTP(objectName)) {
            exportToFTP(bucketName, objectName)
                .catch(err => console.error(`Greška pri izvozu slike ${objectName} na FTP:`, err));
          }

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

// Endpoint za ručno izvršavanje FTP izvoza svih slika
app.post('/ftp-export-all', async (req, res) => {
  try {
    if (!ENABLE_FTP_EXPORT) {
      return res.status(400).send('FTP izvoz je onemogućen');
    }

    res.status(202).send('Započet je izvoz svih slika na FTP. Ovo može potrajati...');

    console.log('Pokretanje izvoza svih slika na FTP...');

    const objects = await listAllObjects(BUCKET_NAME);
    const imagesToExport = objects.filter(obj => shouldExportToFTP(obj.name));

    console.log(`Pronađeno ${imagesToExport.length} slika za izvoz na FTP`);

    for (const img of imagesToExport) {
      await exportToFTP(BUCKET_NAME, img.name);
    }

    console.log('Izvoz svih slika na FTP je završen');
  } catch (error) {
    console.error('Greška pri izvozu svih slika na FTP:', error);
  }
});

// Glavni deo programa
async function main() {
  // Pokreni Express server za webhook
  app.listen(PORT,'0.0.0.0', () => {
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