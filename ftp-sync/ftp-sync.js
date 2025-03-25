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
  lookbackHours: parseInt(process.env.LOOKBACK_HOURS || '48') // Koliko sati unazad tražimo nove fajlove
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

// POBOLJŠANA: Funkcija za proveru da li je fajl noviji od zadatog vremena
function isFileRecent(fileDate) {
  // Provera da li je fileDate validna vrednost
  if (!fileDate || !(fileDate instanceof Date) || isNaN(fileDate.getTime())) {
    //console.log(`Upozorenje: Nevažeći datum fajla:`, fileDate);
    return false;  // Tretiramo nevažeće datume kao stare
  }

  // Direktno računamo razliku u satima
  const now = new Date();
  const diffHours = (now - fileDate) / (1000 * 60 * 60);

  // Debugging info - otkomentarišite ako je potrebno
  // console.log(`Fajl datum: ${fileDate.toISOString()}, razlika: ${diffHours.toFixed(2)}h, granica: ${config.lookbackHours}h`);

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

// NOVO: Test funkcija za proveru specifičnog fajla
async function testSpecificFileDocker() {
  console.log("=== TEST SPECIFIČNOG FAJLA U DOCKER-u ===");
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

    // Tražimo specifični fajl
    const specificFile = fileList.find(file => file.name === "5249OM0B22P00.jpg");

    if (specificFile) {
      console.log("Pronađen specifični fajl:");
      console.log(`Ime fajla: ${specificFile.name}`);
      console.log(`Tip fajla: ${specificFile.type}`);

      // Ispisujemo više informacija o datumu
      const fileDate = specificFile.modifiedAt;
      //console.log(`\nDatum modifikacije (lokalno vreme): ${fileDate.toLocaleString()}`);
      console.log(`Datum modifikacije (ISO): ${fileDate.toISOString()}`);
      console.log(`Datum modifikacije (Unix timestamp): ${fileDate.getTime()}`);
      console.log(`Vremenska zona (offset u minutima): ${fileDate.getTimezoneOffset()}`);

      // Ispisujemo informacije o trenutnom vremenu Docker kontejnera
      const now = new Date();
      //console.log(`\nDocker trenutno vreme (lokalno): ${now.toLocaleString()}`);
      console.log(`Docker trenutno vreme (ISO): ${now.toISOString()}`);
      console.log(`Docker trenutno vreme (Unix timestamp): ${now.getTime()}`);
      console.log(`Docker vremenska zona (offset u minutima): ${now.getTimezoneOffset()}`);

      // Provera razlike u satima
      const diffHours = (now - fileDate) / (1000 * 60 * 60);
      console.log(`\nRazlika u satima između trenutnog vremena i datuma fajla: ${diffHours.toFixed(2)}h`);
      console.log(`Podešena granica u konfiguraciji: ${config.lookbackHours}h`);
      console.log(`Da li je fajl noviji od granice (diffHours <= lookbackHours): ${diffHours <= config.lookbackHours}`);

      // Testiranje različitih implementacija
      const implementacije = [
        {
          naziv: "Originalna (lookbackTime, fileDate >= lookback)",
          funkcija: (fDate) => {
            const n = new Date();
            const lookback = new Date(n.getTime() - (config.lookbackHours * 60 * 60 * 1000));
            return fDate >= lookback && fDate <= n;
          }
        },
        {
          naziv: "Nova (direktno poređenje razlike u satima)",
          funkcija: (fDate) => {
            const n = new Date();
            const diffHr = (n - fDate) / (1000 * 60 * 60);
            return diffHr <= config.lookbackHours;
          }
        }
      ];

      console.log("\nRezultati različitih implementacija:");
      for (const impl of implementacije) {
        const rezultat = impl.funkcija(fileDate);
        console.log(`- ${impl.naziv}: ${rezultat ? "RECENT" : "NOT RECENT"}`);
      }

      // Proveravamo sve fajlove u poslednjih X sati
      const recentFilesByDiff = fileList.filter(file => {
        if (file.type !== ftp.FileType.File || !file.modifiedAt || !(file.modifiedAt instanceof Date)) {
          return false;
        }
        const diffHr = (now - file.modifiedAt) / (1000 * 60 * 60);
        return diffHr <= config.lookbackHours;
      });

      console.log(`\nBroj fajlova u poslednjih ${config.lookbackHours} sati (direktno poređenje): ${recentFilesByDiff.length}`);
      if (recentFilesByDiff.length <= 10) {
        console.log("Lista tih fajlova:");
        recentFilesByDiff.forEach(file => {
          const diffHr = (now - file.modifiedAt) / (1000 * 60 * 60);
          console.log(`- ${file.name} (${file.modifiedAt.toLocaleString()}, pre ${diffHr.toFixed(2)}h)`);
        });
      }

    } else {
      console.log(`Fajl 5249OM0B22P00.jpg nije pronađen na FTP serveru.`);

      // Ako specifični fajl nije pronađen, ispisujemo prvih 10 fajlova za reference
      console.log("\nPrvih 10 fajlova na serveru za referencu:");
      fileList.slice(0, 10).forEach(file => {
        if (file.modifiedAt && file.modifiedAt instanceof Date) {
          console.log(`- ${file.name} (${file.modifiedAt.toLocaleString()})`);
        } else {
          console.log(`- ${file.name} (nema validnog datuma)`);
        }
      });
    }

  } catch (err) {
    console.error('Greška pri testiranju specifičnog fajla:', err);
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

    // Debug ispis za sve fajlove (otkomentarisati ako je potrebno)
    // console.log("Fileinfo za sve fajlove:");
    // fileList.forEach(file => {
    //   console.log(`Fajl: ${file.name}, Tip: ${file.type}, Datum: ${file.modifiedAt}, Validan datum: ${file.modifiedAt instanceof Date}`);
    // });

    // Filtriranje samo novijih fajlova i isključivanje direktorijuma
    const recentFiles = fileList.filter(file => {
      const isFile = file.type === ftp.FileType.File;
      const isRecent = isFileRecent(file.modifiedAt);

      // Debugging (otkomentarisati ako je potrebno)
      // if (isFile) {
      //   const now = new Date();
      //   const diffHours = (now - file.modifiedAt) / (1000 * 60 * 60);
      //   console.log(`Fajl: ${file.name}, Je fajl: ${isFile}, Je skorašnji: ${isRecent}, Razlika u satima: ${diffHours.toFixed(2)}`);
      // }

      return isFile && isRecent;
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

// Prvo pokrećemo test funkciju
testSpecificFileDocker().catch(err => console.error('Greška pri testiranju specifičnog fajla u Docker-u:', err));

// Prva sinhronizacija pri pokretanju
setTimeout(() => {
  syncFtpToMinio().catch(err => console.error('Greška pri inicijalnoj sinhronizaciji:', err));
}, 10000);  // Sačekaj 10 sekundi pre prve sinhronizacije (produženo zbog testa)

// Kreiranje cron job-a za periodičnu sinhronizaciju
const job = new CronJob(config.cronSchedule, function() {
  syncFtpToMinio().catch(err => console.error('Greška pri cron sinhronizaciji:', err));
}, null, true, 'Europe/Belgrade');

job.start();
console.log(`Cron job pokrenut, raspored: ${config.cronSchedule}`);

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
  testSpecificFileDocker

};