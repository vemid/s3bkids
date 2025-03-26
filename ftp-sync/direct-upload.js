const Minio = require('minio');
const fs = require('fs');
const path = require('path');  // Dodajte ovu liniju ako već nije prisutna
const axios = require('axios');

// Funkcija za direktno otpremanje na MinIO preko klijenta
async function uploadToMinioDirectly(localFilePath, fileName, config) {
  return new Promise((resolve, reject) => {
    try {
      console.log(`Pripremam otpremanje fajla ${fileName} na MinIO...`);

      // Kreiraj MinIO klijenta
      const minioClient = new Minio.Client({
        endPoint: config.minio.endpoint,
        port: config.minio.port,
        useSSL: false,
        accessKey: config.minio.accessKey,
        secretKey: config.minio.secretKey
      });

      console.log(`MinIO klijent kreiran: ${config.minio.endpoint}:${config.minio.port}`);

      // Proveri da li bucket postoji
      console.log(`Provera bucket-a: ${config.minio.bucketName}`);
      minioClient.bucketExists(config.minio.bucketName, (err, exists) => {
        if (err) {
          return reject(`Greška pri proveri bucket-a: ${err}`);
        }

        if (!exists) {
          return reject(`Bucket ${config.minio.bucketName} ne postoji`);
        }

        console.log(`Bucket ${config.minio.bucketName} postoji, nastavljam sa otpremanjem`);

        // Provjeri da li je putanja apsolutna ili relativna
        let absoluteFilePath = localFilePath;
        if (!path.isAbsolute(localFilePath)) {
          absoluteFilePath = path.resolve(process.cwd(), localFilePath);
        }

        // Osiguraj da direktorij postoji
        const tempDir = path.dirname(absoluteFilePath);
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
          console.log(`Kreiran direktorij: ${tempDir}`);
        }

        // Otpremi fajl
        const fileStream = fs.createReadStream(absoluteFilePath);
        const fileSize = fs.statSync(absoluteFilePath).size;

        console.log(`Otpremanje fajla ${fileName}, veličina: ${fileSize} bajtova`);

        minioClient.putObject(config.minio.bucketName, fileName, fileStream, fileSize, (err, etag) => {
          if (err) {
            return reject(`Greška pri otpremanju fajla: ${err}`);
          }

          console.log(`Fajl ${fileName} je uspešno otpremljen na MinIO (etag: ${etag})`);

          // Pozovi webhook za obradu - koristi environment varijablu ako postoji
          const webhookUrl = process.env.WEBHOOK_URL || `http://${config.minio.endpoint}:3000/resize`;

          console.log(`Pozivanje webhook-a na ${webhookUrl}`);

          axios.post(webhookUrl, {
            bucket: config.minio.bucketName,
            object: fileName
          })
              .then(() => {
                console.log(`Webhook poziv uspešan za ${fileName}`);
                resolve(true);
              })
              .catch(err => {
                console.error(`Greška pri pozivu webhook-a: ${err.message}`);
                // I dalje vraćamo uspeh jer je otpremanje uspelo
                resolve(true);
              });
        });
      });
    } catch (err) {
      reject(`Neočekivana greška: ${err}`);
    }
  });
}

module.exports = { uploadToMinioDirectly };