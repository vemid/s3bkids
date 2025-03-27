// minio-to-ftp-sync.js
const Minio = require('minio');
const FTPClient = require('ftp');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { CronJob } = require('cron');

// Konfiguracija
const config = {
    ftp: {
        host: process.env.FTP_HOST || 'ftp.example.com',
        port: parseInt(process.env.FTP_PORT || '21'),
        user: process.env.FTP_USER || 'username',
        password: process.env.FTP_PASSWORD || 'password',
        secure: process.env.FTP_SECURE === 'true' || false,
        remotePath: process.env.FTP_EXPORT_PATH || '/' // Root direktorijum
    },
    minio: {
        endpoint: process.env.MINIO_ENDPOINT || 'localhost',
        port: parseInt(process.env.MINIO_PORT || '9000'),
        useSSL: process.env.MINIO_USE_SSL === 'true' || false,
        accessKey: process.env.MINIO_ACCESS_KEY || 'admin',
        secretKey: process.env.MINIO_SECRET_KEY || 'password123',
        bucketName: process.env.MINIO_BUCKET || 'products'
    },
    cronSchedule: process.env.EXPORT_CRON_SCHEDULE || '*/30 * * * *', // Default: svakih 30 minuta
    tempDir: process.env.TEMP_DIR || './temp',
    // Koje veličine slika želimo da izvezemo na FTP
    // Ako je prazno, izvozimo sve veličine
    sizesToExport: (process.env.SIZES_TO_EXPORT || 'medium,large').split(','),
    // Koje ekstenzije želimo da izvezemo na FTP
    extensionsToExport: (process.env.EXTENSIONS_TO_EXPORT || '.jpg,.webp').split(','),
    // Da li da pratimo procesiranje novih slika
    trackProcessedImages: process.env.TRACK_PROCESSED_IMAGES === 'true' || true,
    // Fajl za praćenje već izvezenih slika
    processedListFile: process.env.PROCESSED_LIST_FILE || './exported_images.json',
    // Da li čuvati strukturu foldera pri izvozu (false: sve ide u root)
    preserveFolderStructure: process.env.PRESERVE_FOLDER_STRUCTURE === 'false' || false,
    // Da li da prebriše postojeći fajl ako postoji
    overwriteExisting: process.env.OVERWRITE_EXISTING === 'false' || true
};

// Kreiranje privremenog direktorijuma
const tempDir = path.resolve(process.cwd(), config.tempDir);
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`Kreiran temp direktorij: ${tempDir}`);
}

// Inicijalizacija MinIO klijenta
const minioClient = new Minio.Client({
    endPoint: config.minio.endpoint,
    port: config.minio.port,
    useSSL: config.minio.useSSL,
    accessKey: config.minio.accessKey,
    secretKey: config.minio.secretKey
});

console.log(`MinIO-FTP sync servis se pokreće...`);
console.log(`MinIO konfiguracija: ${config.minio.endpoint}:${config.minio.port}`);
console.log(`FTP konfiguracija: ${config.ftp.host}:${config.ftp.port}`);
console.log(`Cronjob raspored: ${config.cronSchedule}`);
console.log(`Veličine slika za izvoz: ${config.sizesToExport.join(', ')}`);
console.log(`Ekstenzije za izvoz: ${config.extensionsToExport.join(', ')}`);
console.log(`Prebrisanje postojećih fajlova: ${config.overwriteExisting ? 'Da' : 'Ne'}`);
console.log(`Izvoz u root direktorijum: ${!config.preserveFolderStructure ? 'Da' : 'Ne'}`);

// Učitavanje liste već obrađenih slika
let processedImages = new Set();
try {
    if (fs.existsSync(config.processedListFile)) {
        const processedList = JSON.parse(fs.readFileSync(config.processedListFile, 'utf8'));
        processedImages = new Set(processedList);
        console.log(`Učitano ${processedImages.size} već obrađenih slika`);
    }
} catch (err) {
    console.error(`Greška pri učitavanju liste obrađenih slika: ${err}`);
}

// Funkcija za čuvanje liste obrađenih slika
function saveProcessedImages() {
    try {
        fs.writeFileSync(config.processedListFile, JSON.stringify(Array.from(processedImages)), 'utf8');
        console.log(`Sačuvana lista od ${processedImages.size} obrađenih slika`);
    } catch (err) {
        console.error(`Greška pri čuvanju liste obrađenih slika: ${err}`);
    }
}

// Promise wrapper za FTP konekciju
function ftpConnect() {
    return new Promise((resolve, reject) => {
        const client = new FTPClient();

        client.on('ready', () => {
            resolve(client);
        });

        client.on('error', (err) => {
            reject(err);
        });

        client.connect({
            host: config.ftp.host,
            port: config.ftp.port,
            user: config.ftp.user,
            password: config.ftp.password,
            secure: config.ftp.secure
        });
    });
}

