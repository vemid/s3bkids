const Minio = require('minio');
const sharp = require('sharp');
const express = require('express');
const fs = require('fs');
const path = require('path');
const ftp = require("basic-ftp");
const axios = require('axios');

// Kreiranje Express aplikacije za webhook
const app = express();
app.use(express.json({ limit: '50mb' }));
const PORT = process.env.PORT || 3000;

// Konfiguracija iz env varijabli
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000');
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'admin';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'password123';
const BUCKET_NAME = process.env.BUCKET_NAME || 'geox'; // Promenjeno na 'geox' kao default

// Konfiguracija za SKU translator servis
const SKU_TRANSLATOR_URL = process.env.SKU_TRANSLATOR_URL || 'http://sku-translator:3002/translate';

// FTP konfiguracija
const FTP_HOST = process.env.FTP_HOST;
const FTP_PORT = parseInt(process.env.FTP_PORT || '21');
const FTP_USER = process.env.FTP_USER;
const FTP_PASSWORD = process.env.FTP_PASSWORD;
const FTP_SECURE = process.env.FTP_SECURE === 'true';
const FTP_REMOTE_BASE_PATH = process.env.FTP_REMOTE_PATH || '/';

// Validacija FTP konfiguracije (osnovna)
if (!FTP_HOST || !FTP_USER || !FTP_PASSWORD) {
    console.warn('!!! UPOZORENJE: FTP konfiguracija nije kompletna (FTP_HOST, FTP_USER, FTP_PASSWORD). FTP upload će biti preskočen. !!!');
}

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

// Definisanje konfiguracija za različite veličine slika - samo large i thumb
const resizeConfigs = [
    { suffix: 'thumbnail', folder: 'thumb', width: 150 },
    { suffix: 'large', folder: 'large', width: 1200 }
];

// Opcije servisa
const OPTIONS = {
    saveOriginalFormat: true,
    deleteOriginalAfterProcess: true
};

console.log(`Geox servis za promenu veličine slika se pokreće...`);
console.log(`MinIO konfiguracija: ${MINIO_ENDPOINT}:${MINIO_PORT}`);
console.log(`Bucket: ${BUCKET_NAME}`);
console.log(`SKU Translator URL: ${SKU_TRANSLATOR_URL}`);
if (FTP_HOST && FTP_USER) {
    console.log(`FTP konfiguracija: Host=${FTP_HOST}, User=${FTP_USER}, Secure=${FTP_SECURE}, BasePath=${FTP_REMOTE_BASE_PATH}`);
} else {
    console.log(`FTP upload je onemogućen (nedostaje konfiguracija).`);
}

// Dodaj health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('Geox servis je aktivan');
});

// Funkcija za izvlačenje kataloškog SKU iz naziva fajla
function extractCatalogSKU(filename) {
    const basename = path.basename(filename);

    // Prvo uklonimo ekstenziju
    const nameWithoutExt = path.parse(basename).name;

    // Opcija 1: Ako postoji podcrta "_", uzimamo sve do nje
    const underscoreIndex = nameWithoutExt.indexOf('_');
    if (underscoreIndex > 0) {
        return nameWithoutExt.substring(0, underscoreIndex);
    }

    // Opcija 2: Ako nema podcrte, uzimamo ceo naziv bez ekstenzije
    return nameWithoutExt;
}

// Funkcija za prevođenje kataloškog SKU u pravi SKU
async function translateSKU(catalogSKU) {
    try {
        console.log(`Prevođenje kataloškog SKU ${catalogSKU} u pravi SKU...`);
        const response = await axios.get(`${SKU_TRANSLATOR_URL}/${catalogSKU}`);

        if (response.data && response.data.sku) {
            console.log(`Preveden kataloški SKU ${catalogSKU} u pravi SKU ${response.data.sku}`);
            return response.data.sku;
        } else {
            console.warn(`Nije pronađen prevod za kataloški SKU ${catalogSKU}, koristiće se originalni.`);
            return catalogSKU;
        }
    } catch (error) {
        console.error(`Greška pri prevođenju SKU ${catalogSKU}:`, error.message);
        return catalogSKU; // Fallback na kataloški SKU u slučaju greške
    }
}

// Funkcija za dobijanje SKU iz naziva fajla
async function extractSKU(filename) {
    const catalogSKU = extractCatalogSKU(filename);
    const realSKU = await translateSKU(catalogSKU);
    console.log(`Dobijen kataloški SKU: ${catalogSKU}, preveden u: ${realSKU}`);
    return { catalogSKU, realSKU };
}

