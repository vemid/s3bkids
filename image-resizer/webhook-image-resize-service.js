// webhook-image-resize-service.js
const Minio = require('minio');
const sharp = require('sharp');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { Writable } = require('stream'); // Dodato za proveru strima

// Kreiranje Express aplikacije za webhook
const app = express();
// Povećan limit zbog potencijalno velikih slika, ali i dalje budite oprezni sa memorijom
app.use(express.json({ limit: '100mb' }));
const PORT = process.env.PORT || 3000; // Koristite process.env.PORT ako je dostupno (npr. na platformama kao Heroku)

// Konfiguracija iz env varijabli
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000', 10);
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'admin';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'password123';
const BUCKET_NAME = process.env.BUCKET_NAME || 'products';

// Privremeni direktorijum za fajlove
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  console.log(`Kreiranje privremenog direktorijuma: ${TEMP_DIR}`);
  fs.mkdirSync(TEMP_DIR, { recursive: true }); // Osigurava kreiranje ako ne postoji
} else {
  console.log(`Privremeni direktorijum postoji: ${TEMP_DIR}`);
}

// Konfiguracija MinIO klijenta
const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: false, // Koristi promenljivu za SSL
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY
});

// Definisanje konfiguracija za različite veličine slika
const resizeConfigs = [
  // {
  //   suffix: 'minithumbnail',
  //   folder: 'minithumb',
  //   width: 75
  // },
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
  deleteOriginalAfterProcess: true,
  // Kvalitet WebP slike (0-100)
  webpQuality: 90, // Smanjeno sa 100 na 90 za bolji balans veličine i kvaliteta
  // Podržane ekstenzije slika za obradu
  supportedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.tiff']
};

console.log(`Servis za promenu veličine slika se pokreće...`);
console.log(`MinIO Endpoint: ${MINIO_ENDPOINT}`);
console.log(`MinIO Port: ${MINIO_PORT}`);
console.log(`Bucket: ${BUCKET_NAME}`);
console.log(`Brisanje originala nakon obrade: ${OPTIONS.deleteOriginalAfterProcess}`);
console.log(`Čuvanje originalnog formata: ${OPTIONS.saveOriginalFormat}`);
console.log(`Podržane ekstenzije: ${OPTIONS.supportedExtensions.join(', ')}`);

// Dodaj health check endpoint
app.get('/health', (req, res) => {
  // Može se proširiti da proverava i konekciju sa MinIO
  minioClient.bucketExists(BUCKET_NAME)
      .then(exists => {
        if (exists) {
          res.status(200).send({ status: 'OK', message: 'Servis je aktivan i bucket postoji.' });
        } else {
          res.status(503).send({ status: 'ERROR', message: `Servis je aktivan ali bucket '${BUCKET_NAME}' ne postoji.` });
        }
      })
      .catch(err => {
        console.error("Greška pri proveri MinIO konekcije:", err);
        res.status(503).send({ status: 'ERROR', message: 'Servis je aktivan ali ne može da se poveže na MinIO.', error: err.message });
      });
});

// Funkcija za izvlačenje SKU iz naziva fajla
function extractSKU(objectName) {
  // Uzmi samo naziv fajla bez putanje
  const basename = path.basename(objectName);

  // Izdvoji SKU (prvih 13 alfanumeričkih karaktera)
  // Podržava nazive poput: 251OM0M43B00.jpg, 251OM0M43B00_1.jpg, itd.
  const match = basename.match(/^([A-Za-z0-9]{13})/);

  if (match && match[1]) {
    return match[1];
  }

  // Ako ne možemo izdvojiti prema pravilu (npr. kraći naziv),
  // vrati ceo naziv bez ekstenzije kao fallback.
  console.warn(`Nije moguće izdvojiti SKU (13 karaktera) iz: ${basename}. Koristi se ceo naziv fajla.`);
  return path.parse(basename).name;
}

