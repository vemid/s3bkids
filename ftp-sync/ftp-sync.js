// ftp-sync.js sa ftp-srv bibliotekom
const FTPClient = require('ftp'); // Koristimo standardnu 'ftp' biblioteku
const fs = require('fs');
const path = require('path');
const { CronJob } = require('cron');
const { promisify } = require('util');
const { uploadToMinioDirectly } = require('./direct-upload');

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
  lookbackHours: parseInt(process.env.LOOKBACK_HOURS || '24'), // Koliko sati unazad tražimo nove fajlove
  // Lista specifičnih fajlova koje želimo da obradimo
  specificFiles: [
    "5249OM0B22P00.jpg",
    "5249OM0B22P01.jpg",
    "5259OZ0H33A01.jpg"
    // Dodajte više fajlova po potrebi
  ]
};

// Kreiranje privremenog direktorijuma ako ne postoji
const tempDir = path.resolve(process.cwd(), config.tempDir);
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
  console.log(`Kreiran temp direktorij: ${tempDir}`);
}

console.log(`FTP-MinIO sync servis se pokreće...`);
console.log(`FTP konfiguracija: ${config.ftp.host}:${config.ftp.port}`);
console.log(`MinIO konfiguracija: ${config.minio.endpoint}:${config.minio.port}`);
console.log(`Cronjob raspored: ${config.cronSchedule}`);
console.log(`Pretraga fajlova do ${config.lookbackHours} sati unazad`);

// Promise wrapper za FTP listu
function ftpList(client, path) {
  return new Promise((resolve, reject) => {
    client.list(path, (err, list) => {
      if (err) reject(err);
      else resolve(list);
    });
  });
}

// Promise wrapper za FTP preuzimanje
function ftpGet(client, remotePath, localPath) {
  return new Promise((resolve, reject) => {
    client.get(remotePath, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      const writeStream = fs.createWriteStream(localPath);
      stream.pipe(writeStream);

      writeStream.on('finish', () => {
        resolve(true);
      });

      writeStream.on('error', (err) => {
        reject(err);
      });
    });
  });
}

// Promise wrapper za FTP brisanje
function ftpDelete(client, path) {
  return new Promise((resolve, reject) => {
    client.delete(path, (err) => {
      if (err) reject(err);
      else resolve(true);
    });
  });
}

// Promise wrapper za FTP konekciju
function ftpConnect(config) {
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

// Funkcija za proveru da li je fajl noviji od zadatog vremena
function isFileRecent(file) {
  // Provera da li je file.date validna vrednost
  if (!file.date) {
    console.log(`Upozorenje: Fajl ${file.name} nema datum.`);
    return false;
  }

  const fileDate = new Date(file.date);
  if (isNaN(fileDate.getTime())) {
    console.log(`Upozorenje: Nevažeći datum fajla ${file.name}:`, file.date);
    return false;
  }

  const now = new Date();
  const diffHours = (now - fileDate) / (1000 * 60 * 60);

  // Debugging info
  // console.log(`Fajl: ${file.name}, Datum: ${fileDate.toISOString()}, Razlika: ${diffHours.toFixed(2)}h`);

  return diffHours <= config.lookbackHours;
}

// Funkcija za otpremanje fajla na MinIO server
async function uploadToMinio(localFilePath, fileName) {
  try {
    console.log(`Otpremanje ${fileName} na MinIO...`);
    await uploadToMinioDirectly(localFilePath, fileName, config);
    console.log(`Fajl ${fileName} je uspešno otpremljen i obrađen`);
    return true;
  } catch (err) {
    console.error(`Greška pri otpremanju fajla ${fileName} na MinIO:`, err);
    return false;
  }
}

// Funkcija za testiranje datuma fajlova
async function testFileDates() {
  console.log("=== TEST DATUMA FAJLOVA ===");
  let client;

  try {
    client = await ftpConnect(config);
    console.log(`Uspešno povezan na FTP server ${config.ftp.host}`);

    // Listanje fajlova
    const fileList = await ftpList(client, config.ftp.remotePath);
    console.log(`Pronađeno ${fileList.length} fajlova na FTP serveru`);

    // Testiramo nekoliko fajlova
    const testFiles = fileList.filter(file => file.type === '-').slice(0, 5); // '-' označava fajl u ovoj biblioteci

    for (const file of testFiles) {
      console.log(`\nTestiranje fajla: ${file.name}`);
      console.log(`Datum: ${file.date}`);

      const fileDate = new Date(file.date);
      console.log(`Parsirani datum: ${fileDate.toISOString()}`);

      const now = new Date();
      const diffHours = (now - fileDate) / (1000 * 60 * 60);
      console.log(`Razlika u satima: ${diffHours.toFixed(2)}h`);
      console.log(`Granica u satima: ${config.lookbackHours}h`);
      console.log(`Da li je recent: ${diffHours <= config.lookbackHours}`);
    }

  } catch (err) {
    console.error('Greška pri testiranju datuma fajlova:', err);
  } finally {
    if (client) client.end();
  }
}

// Funkcija za sinhronizaciju specifičnih fajlova
async function syncSpecificFiles() {
  console.log(`Pokretanje sinhronizacije specifičnih fajlova u ${new Date().toLocaleString()}...`);
  let client;

  try {
    client = await ftpConnect(config);
    console.log(`Uspešno povezan na FTP server ${config.ftp.host}`);

    // Listanje fajlova
    const fileList = await ftpList(client, config.ftp.remotePath);
    console.log(`Pronađeno ${fileList.length} fajlova na FTP serveru`);

    // Filtriramo specifične fajlove
    const filesToProcess = fileList.filter(file =>
        file.type === '-' && // '-' označava fajl u ovoj biblioteci
        config.specificFiles.includes(file.name)
    );

    console.log(`Obrađujem ${filesToProcess.length} specifičnih fajlova: ${config.specificFiles.join(', ')}`);

    // Obrada svakog fajla
    for (const file of filesToProcess) {
      const remotePath = path.posix.join(config.ftp.remotePath, file.name);
      const localPath = path.join(config.tempDir, file.name);

      console.log(`Obrada fajla: ${file.name}`);

      try {
        // Preuzimanje fajla
        await ftpGet(client, file.name, localPath);
        console.log(`Fajl ${file.name} uspešno preuzet`);

        // Otpremanje na MinIO
        const uploadSuccess = await uploadToMinio(localPath, file.name);

        // Brisanje lokalne kopije
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
          console.log(`Lokalna kopija ${localPath} obrisana`);
        }

        // Brisanje fajla sa FTP servera ako je tako konfigurisano
        if (config.deleteAfterUpload && uploadSuccess) {
          await ftpDelete(client, file.name);
          console.log(`Fajl ${file.name} obrisan sa FTP servera`);
        }
      } catch (err) {
        console.error(`Greška pri obradi fajla ${file.name}:`, err);
      }
    }

    console.log(`Sinhronizacija specifičnih fajlova završena u ${new Date().toLocaleString()}`);
  } catch (err) {
    console.error('Greška pri sinhronizaciji:', err);
  } finally {
    if (client) client.end();
  }
}