// Funkcija za FTP upload
async function uploadToFtp(localFilePath, remoteFtpPath) {
    // Preskoči ako FTP nije konfigurisan
    if (!FTP_HOST || !FTP_USER || !FTP_PASSWORD) {
        return;
    }

    const client = new ftp.Client();
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
        const remoteDir = path.dirname(remoteFtpPath).replace(/\\/g, '/');
        console.log(`Osiguravanje FTP direktorijuma: ${remoteDir}`);
        await client.ensureDir(remoteDir);

        // Upload fajla
        await client.uploadFrom(localFilePath, remoteFtpPath);
        console.log(`FTP upload uspešan: ${remoteFtpPath}`);

    } catch(err) {
        console.error(`!!! GREŠKA pri FTP upload-u (${remoteFtpPath}):`, err);
    } finally {
        // Osiguraj da se konekcija zatvori, bez obzira na ishod
        if (client.closed === false) {
            console.log("Zatvaranje FTP konekcije...");
            await client.close();
            console.log("FTP konekcija zatvorena.");
        }
    }
}

// Funkcija za obradu slike
async function processImage(bucketName, objectName) {
    try {
        console.log(`Obrada slike: ${objectName} iz bucket-a ${bucketName}`);

        // Preskoči ako je već u nekom od foldera za veličine
        if (resizeConfigs.some(cfg => objectName.includes(`/${cfg.folder}/`))) {
            console.log(`Preskačem već obrađenu sliku (u folderu za veličinu): ${objectName}`);
            return;
        }

        // Dobavi i kataloški i pravi SKU
        const { catalogSKU, realSKU } = await extractSKU(objectName);
        console.log(`Izdvojen kataloški SKU: ${catalogSKU} i preveden u pravi SKU: ${realSKU} iz ${objectName}`);

        const tempFilePath = path.join(TEMP_DIR, `original_${Date.now()}_${path.basename(objectName)}`);
        await minioClient.fGetObject(bucketName, objectName, tempFilePath);
        console.log(`Slika preuzeta u: ${tempFilePath}`);

        const filename = path.basename(objectName);
        const fileInfo = path.parse(filename);

        // Niz za praćenje privremenih fajlova koje treba obrisati na kraju
        const tempFilesToDelete = [tempFilePath];

        for (const config of resizeConfigs) {
            let webpTempPath = null;
            let origTempPath = null;

            try {
                // Definiši putanje pre Sharp obrade
                webpTempPath = path.join(TEMP_DIR, `${fileInfo.name}_${config.suffix}_${Date.now()}.webp`);
                tempFilesToDelete.push(webpTempPath);

                // 1. Obradi WebP verziju
                const sharpInstance = sharp(tempFilePath)
                    .resize({
                        width: config.width,
                        height: null,
                        withoutEnlargement: true
                    });

                await sharpInstance
                    .clone()
                    .webp({ quality: 90 })
                    .toFile(webpTempPath);

                // Za folder sa realnim SKU - čuvamo originalno ime fajla
                const webpRealMinioObjectName = `${realSKU}/${config.folder}/${fileInfo.name}.webp`;
                await minioClient.fPutObject(
                    bucketName,
                    webpRealMinioObjectName,
                    webpTempPath
                );
                console.log(`Kreirana i uploadovana WebP slika u realni SKU folder: ${webpRealMinioObjectName}`);

                // Za folder sa kataloškim SKU - čuvamo originalno ime fajla
                const webpCatalogMinioObjectName = `${catalogSKU}/${config.folder}/${fileInfo.name}.webp`;
                await minioClient.fPutObject(
                    bucketName,
                    webpCatalogMinioObjectName,
                    webpTempPath
                );
                console.log(`Kreirana i uploadovana WebP slika u kataloški SKU folder: ${webpCatalogMinioObjectName}`);

                // Upload na FTP samo za large format
                if (config.folder === 'large') {
                    // FTP putanja - šaljemo samo kataloški SKU verziju sa originalnim imenom fajla
                    const webpFtpFullPath = path.join(FTP_REMOTE_BASE_PATH, catalogSKU, config.folder, `${fileInfo.name}.webp`).replace(/\\/g, '/');

                    console.log(`[FTP Upload Triggered] Uslov 'config.folder === "large"' je ispunjen za WebP.`);
                    const ftpFileNameWebp = path.basename(webpFtpFullPath);
                    const ftpRootPathWebp = path.join(FTP_REMOTE_BASE_PATH, ftpFileNameWebp).replace(/\\/g, '/');
                    console.log(`[FTP Upload Path] Nova FTP putanja (root): ${ftpRootPathWebp}`);
                    await uploadToFtp(webpTempPath, ftpRootPathWebp);
                }

                // 2. Sačuvaj i originalni format ako je opcija uključena
                if (OPTIONS.saveOriginalFormat) {
                    origTempPath = path.join(TEMP_DIR, `${fileInfo.name}_${config.suffix}_${Date.now()}${fileInfo.ext}`);
                    tempFilesToDelete.push(origTempPath);

                    await sharpInstance
                        .clone()
                        .toFile(origTempPath);

                    // Za folder sa realnim SKU - čuvamo originalno ime fajla
                    const origRealMinioObjectName = `${realSKU}/${config.folder}/${fileInfo.name}${fileInfo.ext}`;
                    await minioClient.fPutObject(
                        bucketName,
                        origRealMinioObjectName,
                        origTempPath
                    );
                    console.log(`Kreirana i uploadovana originalna slika u realni SKU folder: ${origRealMinioObjectName}`);

                    // Za folder sa kataloškim SKU - čuvamo originalno ime fajla
                    const origCatalogMinioObjectName = `${catalogSKU}/${config.folder}/${fileInfo.name}${fileInfo.ext}`;
                    await minioClient.fPutObject(
                        bucketName,
                        origCatalogMinioObjectName,
                        origTempPath
                    );
                    console.log(`Kreirana i uploadovana originalna slika u kataloški SKU folder: ${origCatalogMinioObjectName}`);

                    // Upload na FTP samo za large format
                    if (config.folder === 'large') {
                        // FTP putanja - šaljemo samo kataloški SKU verziju sa originalnim imenom fajla
                        const origFtpFullPath = path.join(FTP_REMOTE_BASE_PATH, catalogSKU, config.folder, `${fileInfo.name}${fileInfo.ext}`).replace(/\\/g, '/');

                        console.log(`[FTP Upload Triggered] Uslov 'config.folder === "large"' je ispunjen za original format.`);
                        const ftpFileNameOrig = path.basename(origFtpFullPath);
                        const ftpRootPathOrig = path.join(FTP_REMOTE_BASE_PATH, ftpFileNameOrig).replace(/\\/g, '/');
                        console.log(`[FTP Upload Path] Nova FTP putanja (root): ${ftpRootPathOrig}`);
                        await uploadToFtp(origTempPath, ftpRootPathOrig);
                    }
                }
            } catch (resizeErr) {
                console.error(`Greška pri resize-u za ${config.suffix} (${objectName}):`, resizeErr);
            }
        }

        // Obriši SVE privremene fajlove
        console.log(`Brisanje privremenih fajlova za ${objectName}...`);
        for (const filePath of tempFilesToDelete) {
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
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
        res.status(200).send('Notifikacija primljena');

        const records = req.body.Records || [];
        console.log(`Primljeno ${records.length} zapisa u notifikaciji`);

        for (const record of records) {
            // Proveravamo samo događaje kreiranja objekta
            if (record.eventName && record.eventName.startsWith('s3:ObjectCreated:')) {
                const bucketName = record.s3.bucket.name;
                const objectName = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

                console.log(`Detektovano kreiranje objekta: ${bucketName}/${objectName}`);

                // Preskoči ako je već obrađena slika (u podfolderima)
                if (objectName.includes('/thumb/') ||
                    objectName.includes('/large/')) {
                    console.log(`Preskačem (webhook) već obrađenu sliku: ${objectName}`);
                    continue;
                }

                // Proveri da li je fajl slika (osnovna provera ekstenzije)
                const fileExtension = path.extname(objectName).toLowerCase();
                if (!['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(fileExtension)) {
                    console.log(`Preskačem (webhook) fajl koji nije slika: ${objectName}`);
                    continue;
                }

                // Pokreni obradu u pozadini
                processImage(bucketName, objectName)
                    .catch(err => console.error(`Greška pri obradi slike ${objectName} (pokrenuto preko webhook-a): ${err}`));
            }
        }
    } catch (error) {
        console.error('Greška pri obradi webhook notifikacije:', error);
    }
});

// Test endpoint
app.get('/', (req, res) => {
    res.send('Geox Image Resizer servis je aktivan! Koristite /webhook za MinIO notifikacije ili /resize za ručnu obradu.');
});

// Funkcija za obradu postojećih slika pri startu
async function processExistingImages(bucketName) {
    console.log(`Provera postojećih slika u bucket-u: ${bucketName}`);
    try {
        const bucketExists = await minioClient.bucketExists(bucketName);
        if (!bucketExists) {
            console.log(`Bucket ${bucketName} ne postoji.`);
            return;
        }

        const objects = await listAllObjects(bucketName);
        console.log(`Pronađeno ${objects.length} objekata u bucket-u ${bucketName}`);
        let imageCount = 0;

        for (const obj of objects) {
            // Preskoči ako je u podfolderima (već obrađeno)
            if (obj.name.includes('/thumb/') ||
                obj.name.includes('/large/')) {
                continue;
            }

            // Provera da li je fajl slika
            const fileExtension = path.extname(obj.name).toLowerCase();
            if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(fileExtension)) {
                imageCount++;
                console.log(`[EXISTING] Pokretanje obrade za postojeću sliku: ${obj.name}`);
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
        const stream = minioClient.listObjects(bucketName, '', true);
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
        setTimeout(() => {
            console.log("Pokretanje provere postojećih slika...");
            processExistingImages(BUCKET_NAME);
        }, 15000); // Sačekaj 15 sekundi
    });
}

main().catch(err => {
    console.error('!!! Kritična greška u glavnom programu:', err);
    process.exit(1);
});