// Funkcija za čišćenje privremenih fajlova
function cleanupTempFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error(`Greška pri brisanju privremenog fajla ${filePath}:`, err);
      } else {
        // console.log(`Obrisan privremeni fajl: ${filePath}`); // Može biti previše verbose
      }
    });
  }
}

// Glavna funkcija za obradu slike
async function processImage(bucketName, objectName) {
  // Sekundarna provera (glavna je pre poziva ove funkcije)
  const isAlreadyProcessed = resizeConfigs.some(config => objectName.includes(`/${config.folder}/`));
  if (isAlreadyProcessed) {
    console.log(`[processImage] Preskačem već obrađenu sliku ili sliku u odredišnom folderu: ${objectName}`);
    return;
  }

  console.log(`[processImage] Obrada slike: ${objectName} iz bucket-a ${bucketName}`);

  // Izvuci SKU iz naziva fajla
  const sku = extractSKU(objectName);
  console.log(`[processImage] Izdvojen SKU: ${sku} iz ${objectName}`);

  // Priprema privremenog fajla za original
  const uniqueId = Date.now() + "_" + Math.random().toString(36).substring(2, 8); // Dodatna unikatnost
  const originalFilename = path.basename(objectName);
  const tempFilePath = path.join(TEMP_DIR, `original_${uniqueId}_${originalFilename}`);

  try {
    // Preuzimanje originalne slike
    console.log(`[processImage] Preuzimanje ${bucketName}/${objectName} u ${tempFilePath}`);
    await minioClient.fGetObject(bucketName, objectName, tempFilePath);
    console.log(`[processImage] Slika uspešno preuzeta: ${tempFilePath}`);

    // Priprema informacija o fajlu
    const fileInfo = path.parse(originalFilename);
    const processingPromises = []; // Niz za paralelnu obradu veličina

    // Obrada za svaku konfiguraciju veličine
    for (const config of resizeConfigs) {
      processingPromises.push((async () => { // Kreiramo async IIFE za svaku veličinu
        const webpTempPath = path.join(TEMP_DIR, `${fileInfo.name}_${config.suffix}_${uniqueId}.webp`);
        const origTempPath = path.join(TEMP_DIR, `${fileInfo.name}_${config.suffix}_${uniqueId}${fileInfo.ext}`);

        try {
          console.log(`[Resize ${config.suffix}] Početak obrade za ${objectName}`);
          // Pripremi sharp instancu
          const sharpInstance = sharp(tempFilePath)
              .resize({
                width: config.width,
                height: null, // Automatski računa visinu za očuvanje proporcija
                fit: sharp.fit.inside, // Menja veličinu tako da stane unutar dimenzija
                withoutEnlargement: true // Ne uvećava slike manje od ciljne veličine
              });

          // 1. Obradi i uploaduj WebP verziju
          await sharpInstance
              .clone() // Kloniraj pre konverzije da ne utiče na originalni format
              .webp({ quality: OPTIONS.webpQuality })
              .toFile(webpTempPath);

          const webpObjectName = `${sku}/${config.folder}/${fileInfo.name}.webp`;
          await minioClient.fPutObject(bucketName, webpObjectName, webpTempPath, { 'Content-Type': 'image/webp' });
          console.log(`[Resize ${config.suffix}] Kreirana WebP slika: ${webpObjectName}`);
          cleanupTempFile(webpTempPath); // Obriši temp WebP

          // 2. Sačuvaj i uploaduj originalni format ako je opcija uključena
          if (OPTIONS.saveOriginalFormat) {
            // Odredi Content-Type za originalni format
            let originalMimeType = 'application/octet-stream'; // Fallback
            const extLower = fileInfo.ext.toLowerCase();
            if (extLower === '.jpg' || extLower === '.jpeg') {
              originalMimeType = 'image/jpeg';
              await sharpInstance.clone().jpeg({ quality: 90 }).toFile(origTempPath); // Dodaj kontrolu kvaliteta i za JPG
            } else if (extLower === '.png') {
              originalMimeType = 'image/png';
              await sharpInstance.clone().png({ quality: 90 }).toFile(origTempPath); // Dodaj kontrolu kvaliteta i za PNG
            } else {
              // Za druge formate, samo ih snimi direktno
              await sharpInstance.clone().toFile(origTempPath);
            }


            const origObjectName = `${sku}/${config.folder}/${fileInfo.name}${fileInfo.ext}`;
            await minioClient.fPutObject(bucketName, origObjectName, origTempPath, { 'Content-Type': originalMimeType });
            console.log(`[Resize ${config.suffix}] Kreirana originalna slika: ${origObjectName}`);
            cleanupTempFile(origTempPath); // Obriši temp original
          }
        } catch (resizeErr) {
          console.error(`[Resize ${config.suffix}] Greška pri resize-u za ${objectName}:`, resizeErr);
          // Očisti temp fajlove i u slučaju greške
          cleanupTempFile(webpTempPath);
          if (OPTIONS.saveOriginalFormat) cleanupTempFile(origTempPath);
        }
      })()); // Odmah pozivamo async funkciju
    }

    // Sačekaj da se završe sve obrade veličina
    await Promise.all(processingPromises);
    console.log(`[processImage] Završena obrada svih veličina za ${objectName}`);

    // Obriši originalni preuzeti fajl
    cleanupTempFile(tempFilePath);
    console.log(`[processImage] Očišćeni privremeni fajlovi za ${objectName}`);

    // Obriši originalni fajl iz bucket-a ako je opcija uključena
    if (OPTIONS.deleteOriginalAfterProcess) {
      try {
        console.log(`[processImage] Brisanje originalne slike iz bucket-a: ${objectName}`);
        await minioClient.removeObject(bucketName, objectName);
        console.log(`[processImage] Originalna slika obrisana: ${objectName}`);
      } catch (deleteErr) {
        console.error(`[processImage] Greška pri brisanju originalne slike ${objectName}:`, deleteErr);
      }
    }

  } catch (err) {
    console.error(`[processImage] Fatalna greška pri obradi slike ${objectName}:`, err);
    // Očisti glavni privremeni fajl i u slučaju greške pri preuzimanju ili obradi
    cleanupTempFile(tempFilePath);
    // Proveriti da li je greška S3Error Not Found da ne bi ispisivalo nepotrebne greške
    if (err.code !== 'NotFound') {
      // Loguj samo relevantne greške
      console.error(`[processImage] Detalji greške (${objectName}):`, err);
    }
  }
}

