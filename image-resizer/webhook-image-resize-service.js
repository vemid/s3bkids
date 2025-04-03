const Minio = require('minio');
const sharp = require('sharp');
const express = require('express');
const fs = require('fs');
const path = require('path');
const ftp = require("basic-ftp"); // <-- Dodaj FTP biblioteku

// Kreiranje Express aplikacije za webhook
const app = express();
app.use(express.json({ limit: '50mb' }));
const PORT = process.env.PORT || 3000; // <-- Koristi PORT env var za fleksibilnost

// Konfiguracija iz env varijabli
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000');
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'admin';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'password123';
const BUCKET_NAME = process.env.BUCKET_NAME || 'products';

// <-- Dodaj FTP konfiguraciju -->
const FTP_HOST = process.env.FTP_HOST;
const FTP_PORT = parseInt(process.env.FTP_PORT || '21');
const FTP_USER = process.env.FTP_USER;
const FTP_PASSWORD = process.env.FTP_PASSWORD;
const FTP_SECURE = process.env.FTP_SECURE === 'true'; // Mora biti 'true' da bi bilo true
const FTP_REMOTE_BASE_PATH = process.env.FTP_REMOTE_PATH || '/'; // Osnovni direktorijum na FTP-u

// Validacija FTP konfiguracije (osnovna)
if (!FTP_HOST || !FTP_USER || !FTP_PASSWORD) {
  console.warn('!!! UPOZORENJE: FTP konfiguracija nije kompletna (FTP_HOST, FTP_USER, FTP_PASSWORD). FTP upload će biti preskočen. !!!');
}
// <-- Kraj FTP konfiguracije -->

// Privremeni direktorijum za fajlove
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// Konfiguracija MinIO klijenta
const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: false, // Razmotri da li ti treba SSL za MinIO
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY
});

// Definisanje konfiguracija za različite veličine slika
const resizeConfigs = [
  { suffix: 'minithumbnail', folder: 'minithumb', width: 75 },
  { suffix: 'thumbnail', folder: 'thumb', width: 150 },
  { suffix: 'medium', folder: 'medium', width: 800 },
  { suffix: 'large', folder: 'large', width: 1200 }
];

// Opcije servisa
const OPTIONS = {
  saveOriginalFormat: true,
  deleteOriginalAfterProcess: true
};

console.log(`Servis za promenu veličine slika se pokreće...`);
console.log(`MinIO konfiguracija: ${MINIO_ENDPOINT}:${MINIO_PORT}`);
console.log(`Bucket: ${BUCKET_NAME}`);
if (FTP_HOST && FTP_USER) {
  console.log(`FTP konfiguracija: Host=${FTP_HOST}, User=${FTP_USER}, Secure=${FTP_SECURE}, BasePath=${FTP_REMOTE_BASE_PATH}`);
} else {
  console.log(`FTP upload je onemogućen (nedostaje konfiguracija).`);
}


// Dodaj health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('Servis je aktivan');
});

// Funkcija za izvlačenje SKU iz naziva fajla
function extractSKU(filename) {
  const basename = path.basename(filename);
  const match = basename.match(/^([A-Za-z0-9]{13})/);
  if (match && match[1]) {
    return match[1];
  }
  return path.parse(basename).name;
}

// <-- Nova funkcija za FTP upload -->
async function uploadToFtp(localFilePath, remoteFtpPath) {
  // Preskoči ako FTP nije konfigurisan
  if (!FTP_HOST || !FTP_USER || !FTP_PASSWORD) {
    // console.log(`FTP preskočen za ${localFilePath} (nije konfigurisan)`);
    return;
  }

  const client = new ftp.Client();
  // client.ftp.verbose = true; // Uključi za detaljno logovanje FTP komandi (za debug)
  try {
    console.log(`Povezivanje na FTP: ${FTP_HOST}:${FTP_PORT}...`);
    await client.access({
      host: FTP_HOST,
      port: FTP_PORT,
      user: FTP_USER,
      password: FTP_PASSWORD,
      secure: FTP_SECURE
    });
    console.log(`FTP konektovan. Upload fajla: ${localFilePath} -> ${remoteFtpPath}`);

    // Osiguraj da postoji odredišni direktorijum
    const remoteDir = path.dirname(remoteFtpPath).replace(/\\/g, '/'); // FTP koristi '/'
    console.log(`Osiguravanje FTP direktorijuma: ${remoteDir}`);
    await client.ensureDir(remoteDir);

    // Upload fajla
    await client.uploadFrom(localFilePath, remoteFtpPath);
    console.log(`FTP upload uspešan: ${remoteFtpPath}`);

  } catch(err) {
    console.error(`!!! GREŠKA pri FTP upload-u (${remoteFtpPath}):`, err);
    // Odluči da li želiš da greška pri FTP upload-u prekine dalju obradu
    // Ovde samo logujemo grešku i nastavljamo dalje
  } finally {
    // Osiguraj da se konekcija zatvori, bez obzira na ishod
    if (client.closed === false) {
      console.log("Zatvaranje FTP konekcije...");
      await client.close();
      console.log("FTP konekcija zatvorena.");
    }
  }
}
// <-- Kraj nove funkcije za FTP upload -->


