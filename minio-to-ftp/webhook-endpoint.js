// webhook-endpoint.js - Dodaj ovaj fajl u minio-to-ftp projekat
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { downloadFromMinio, uploadToFtp } = require('./minio-to-ftp-sync');

// Kreiranje Express aplikacije
const app = express();
const PORT = process.env.WEBHOOK_PORT || 3100;

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));

// Praćenje obrađenih slika
const processedRequests = new Set();

// Webhook endpoint za obradu pojedinačnih slika
app.post('/process', async (req, res) => {
    try {
        console.log('Primljen webhook zahtev za obradu slike');

        // Brz odgovor da ne blokiramo pozivatelja
        res.status(202).send('Zahtev primljen');

        const { bucket, object, action } = req.body;

        if (!bucket || !object) {
            console.error('Nedostaju obavezni parametri: bucket ili object');
            return;
        }

        // Provera da li slika odgovara našim kriterijumima (veličina i ekstenzija)
        if (!isTargetImage(object)) {
            console.log(`Preskačem sliku ${object} koja ne odgovara konfiguraciji za izvoz`);
            return;
        }

        // Provera da li je već obrađeno (dedupliciranje) - preskačemo samo ako ne radimo overwrite
        if (!config.overwriteExisting) {
            const requestId = `${bucket}:${object}`;
            if (processedRequests.has(requestId)) {
                console.log(`Preskačem već obrađeni zahtev: ${requestId}`);
                return;
            }

            // Dodavanje u set obrađenih
            processedRequests.add(requestId);

            // Ograničavanje veličine seta (da ne bi rastao beskonačno)
            if (processedRequests.size > 1000) {
                // Čisti najstarije elemente (set u JS ne podržava direktno FIFO, ali ovo je dovoljno dobro za ovu primenu)
                const iterator = processedRequests.values();
                processedRequests.delete(iterator.next().value);
            }
        }

        console.log(`Obrada slike ${object} iz bucketa ${bucket} za akciju ${action || 'export_to_ftp'}`);

        // Privremeni direktorij za preuzimanje
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Privremena putanja za fajl
        const localPath = path.join(tempDir, path.basename(object));

        try {
            // Preuzimanje sa MinIO
            await downloadFromMinio(object);

            // Otpremanje na FTP
            await uploadToFtp(localPath, object);

            // Brisanje privremenog fajla
            if (fs.existsSync(localPath)) {
                fs.unlinkSync(localPath);
                console.log(`Privremeni fajl ${localPath} obrisan`);
            }

            console.log(`Webhook obrada uspešno završena za ${object}`);
        } catch (err) {
            console.error(`Greška pri webhook obradi slike ${object}:`, err);
        }
    } catch (err) {
        console.error('Greška pri obradi webhook zahteva:', err);
    }
});

// Zdravstveni endpoint
app.get('/health', (req, res) => {
    res.status(200).send('Webhook servis je aktivan');
});

// Pokretanje servera
app.listen(PORT, () => {
    console.log(`Webhook server pokrenut na portu ${PORT}`);
});

// Eksportovanje funkcija za testiranje
module.exports = { app };