// Glavna funkcija za sinhronizaciju
async function syncFtpToMinio() {
  console.log(`Pokretanje sinhronizacije u ${new Date().toLocaleString()}...`);
  let client;

  try {
    client = await ftpConnect(config);
    console.log(`Uspešno povezan na FTP server ${config.ftp.host}`);

    // Listanje fajlova
    const fileList = await ftpList(client, config.ftp.remotePath);
    console.log(`Pronađeno ${fileList.length} fajlova na FTP serveru`);

    // Filtriranje samo novijih fajlova
    const recentFiles = fileList.filter(file =>
        file.type === '-' && // '-' označava fajl u ovoj biblioteci
        isFileRecent(file)
    );

    console.log(`Od toga, ${recentFiles.length} fajlova je novije od ${config.lookbackHours} sati`);

    // Obrada svakog fajla
    for (const file of recentFiles) {
      const remotePath = path.posix.join(config.ftp.remotePath, file.name);
      const localPath = path.join(config.tempDir, file.name);

      console.log(`Obrada fajla: ${file.name}`);

      try {
        // Preuzimanje fajla
        await ftpGet(client, file.name, localPath);
        console.log(`Fajl ${file.name} uspešno preuzet`);

        // Otpremanje na MinIO
        const uploadSuccess = await uploadToMinio(localPath, file.name);

        // Brisanje lokalne kopije
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
          console.log(`Lokalna kopija ${localPath} obrisana`);
        }

        // Brisanje fajla sa FTP servera ako je tako konfigurisano
        if (config.deleteAfterUpload && uploadSuccess) {
          await ftpDelete(client, file.name);
          console.log(`Fajl ${file.name} obrisan sa FTP servera`);
        }
      } catch (err) {
        console.error(`Greška pri obradi fajla ${file.name}:`, err);
      }
    }

    console.log(`Sinhronizacija završena u ${new Date().toLocaleString()}`);
  } catch (err) {
    console.error('Greška pri sinhronizaciji:', err);
  } finally {
    if (client) client.end();
  }
}

// Prepoznavanje komandne linije argumenta za testiranje
if (process.argv.includes('--test-dates')) {
  console.log('Pokretanje testa datuma fajlova...');
  testFileDates().catch(err => console.error('Greška pri testiranju datuma:', err));
} else if (process.argv.includes('--sync-specific')) {
  console.log('Pokretanje sinhronizacije specifičnih fajlova...');
  syncSpecificFiles().catch(err => console.error('Greška pri sinhronizaciji specifičnih fajlova:', err));
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
  if (typeof job !== 'undefined') {
    job.stop();
    console.log('Cron job zaustavljen');
  }
  process.exit(0);
});

// Eksportujemo funkcije za ručno pokretanje
module.exports = {
  syncFtpToMinio,
  syncSpecificFiles,
  testFileDates
};