// Funkcija za obradu slike
async function processImage(bucketName, objectName) {
  try {
    console.log(`Obrada slike: ${objectName} iz bucket-a ${bucketName}`);

    // Preskoči ako je već u nekom od foldera za veličine
    if (resizeConfigs.some(cfg => objectName.includes(`/${cfg.folder}/`))) {
      console.log(`Preskačem već obrađenu sliku (u folderu za veličinu): ${objectName}`);
      return;
    }

    const sku = extractSKU(objectName);
    console.log(`Izdvojen SKU: ${sku} iz ${objectName}`);

    const tempFilePath = path.join(TEMP_DIR, `original_${Date.now()}_${path.basename(objectName)}`);
    await minioClient.fGetObject(bucketName, objectName, tempFilePath);
    console.log(`Slika preuzeta u: ${tempFilePath}`);

    const filename = path.basename(objectName);
    const fileInfo = path.parse(filename);

    // Niz za praćenje privremenih fajlova koje treba obrisati na kraju
    const tempFilesToDelete = [tempFilePath];

    for (const config of resizeConfigs) {
      let webpTempPath = null; // Inicijalizuj van try bloka
      let origTempPath = null; // Inicijalizuj van try bloka

      try {
        // Definiši putanje pre Sharp obrade
        webpTempPath = path.join(TEMP_DIR, `${fileInfo.name}_${config.suffix}_${Date.now()}.webp`);
        tempFilesToDelete.push(webpTempPath); // Dodaj u listu za brisanje

        const webpMinioObjectName = `${sku}/${config.folder}/${fileInfo.name}.webp`;
        const webpFtpPath = path.join(FTP_REMOTE_BASE_PATH, sku, config.folder, `${fileInfo.name}.webp`).replace(/\\/g, '/');


        // 1. Obradi WebP verziju
        const sharpInstance = sharp(tempFilePath)
            .resize({
              width: config.width,
              height: null, // Održava proporcije
              withoutEnlargement: true // Ne uvećavaj slike manje od zadate širine
            });

        await sharpInstance
            .clone() // Kloniraj pre promene formata
            .webp({ quality: 90 }) // Postavi WebP kvalitet (npr. 90)
            .toFile(webpTempPath);

        // Prvo upload WebP na MinIO
        await minioClient.fPutObject(
            bucketName,
            webpMinioObjectName,
            webpTempPath
        );
        console.log(`Kreirana i uploadovana WebP slika na MinIO: ${webpMinioObjectName}`);

        // Zatim upload WebP na FTP - ALI SAMO AKO JE 'large'
        // <-- IZMENA OVDE: Dodat IF uslov -->
        if (config.folder === 'large') {
          console.log(`[FTP Upload Triggered] Uslov 'config.folder === "large"' je ispunjen za WebP.`);
          await uploadToFtp(webpTempPath, webpFtpPath); // <-- Poziv za FTP upload samo za 'large'
        } else {
          console.log(`[FTP Upload Skipped] Preskačem FTP upload za WebP (${config.folder}).`);
        }
        // <-- Kraj IZMENE -->


        // 2. Sačuvaj i originalni format ako je opcija uključena
        if (OPTIONS.saveOriginalFormat) {
          origTempPath = path.join(TEMP_DIR, `${fileInfo.name}_${config.suffix}_${Date.now()}${fileInfo.ext}`);
          tempFilesToDelete.push(origTempPath); // Dodaj u listu za brisanje

          // Definiši putanje pre čuvanja
          const origMinioObjectName = `${sku}/${config.folder}/${fileInfo.name}${fileInfo.ext}`;
          const origFtpPath = path.join(FTP_REMOTE_BASE_PATH, sku, config.folder, `${fileInfo.name}${fileInfo.ext}`).replace(/\\/g, '/');

          await sharpInstance // Koristi isti sharpInstance od pre promene formata
              .clone() // Kloniraj ponovo za originalni format
              .toFile(origTempPath);

          // Prvo upload originala na MinIO
          await minioClient.fPutObject(
              bucketName,
              origMinioObjectName,
              origTempPath
          );
          console.log(`Kreirana i uploadovana originalna slika na MinIO: ${origMinioObjectName}`);

          // Zatim upload originala na FTP - ALI SAMO AKO JE 'large'
          // <-- IZMENA OVDE: Dodat IF uslov -->
          if (config.folder === 'large') {
            console.log(`[FTP Upload Triggered] Uslov 'config.folder === "large"' je ispunjen za original format.`);
            await uploadToFtp(origTempPath, origFtpPath); // <-- Poziv za FTP upload samo za 'large'
          } else {
            console.log(`[FTP Upload Skipped] Preskačem FTP upload za original format (${config.folder}).`);
          }
          // <-- Kraj IZMENE -->
        }
      } catch (resizeErr) {
        console.error(`Greška pri resize-u za ${config.suffix} (${objectName}):`, resizeErr);
        // Nastavi sa sledećom konfiguracijom ako jedna ne uspe
      }
    } // Kraj for petlje za resizeConfigs

    // Obriši SVE privremene fajlove (originalni + svi generisani)
    console.log(`Brisanje privremenih fajlova za ${objectName}...`);
    for (const filePath of tempFilesToDelete) { // Koristi for...of za async/await unutar petlje ako je potrebno, mada unlinkSync je ok
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          // console.log(`Obrisan temp fajl: ${filePath}`);
        } catch (unlinkErr) {
          console.error(`Greška pri brisanju temp fajla ${filePath}:`, unlinkErr);
        }
      }
    }
    console.log(`Privremeni fajlovi obrisani za ${objectName}.`);

    // Obriši originalni fajl iz bucket-a ako je opcija uključena
    if (OPTIONS.deleteOriginalAfterProcess) {
      try {
        console.log(`Brisanje originalne slike iz MinIO bucket-a: ${objectName}`);
        await minioClient.removeObject(bucketName, objectName);
        console.log(`Originalna slika obrisana iz MinIO: ${objectName}`);
      } catch (deleteErr) {
        console.error(`Greška pri brisanju originalne slike iz MinIO (${objectName}): ${deleteErr}`);
      }
    }

  } catch (err) {
    console.error(`!!! Ozbiljna greška pri obradi slike ${objectName}:`, err);
  }
}

