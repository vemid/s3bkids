// ftp-sync.js
const ftp = require('basic-ftp');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mime = require('mime-types');
const { CronJob } = require('cron');
const { promisify } = require('util');
const { uploadToMinioDirectly } = require('./direct-upload');
const pipeline = promisify(require('stream').pipeline);

// Konfiguracija
const config = {
  ftp: {
    host: process.env.FTP_HOST || 'ftp.example.com',
    port: parseInt(process.env.FTP_PORT || '21'),
    user: process.env.FTP_USER || 'username',
    password: process.env.FTP_PASSWORD || 'password',
    secure: process.env.FTP_SECURE === 'true' || false,
    remotePath: process.env.FTP_REMOTE_PATH || '/images'
  },
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    accessKey: process.env.MINIO_ACCESS_KEY || 'admin',
    secretKey: process.env.MINIO_SECRET_KEY || 'password123',
    bucketName: process.env.MINIO_BUCKET || 'products'
  },
  cronSchedule: process.env.CRON_SCHEDULE || '0 */1 * * *', // Default: svakih sat vremena
  tempDir: process.env.TEMP_DIR || './temp',
  deleteAfterUpload: process.env.DELETE_AFTER_UPLOAD === 'true' || false,
  lookbackHours: parseInt(process.env.LOOKBACK_HOURS || '24') // Koliko sati unazad tražimo nove fajlove
};

// Kreiranje privremenog direktorijuma ako ne postoji
if (!fs.existsSync(config.tempDir)) {
  fs.mkdirSync(config.tempDir, { recursive: true });
}

console.log(`FTP-MinIO sync servis se pokreće...`);
console.log(`FTP konfiguracija: ${config.ftp.host}:${config.ftp.port}`);
console.log(`MinIO konfiguracija: ${config.minio.endpoint}:${config.minio.port}`);
console.log(`Cronjob raspored: ${config.cronSchedule}`);
console.log(`Pretraga fajlova do ${config.lookbackHours} sati unazad`);

// Funkcija za dobijanje tačnog datuma modifikacije koristeći MDTM komandu
async function getFileModificationTime(client, fileName) {
  try {
    const response = await client.send(`MDTM ${fileName}`);
    // MDTM vraća format: 213 YYYYMMDDhhmmss
    if (response.code === 213 && response.message) {
      const timeStr = response.message.trim();
      // Parsiranje formata YYYYMMDDhhmmss
      const year = parseInt(timeStr.substring(0, 4));
      const month = parseInt(timeStr.substring(4, 6)) - 1; // Meseci u JS su 0-11
      const day = parseInt(timeStr.substring(6, 8));
      const hour = parseInt(timeStr.substring(8, 10));
      const minute = parseInt(timeStr.substring(10, 12));
      const second = parseInt(timeStr.substring(12, 14));

      // Kreiramo UTC datum za konzistentnost
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    }
  } catch (err) {
    console.error(`Greška pri dobijanju MDTM za ${fileName}:`, err.message);
  }
  return null;
}

// Pomoćna funkcija za parsiranje rawModifiedAt formata
function parseRawModifiedAt(rawDate) {
  if (!rawDate) return null;

  try {
    // Format je obično "Mon DD YYYY" npr. "Dec 11 2023"
    const currentYear = new Date().getFullYear();
    let dateStr = rawDate;

    // Ako nema godine, dodajemo tekuću godinu
    if (rawDate.split(' ').length === 2) {
      dateStr = `${rawDate} ${currentYear}`;
    }

    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }
  } catch (err) {
    console.error(`Greška pri parsiranju rawModifiedAt: ${rawDate}`, err);
  }

  return null;
}

// Funkcija za proveru da li je fajl modifikovan u poslednjih N sati
function isFileRecent(fileDate) {
  // Provera da li je fileDate validna vrednost
  if (!fileDate || !(fileDate instanceof Date) || isNaN(fileDate.getTime())) {
    return false;  // Tretiramo nevažeće datume kao stare
  }

  // Direktno računamo razliku u satima
  const now = new Date();
  const diffHours = (now - fileDate) / (1000 * 60 * 60);

  // Fajl je "skorašnji" ako je razlika manja ili jednaka konfiguriranom broju sati
  return diffHours <= config.lookbackHours;
}