// Ručni endpoint za obradu slike (korisno za testiranje)
app.post('/resize', async (req, res) => {
  const { bucket, object } = req.body;

  if (!bucket || !object) {
    return res.status(400).send({ error: 'Nedostaju parametri bucket i object' });
  }

  console.log(`[API /resize] Primljen ručni zahtev za obradu: ${bucket}/${object}`);

  // Validacija: Provera da li objekat već postoji pre pokretanja
  try {
    await minioClient.statObject(bucket, object);
  } catch (statErr) {
    if (statErr.code === 'NotFound') {
      console.error(`[API /resize] Objekat ${bucket}/${object} ne postoji.`);
      return res.status(404).send({ error: `Objekat ${object} ne postoji u bucket-u ${bucket}` });
    } else {
      console.error(`[API /resize] Greška pri proveri objekta ${bucket}/${object}:`, statErr);
      return res.status(500).send({ error: 'Greška pri proveri statusa objekta', details: statErr.message });
    }
  }

  // Pokreni obradu u pozadini (ne čekamo završetak)
  processImage(bucket, object)
      .then(() => console.log(`[API /resize] Pozadinska obrada za ${bucket}/${object} je uspešno pokrenuta.`))
      .catch(err => console.error(`[API /resize] Greška pri pokretanju pozadinske obrade za ${bucket}/${object}: ${err}`));

  // Odmah vrati odgovor klijentu
  res.status(202).send({ message: `Obrada slike ${object} je pokrenuta u pozadini.` });
});