// Ručni endpoint za obradu slike
app.post('/resize', async (req, res) => {
  try {
    const { bucket, object } = req.body;
    if (!bucket || !object) {
      return res.status(400).send('Nedostaju parametri bucket i object');
    }
    // Pokreni obradu u pozadini (bez await)
    processImage(bucket, object)
        .then(() => console.log(`Ručna obrada (pokrenuta preko /resize) završena za ${bucket}/${object}`))
        .catch(err => console.error(`Greška pri ručnoj obradi (pokrenutoj preko /resize): ${err}`));
    res.status(202).send(`Obrada slike ${object} je pokrenuta`);
  } catch (error) {
    console.error('Greška pri /resize zahtevu:', error);
    res.status(500).send('Interna greška servera');
  }
});

// Webhook endpoint za MinIO notifikacije
app.post('/webhook', async (req, res) => {
  console.log('Primljena webhook notifikacija');
  try {
    res.status(200).send('Notifikacija primljena'); // Odmah vrati odgovor MinIO-u

    const records = req.body.Records || [];
    console.log(`Primljeno ${records.length} zapisa u notifikaciji`);

    for (const record of records) {
      // Proveravamo samo događaje kreiranja objekta
      if (record.eventName && record.eventName.startsWith('s3:ObjectCreated:')) {
        const bucketName = record.s3.bucket.name;
        const objectName = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' ')); // Dekodiranje naziva fajla

        console.log(`Detektovano kreiranje objekta: ${bucketName}/${objectName}`);

        // Preskoči ako je već obrađena slika (u podfolderima)
        if (objectName.includes('/thumb/') ||
            objectName.includes('/medium/') ||
            objectName.includes('/minithumb/') ||
            objectName.includes('/large/')) {
          console.log(`Preskačem (webhook) već obrađenu sliku: ${objectName}`);
          continue; // Preskoči ovu notifikaciju
        }

        // Proveri da li je fajl slika (osnovna provera ekstenzije)
        const fileExtension = path.extname(objectName).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(fileExtension)) {
          console.log(`Preskačem (webhook) fajl koji nije slika: ${objectName}`);
          continue; // Preskoči ako nije slika
        }

        // Pokreni obradu u pozadini (bez await)
        processImage(bucketName, objectName)
            .catch(err => console.error(`Greška pri obradi slike ${objectName} (pokrenuto preko webhook-a): ${err}`));
      } else {
        // Loguj druge događaje ako te zanimaju
        // console.log(`Primljen drugi S3 događaj: ${record.eventName} za objekat ${record.s3.object.key}`);
      }
    }
  } catch (error) {
    console.error('Greška pri obradi webhook notifikacije:', error);
    // Ne šaljemo response ovde jer smo ga već poslali na početku
  }
});


