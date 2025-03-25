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

// Funkcija za proveru da li je fajl noviji od zadatog vremena
function isFileRecent(fileDate) {
  // Provera da li je fileDate validna vrednost
  if (!fileDate || !(fileDate instanceof Date) || isNaN(fileDate.getTime())) {
    //console.log(`Upozorenje: Nevažeći datum fajla:`, fileDate);
    return false;  // Tretiramo nevažeće datume kao stare
  }

  const now = new Date();
  now.setDate(now.getDate() + 1);
  const lookbackTime = new Date(now.getTime() - (config.lookbackHours * 60 * 60 * 1000));
  
  // console.log(`Sada: ${now.toISOString()}`);
  // console.log(`Lookback granica: ${lookbackTime.toISOString()}`);
  // console.log(`Datum fajla: ${fileDate.toISOString()}`);
  // console.log(`Razlika u satima: ${(now - fileDate) / (1000 * 60 * 60)}`);
  
  return fileDate > lookbackTime;
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
    
    // Debug ispis za sve fajlove
    console.log("Fileinfo za sve fajlove:");
    fileList.forEach(file => {
      // console.log(`Fajl: ${file.name}, Tip: ${file.type}, Datum: ${file.modifiedAt}, Validan datum: ${file.modifiedAt instanceof Date}`);
    });
    
    // Filtriranje samo novijih fajlova i isključivanje direktorijuma
   const recentFiles = fileList.filter(file => {
     const isFile = file.type === ftp.FileType.File;
     const isRecent = isFileRecent(file.modifiedAt);
     const isSpecificFile = file.name.startsWith('5259OZ0H33A01');
  
     // console.log(`Fajl: ${file.name}, Je fajl: ${isFile}, Je skorašnji: ${isRecent}, Je specifičan fajl: ${isSpecificFile}`);
  
  // Uzimamo ili novije fajlove ili specifični fajl koji tražimo
     return isFile && (isRecent || isSpecificFile);
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

// Upravljanje zatvaranjem programa
process.on('SIGINT', async () => {
  console.log('Primljen signal za zaustavljanje...');
  job.stop();
  console.log('Cron job zaustavljen');
  process.exit(0);
});

// Eksportujemo funkciju za ručno pokretanje
module.exports = {
  syncFtpToMinio
};