// Webhook endpoint za MinIO notifikacije
app.post('/webhook', async (req, res) => {
  console.log('[Webhook] Primljena webhook notifikacija');

  // Brzo vrati odgovor da ne blokiramo MinIO
  res.status(200).send({ status: 'OK', message: 'Notifikacija primljena' });

  try {
    const records = req.body && req.body.Records ? req.body.Records : [];
    if (!Array.isArray(records)) {
      console.warn('[Webhook] Primljen payload nema validan "Records" niz.');
      return;
    }
    console.log(`[Webhook] Primljeno ${records.length} zapisa u notifikaciji.`);

    for (const record of records) {
      // Osnovna provera strukture zapisa
      if (!record.eventName || !record.s3 || !record.s3.bucket || !record.s3.bucket.name || !record.s3.object || !record.s3.object.key) {
        console.warn('[Webhook] Preskačem zapis zbog nepotpune strukture:', record);
        continue;
      }

      // Obradjujemo samo kreiranje objekata
      if (!record.eventName.startsWith('s3:ObjectCreated:')) {
        console.log(`[Webhook] Preskačem događaj koji nije ObjectCreated: ${record.eventName}`);
        continue;
      }

      const bucketName = record.s3.bucket.name;
      const objectNameEncoded = record.s3.object.key;
      let objectName = '';

      try {
        // Dekodiraj ime objekta OBAVEZNO!
        // Koristi `decodeURIComponent` i zameni '+' sa razmakom ako je potrebno (stariji sistemi)
        objectName = decodeURIComponent(objectNameEncoded.replace(/\+/g, ' '));
      } catch (decodeError) {
        console.error(`[Webhook] Greška pri dekodiranju imena objekta: ${objectNameEncoded}`, decodeError);
        continue; // Preskoči ovaj zapis ako dekodiranje ne uspe
      }


      console.log(`[Webhook] Detektovan događaj: ${record.eventName} za ${bucketName}/${objectName} (Dekodirano iz: ${objectNameEncoded})`);

      // --- Filtriranje PRE poziva processImage ---

      // 1. Proveri da li je fajl u nekom od foldera GDE SMEŠTAMO obrađene slike
      const isAlreadyProcessedFolder = resizeConfigs.some(config =>
          objectName.includes(`/${config.folder}/`) // Proverava dekodirano ime
      );

      if (isAlreadyProcessedFolder) {
        console.log(`[Webhook] Preskačem objekat jer je u folderu obrađenih slika: ${objectName}`);
        continue; // Preskoči ovaj zapis
      }

      // 2. Proveri da li je fajl podržana slika (po ekstenziji)
      const fileExtension = path.extname(objectName).toLowerCase();
      if (!OPTIONS.supportedExtensions.includes(fileExtension)) {
        console.log(`[Webhook] Preskačem fajl sa nepodržanom ekstenzijom (${fileExtension}): ${objectName}`);
        continue;
      }

      // 3. Opciono: Ako želimo da obrađujemo SAMO fajlove iz root-a
      //    Ovo može biti korisno ako ne možemo da filtriramo u MinIO podešavanjima
      // if (objectName.includes('/')) {
      //    console.log(`[Webhook] Preskačem objekat van root direktorijuma: ${objectName}`);
      //    continue;
      // }

      // --- Kraj Filtriranja ---


      // Ako su sve provere prošle, pokreni obradu u pozadini
      console.log(`[Webhook] Pokrećem obradu za: ${bucketName}/${objectName}`);
      // Ne koristimo await ovde, pusti da radi u pozadini
      processImage(bucketName, objectName)
          .catch(err => console.error(`[Webhook] Greška unutar pokrenute processImage za ${objectName}: ${err}`));

    } // kraj for petlje
  } catch (error) {
    // Greška u samom rukovanju webhook pozivom (npr. parsiranje JSON-a ako nije express.json())
    console.error('[Webhook] Greška pri generalnoj obradi webhook notifikacije:', error);
    // Ne možemo slati 500 ovde jer smo već poslali 200
  }
});