// Test endpoint
app.get('/', (req, res) => {
  res.send('Image Resizer servis je aktivan! Koristite /webhook za MinIO notifikacije ili /resize za ručnu obradu.');
});

// Funkcija za obradu postojećih slika pri startu (opciono)
async function processExistingImages(bucketName) {
  console.log(`Provera postojećih slika u bucket-u: ${bucketName}`);
  try {
    const bucketExists = await minioClient.bucketExists(bucketName);
    if (!bucketExists) {
      console.log(`Bucket ${bucketName} ne postoji.`);
      // Opciono: Kreiraj bucket ako ne postoji
      // console.log(`Kreiranje bucket-a ${bucketName}...`);
      // await minioClient.makeBucket(bucketName);
      // console.log(`Bucket ${bucketName} kreiran.`);
      return;
    }

    const objects = await listAllObjects(bucketName);
    console.log(`Pronađeno ${objects.length} objekata u bucket-u ${bucketName}`);
    let imageCount = 0;

    for (const obj of objects) {
      // Preskoči ako je u podfolderima (već obrađeno)
      if (obj.name.includes('/thumb/') ||
          obj.name.includes('/medium/') ||
          obj.name.includes('/minithumb/') ||
          obj.name.includes('/large/')) {
        continue;
      }

      // Provera da li je fajl slika
      const fileExtension = path.extname(obj.name).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(fileExtension)) {
        imageCount++;
        console.log(`[EXISTING] Pokretanje obrade za postojeću sliku: ${obj.name}`);
        // Pokreni obradu, ali ne čekaj završetak svake pojedinačne slike
        // da ne bi blokirao start servisa predugo.
        processImage(bucketName, obj.name)
            .catch(err => console.error(`Greška pri obradi postojeće slike ${obj.name}: ${err}`));
      }
    }
    console.log(`Završeno pokretanje obrade za ${imageCount} postojećih slika.`);
  } catch (err) {
    console.error('Greška pri proveri postojećih slika:', err);
  }
}

// Pomoćna funkcija za izlistavanje svih objekata u bucket-u
async function listAllObjects(bucketName) {
  return new Promise((resolve, reject) => {
    const objects = [];
    const stream = minioClient.listObjects(bucketName, '', true); // Rekurzivno listanje
    stream.on('data', (obj) => objects.push(obj));
    stream.on('error', (err) => {
      console.error(`Greška pri listanju objekata u bucket-u ${bucketName}:`, err);
      reject(err);
    });
    stream.on('end', () => resolve(objects));
  });
}

// Glavni deo programa
async function main() {
  app.listen(PORT, () => {
    console.log(`Webhook server pokrenut na http://localhost:${PORT}`);

    // Opciono: Pokreni obradu postojećih slika nakon malog zakašnjenja
    // Da bi se MinIO i ostale komponente stabilizovale
    // Možeš ovo zakomentarisati ako ne želiš obradu postojećih pri startu
    setTimeout(() => {
      console.log("Pokretanje provere postojećih slika...");
      processExistingImages(BUCKET_NAME);
    }, 15000); // Sačekaj 15 sekundi
  });
}

main().catch(err => {
  console.error('!!! Kritična greška u glavnom programu:', err);
  process.exit(1); // Izlaz sa greškom ako glavna funkcija ne uspe
});