// Funkcija za preuzimanje fajla sa FTP servera
async function downloadFromFtp(client, remoteFilePath, localFilePath) {
  try {
    await client.downloadTo(localFilePath, remoteFilePath);
    return true;
  } catch (err) {
    console.error(`Greška pri preuzimanju fajla ${remoteFilePath}:`, err);
    return false;
  }
}

// Funkcija za otpremanje fajla na MinIO server
async function uploadToMinio(localFilePath, fileName) {
  try {
    // Koristimo direktno otpremanje putem MinIO klijenta
    console.log(`Otpremanje ${fileName} na MinIO...`);
    await uploadToMinioDirectly(localFilePath, fileName, config);
    console.log(`Fajl ${fileName} je uspešno otpremljen i obrađen`);
    return true;
  } catch (err) {
    console.error(`Greška pri otpremanju fajla ${fileName} na MinIO:`, err);
    return false;
  }
}

// Test funkcija za proveru datuma fajlova
async function testFileDates() {
  console.log("=== TEST DATUMA FAJLOVA ===");
  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    // Povezivanje na FTP server
    await client.access({
      host: config.ftp.host,
      port: config.ftp.port,
      user: config.ftp.user,
      password: config.ftp.password,
      secure: config.ftp.secure
    });

    console.log(`Uspešno povezan na FTP server ${config.ftp.host}`);

    // Navigacija do traženog direktorijuma
    await client.cd(config.ftp.remotePath);

    // Dobavljanje liste fajlova
    const fileList = await client.list();

    console.log(`Pronađeno ${fileList.length} fajlova na FTP serveru`);

    // Testiramo na nekoliko fajlova
    const testFiles = fileList.slice(0, 5);
    const now = new Date();

    for (const file of testFiles) {
      console.log(`\nTestiranje fajla: ${file.name}`);
      console.log(`rawModifiedAt: ${file.rawModifiedAt}, modifiedAt: ${file.modifiedAt}`);

      // Probamo da dobijemo datum iz MDTM
      const mdtmDate = await getFileModificationTime(client, file.name);
      console.log(`MDTM datum: ${mdtmDate ? mdtmDate.toISOString() : 'nije dostupan'}`);

      // Probamo da parsiramo rawModifiedAt
      const parsedRawDate = parseRawModifiedAt(file.rawModifiedAt);
      console.log(`Parsirani rawModifiedAt: ${parsedRawDate ? parsedRawDate.toISOString() : 'nije dostupan'}`);

      // Testiramo različite datume za recentness
      if (mdtmDate) {
        const diffHours = (now - mdtmDate) / (1000 * 60 * 60);
        console.log(`MDTM - Razlika u satima: ${diffHours.toFixed(2)}h, Da li je recent: ${diffHours <= config.lookbackHours}`);
      }

      if (parsedRawDate) {
        const diffHours = (now - parsedRawDate) / (1000 * 60 * 60);
        console.log(`rawModifiedAt - Razlika u satima: ${diffHours.toFixed(2)}h, Da li je recent: ${diffHours <= config.lookbackHours}`);
      }
    }

  } catch (err) {
    console.error('Greška pri testiranju datuma fajlova:', err);
  } finally {
    client.close();
  }
}