// Test endpoint
app.get('/', (req, res) => {
  res.send('Image Resizer servis je aktivan! Koristite /webhook za MinIO notifikacije, /resize za ručnu obradu ili /health za proveru statusa.');
});

// Pomoćna funkcija za izlistavanje svih objekata u bucket-u sa paginacijom
async function listAllObjects(bucketName, prefix = '') {
  return new Promise((resolve, reject) => {
    const objects = [];
    const stream = minioClient.listObjectsV2(bucketName, prefix, true); // true za rekurzivno

    stream.on('data', (obj) => {
      // Proveri da li objekat ima 'name' property pre dodavanja
      if (obj && obj.name) {
        objects.push(obj);
      } else {
        console.warn("[listAllObjects] Dobijen nevalidan objekat iz stream-a:", obj);
      }
    });
    stream.on('error', (err) => {
      console.error("[listAllObjects] Greška prilikom listanja objekata:", err);
      reject(err);
    });
    stream.on('end', () => {
      console.log(`[listAllObjects] Uspešno izlistano ${objects.length} objekata za prefix '${prefix}' u bucketu ${bucketName}.`);
      resolve(objects);
    });
  });
}


// Funkcija za obradu postojećih slika prilikom starta servisa
async function processExistingImages(bucketName) {
  console.log(`[Startup] Pokretanje obrade postojećih slika u bucket-u: ${bucketName}`);

  try {
    // Provera da li bucket postoji
    const bucketExists = await minioClient.bucketExists(bucketName);
    if (!bucketExists) {
      console.log(`[Startup] Bucket ${bucketName} ne postoji. Pokušaj kreiranja...`);
      // Potrebna odgovarajuća prava za kreiranje bucket-a
      try {
        await minioClient.makeBucket(bucketName);
        console.log(`[Startup] Bucket ${bucketName} uspešno kreiran.`);
        // Nema postojećih slika za obradu u novom bucket-u
        return;
      } catch (makeBucketErr) {
        console.error(`[Startup] Greška pri kreiranju bucket-a ${bucketName}. Proverite MinIO logove i dozvole.`, makeBucketErr);
        // Ne možemo nastaviti bez bucket-a
        throw new Error(`Ne može se kreirati ili pristupiti bucket-u ${bucketName}`);
      }
    } else {
      console.log(`[Startup] Bucket ${bucketName} postoji.`);
    }

    console.log(`[Startup] Listanje objekata u bucket-u ${bucketName}...`);
    const objects = await listAllObjects(bucketName); // Listaj sve rekurzivno
    console.log(`[Startup] Pronađeno ${objects.length} ukupno objekata u bucket-u ${bucketName}. Filtriranje...`);

    let processedCount = 0;
    const processingPromises = []; // Za ograničavanje konkurentnosti

    for (const obj of objects) {
      const objectName = obj.name; // Pretpostavljamo da je SDK vratio dekodirano ime

      // --- Filtriranje slično kao u Webhook-u ---

      // 1. Preskoči već obrađene slike (u folderima)
      const isAlreadyProcessedFolder = resizeConfigs.some(config =>
          objectName.includes(`/${config.folder}/`)
      );
      if (isAlreadyProcessedFolder) {
        // console.log(`[Startup] Preskačem (već obrađen folder): ${objectName}`); // Može biti previše logova
        continue;
      }

      // 2. Proveri da li je fajl podržana slika
      const fileExtension = path.extname(objectName).toLowerCase();
      if (!OPTIONS.supportedExtensions.includes(fileExtension)) {
        // console.log(`[Startup] Preskačem (nepodržana ekstenzija ${fileExtension}): ${objectName}`);
        continue;
      }

      // 3. Preskoči foldere (objekti koji se završavaju sa '/')
      if (objectName.endsWith('/')) {
        // console.log(`[Startup] Preskačem (folder): ${objectName}`);
        continue;
      }

      // --- Kraj Filtriranja ---

      console.log(`[Startup] Dodajem u red za obradu postojeću sliku: ${objectName}`);
      processedCount++;
      // Dodaj obećanje u niz, ne čekamo ga ovde
      // Možete dodati mehanizam za ograničavanje broja paralelnih obrada ako imate puno slika
      processingPromises.push(
          processImage(bucketName, objectName)
              .catch(err => console.error(`[Startup] Greška pri obradi postojeće slike ${objectName}:`, err))
      );

      // Primer jednostavnog ograničavanja konkurentnosti (npr. max 5 odjednom)
      if (processingPromises.length >= 5) {
        console.log("[Startup] Dostignut limit konkurentnosti, čekam završetak...");
        await Promise.all(processingPromises); // Sačekaj da se trenutna grupa završi
        processingPromises.length = 0; // Isprazni niz za sledeću grupu
        console.log("[Startup] Nastavljam sa sledećom grupom...");
      }
    }

    // Sačekaj preostale obrade ako ih ima
    if (processingPromises.length > 0) {
      console.log(`[Startup] Čekam završetak preostalih ${processingPromises.length} obrada...`);
      await Promise.all(processingPromises);
    }


    console.log(`[Startup] Obrada postojećih slika završena. Pokrenuta obrada za ${processedCount} slika.`);
  } catch (err) {
    console.error('[Startup] Fatalna greška pri inicijalnoj obradi postojećih slika:', err);
    // Razmislite da li servis treba da se zaustavi u ovom slučaju
    // process.exit(1);
  }
}