// Promise wrapper za FTP mkdir
async function ftpMkdir(client, dir) {
    try {
        await new Promise((resolve, reject) => {
            client.mkdir(dir, true, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        return true;
    } catch (err) {
        console.error(`Greška pri kreiranju direktorijuma ${dir}:`, err);
        return false;
    }
}

// Promise wrapper za FTP otpremanje
function ftpPut(client, localPath, remotePath) {
    return new Promise((resolve, reject) => {
        client.put(localPath, remotePath, (err) => {
            if (err) reject(err);
            else resolve(true);
        });
    });
}

// Funkcija za preuzimanje fajla sa MinIO
async function downloadFromMinio(objectName) {
    const localPath = path.join(tempDir, path.basename(objectName));
    try {
        await minioClient.fGetObject(config.minio.bucketName, objectName, localPath);
        console.log(`Fajl ${objectName} preuzet u ${localPath}`);
        return localPath;
    } catch (err) {
        console.error(`Greška pri preuzimanju fajla ${objectName}:`, err);
        throw err;
    }
}

// Funkcija za otpremanje fajla na FTP
async function uploadToFtp(localPath, objectName) {
    let client;
    try {
        client = await ftpConnect();
        console.log(`Uspešno povezan na FTP server ${config.ftp.host}`);

        // Određivanje putanje na FTP serveru
        let ftpPath = objectName;

        // Ako ne čuvamo strukturu foldera, koristimo samo ime fajla
        if (!config.preserveFolderStructure) {
            ftpPath = path.basename(objectName);
        }

        const remotePath = path.posix.join(config.ftp.remotePath, ftpPath);

        // Ako čuvamo strukturu foldera, kreiramo direktorijume
        if (config.preserveFolderStructure) {
            const remoteDir = path.posix.dirname(remotePath);
            await ftpMkdir(client, remoteDir);
        }

        // Otpremanje fajla
        await ftpPut(client, localPath, remotePath);
        console.log(`Fajl ${objectName} uspešno otpremljen na FTP kao ${remotePath}`);

        return true;
    } catch (err) {
        console.error(`Greška pri otpremanju fajla ${objectName} na FTP:`, err);
        return false;
    } finally {
        if (client) client.end();
    }
}

// Funkcija za proveru da li je u pitanju slika koja nas zanima
function isTargetImage(objectName) {
    // 1. Provera veličine (folder)
    const isTargetSize = config.sizesToExport.length === 0 ||
        config.sizesToExport.some(size => objectName.includes(`/${size}/`));

    if (!isTargetSize) return false;

    // 2. Provera ekstenzije
    const extension = path.extname(objectName).toLowerCase();
    const isTargetExtension = config.extensionsToExport.length === 0 ||
        config.extensionsToExport.includes(extension);

    return isTargetExtension;
}

// Funkcija za dobijanje svih objekata iz MinIO bucketa
async function listAllObjects() {
    return new Promise((resolve, reject) => {
        const objects = [];
        const stream = minioClient.listObjects(config.minio.bucketName, '', true);

        stream.on('data', (obj) => {
            objects.push(obj);
        });

        stream.on('error', (err) => {
            reject(err);
        });

        stream.on('end', () => {
            resolve(objects);
        });
    });
}

// Glavna funkcija za sinhronizaciju MinIO -> FTP
async function syncMinioToFtp() {
    console.log(`Pokretanje sinhronizacije u ${new Date().toLocaleString()}...`);

    try {
        // Dobijanje liste svih objekata iz MinIO-a
        const allObjects = await listAllObjects();
        console.log(`Pronađeno ${allObjects.length} objekata u MinIO bucket-u ${config.minio.bucketName}`);

        // Filtriranje samo slika koje nas zanimaju
        const imagesToExport = allObjects.filter(obj => {
            // Proveravamo da li je već obrađeno
            if (config.trackProcessedImages && processedImages.has(obj.name) && !config.overwriteExisting) {
                return false;
            }

            // Proveravamo da li je u pitanju slika veličine i ekstenzije koja nas zanima
            return isTargetImage(obj.name);
        });

        console.log(`Za izvoz izdvojeno ${imagesToExport.length} slika`);

        // Obrada svake slike
        for (const image of imagesToExport) {
            try {
                console.log(`Obrada slike: ${image.name}`);

                // Preuzimanje sa MinIO
                const localPath = await downloadFromMinio(image.name);

                // Otpremanje na FTP
                const success = await uploadToFtp(localPath, image.name);

                // Brisanje privremenog fajla
                if (fs.existsSync(localPath)) {
                    fs.unlinkSync(localPath);
                    console.log(`Privremeni fajl ${localPath} obrisan`);
                }

                // Dodavanje u listu obrađenih ako je uspešno
                if (success && config.trackProcessedImages) {
                    processedImages.add(image.name);
                }
            } catch (err) {
                console.error(`Greška pri obradi slike ${image.name}:`, err);
            }
        }

        // Čuvanje liste obrađenih slika
        if (config.trackProcessedImages) {
            saveProcessedImages();
        }

        console.log(`Sinhronizacija završena u ${new Date().toLocaleString()}`);
    } catch (err) {
        console.error('Greška pri sinhronizaciji:', err);
    }
}

// Obrada komandne linije argumenata
if (process.argv.includes('--sync-now')) {
    console.log('Pokretanje ručne sinhronizacije...');
    syncMinioToFtp().catch(err => console.error('Greška pri ručnoj sinhronizaciji:', err));
} else {
    // Prva sinhronizacija odložena za 15 sekundi nakon pokretanja
    setTimeout(() => {
        syncMinioToFtp().catch(err => console.error('Greška pri inicijalnoj sinhronizaciji:', err));
    }, 15000);

    // Kreiranje cron job-a za periodičnu sinhronizaciju
    const job = new CronJob(config.cronSchedule, function() {
        syncMinioToFtp().catch(err => console.error('Greška pri cron sinhronizaciji:', err));
    }, null, true, 'Europe/Belgrade');

    job.start();
    console.log(`Cron job pokrenut, raspored: ${config.cronSchedule}`);
}

// Upravljanje zatvaranjem programa
process.on('SIGINT', async () => {
    console.log('Primljen signal za zaustavljanje...');
    if (typeof job !== 'undefined') {
        job.stop();
        console.log('Cron job zaustavljen');
    }
    process.exit(0);
});

module.exports = { syncMinioToFtp };