// Glavna funkcija za sinhronizaciju
async function syncFtpToMinio() {
  console.log(`Pokretanje sinhronizacije u ${new Date().toLocaleString()}...`);
  const client = new ftp.Client();
  client.ftp.verbose = false; // Postavi na true za debugging

  try {
    // Povezivanje na FTP server
    await client.access({
      host: config.ftp.host,
      port: config.ftp.port,
      user: config.ftp.user,
      password: config.ftp.password,
      secure: config.ftp.secure
    });

    console.log(`Uspešno povezan na FTP server ${config.ftp.host}`);

    // Navigacija do traženog direktorijuma
    await client.cd(config.ftp.remotePath);

    // Dobavljanje liste fajlova
    const fileList = await client.list();

    console.log(`Pronađeno ${fileList.length} fajlova na FTP serveru`);

    // Pripremamo procesirane fajlove sa validnim datumima
    const processedFiles = await Promise.all(
        fileList.filter(file => file.type === ftp.FileType.File).map(async file => {
          // Prioritet: 1) MDTM datum 2) parsirani rawModifiedAt 3) modifiedAt
          let fileDate = null;

          // 1. Probamo MDTM komandu
          fileDate = await getFileModificationTime(client, file.name);

          // 2. Ako MDTM ne radi, probamo rawModifiedAt
          if (!fileDate) {
            fileDate = parseRawModifiedAt(file.rawModifiedAt);
          }

          // 3. Ako ni to ne radi, probamo regularni modifiedAt
          if (!fileDate && file.modifiedAt) {
            fileDate = file.modifiedAt;
          }

          return {
            ...file,
            processedDate: fileDate
          };
        })
    );

    // Filtriranje samo novijih fajlova
    const recentFiles = processedFiles.filter(file => {
      const isRecent = isFileRecent(file.processedDate);
      return isRecent;
    });

    console.log(`Od toga, ${recentFiles.length} fajlova je novije od ${config.lookbackHours} sati`);

    // Obrada svakog fajla
    for (const file of recentFiles) {
      const remoteFilePath = path.posix.join(config.ftp.remotePath, file.name);
      const localFilePath = path.join(config.tempDir, file.name);

      console.log(`Obrada fajla: ${file.name}`);

      // Preuzimanje fajla sa FTP servera
      const downloadSuccess = await downloadFromFtp(client, file.name, localFilePath);

      if (downloadSuccess) {
        // Otpremanje na MinIO
        const uploadSuccess = await uploadToMinio(localFilePath, file.name);

        // Brisanje lokalne kopije
        if (fs.existsSync(localFilePath)) {
          fs.unlinkSync(localFilePath);
          console.log(`Lokalna kopija ${localFilePath} obrisana`);
        }

        // Brisanje fajla sa FTP servera ako je konfiguracija tako postavljena
        if (config.deleteAfterUpload && uploadSuccess) {
          try {
            await client.remove(file.name);
            console.log(`Fajl ${file.name} obrisan sa FTP servera`);
          } catch (err) {
            console.error(`Greška pri brisanju fajla ${file.name} sa FTP servera:`, err);
          }
        }
      }
    }

    console.log(`Sinhronizacija završena u ${new Date().toLocaleString()}`);
  } catch (err) {
    console.error('Greška pri sinhronizaciji:', err);
    throw err; // Re-throw error za handling izvan funkcije
  } finally {
    client.close();
  }
}

// Prepoznavanje komandne linije argumenta za testiranje
if (process.argv.includes('--test-dates')) {
  console.log('Pokretanje testa datuma fajlova...');
  testFileDates().catch(err => console.error('Greška pri testiranju datuma:', err));
} else if (process.argv.includes('--sync-now')) {
  console.log('Pokretanje ručne sinhronizacije...');
  syncFtpToMinio().catch(err => console.error('Greška pri ručnoj sinhronizaciji:', err));
} else {
  // Prva sinhronizacija pri pokretanju
  setTimeout(() => {
    syncFtpToMinio().catch(err => console.error('Greška pri inicijalnoj sinhronizaciji:', err));
  }, 5000);  // Sačekaj 5 sekundi pre prve sinhronizacije

  // Kreiranje cron job-a za periodičnu sinhronizaciju
  const job = new CronJob(config.cronSchedule, function() {
    syncFtpToMinio().catch(err => console.error('Greška pri cron sinhronizaciji:', err));
  }, null, true, 'Europe/Belgrade');

  job.start();
  console.log(`Cron job pokrenut, raspored: ${config.cronSchedule}`);
}

// Upravljanje zatvaranjem programa
process.on('SIGINT', async () => {
  console.log('Primljen signal za zaustavljanje...');
  job.stop();
  console.log('Cron job zaustavljen');
  process.exit(0);
});

// Eksportujemo funkciju za ručno pokretanje
module.exports = {
  syncFtpToMinio,
  testFileDates
};