// Glavni deo programa
async function main() {
  // Pokreni Express server za webhook
  app.listen(PORT, () => {
    console.log(`======================================================`);
    console.log(`🚀 Webhook server pokrenut na http://localhost:${PORT}`);
    console.log(`👂 Čekam MinIO notifikacije na /webhook`);
    console.log(`🖐️ Ručna obrada dostupna na POST /resize`);
    console.log(`❤️ Health check dostupan na GET /health`);
    console.log(`======================================================`);


    // Obradi postojeće slike nakon malog kašnjenja da se sve inicijalizuje
    // Tajmer nije idealan, ali je jednostavan. U produkciji razmotriti bolji mehanizam.
    const initialProcessingDelay = 10000; // 10 sekundi
    console.log(`[Main] Pokretanje inicijalne obrade postojećih slika za ${initialProcessingDelay / 1000} sekundi...`);
    setTimeout(() => {
      processExistingImages(BUCKET_NAME)
          .then(() => {
            console.log('[Main] Inicijalna obrada postojećih slika završena (ili nije bilo šta za obradu). Servis je spreman za nove slike.');
          })
          .catch(err => {
            console.error('[Main] Greška tokom inicijalne obrade postojećih slika:', err);
            // Odlučiti da li nastaviti sa radom ili ne
          });
    }, initialProcessingDelay);
  });
}

// Obrada neuhvaćenih grešaka
process.on('unhandledRejection', (reason, promise) => {
  console.error('!!! Neuhvaćen Rejection u Promise:', promise, 'razlog:', reason);
  // Opciono: logovati više detalja ili izaći iz procesa
  // process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('!!! Neuhvaćena Greška:', error);
  // Kritična greška, verovatno treba restartovati servis
  process.exit(1);
});

// Pokreni glavni program
main().catch(err => {
  console.error('[Main] Fatalna greška prilikom pokretanja servisa:', err);
  process.exit(1); // Izlazak ako glavna funkcija ne uspe
});