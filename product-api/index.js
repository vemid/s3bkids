require('dotenv').config();
const express = require('express');
const Minio = require('minio');
const archiver = require('archiver');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { authenticateToken } = require('./middleware/auth');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev')); // za logovanje

// Povezivanje s MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('Povezan s MongoDB-om'))
    .catch(err => console.error('Greška pri povezivanju s MongoDB-om:', err));

// Auth routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Konfiguracija Minio klijenta
const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY
});

const BUCKET_NAME = process.env.MINIO_BUCKET || 'products';
const TEMP_DIR = path.join(__dirname, 'temp');

// Osiguraj da temp direktorij postoji
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Route za provjeru statusa
app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Sve routes ispod ove linije zahtijevaju autentifikaciju
app.use('/api/skus', authenticateToken);
app.use('/api/images', authenticateToken);
app.use('/api/download-zip', authenticateToken);

// Endpoint za dobijanje liste SKU-ova
app.get('/api/skus', async (req, res) => {
    try {
        const skus = new Set();
        const stream = minioClient.listObjectsV2(BUCKET_NAME, '', true);

        stream.on('data', (obj) => {
            // Izdvajanje SKU iz putanje (npr. "SKU123/large/image.jpg" -> "SKU123")
            const parts = obj.name.split('/');
            if (parts.length > 1) {
                skus.add(parts[0]);
            }
        });

        stream.on('error', (err) => {
            console.error('Error listing objects:', err);
            res.status(500).json({ error: 'Failed to list SKUs', details: err.message });
        });

        stream.on('end', () => {
            res.json(Array.from(skus).sort());
        });
    } catch (error) {
        console.error('Error in /api/skus:', error);
        res.status(500).json({ error: 'Failed to list SKUs', details: error.message });
    }
});

// Endpoint za dobijanje slika za određeni SKU
app.get('/api/images/:sku/:size', async (req, res) => {
    try {
        const { sku, size } = req.params;
        const images = [];

        // Logirajte što točno tražimo
        console.log(`Traženje slika za SKU: ${sku}, size: ${size}`);

        // Pokušajte naći slike bez obzira na velika/mala slova
        const stream = minioClient.listObjectsV2(BUCKET_NAME, '', true);

        stream.on('data', async (obj) => {
            const parts = obj.name.split('/');
            if (parts.length > 2 &&
                parts[0].toLowerCase() === sku.toLowerCase() &&
                parts[1].toLowerCase() === size.toLowerCase()) {
                try {
                    const url = await minioClient.presignedGetObject(BUCKET_NAME, obj.name, 60 * 60);

                    const proxyUrl = `/api/image-proxy/${obj.name}`;

                    images.push({
                        name: parts.slice(2).join('/'),
                        fullPath: obj.name,
                        url: proxyUrl,
                        size: obj.size,
                        lastModified: obj.lastModified
                    });
                } catch (err) {
                    console.error(`Error generating URL for ${obj.name}:`, err);
                }
            }
        });

        stream.on('error', (err) => {
            console.error(`Error listing images for SKU ${sku}:`, err);
            res.status(500).json({ error: 'Failed to list images', details: err.message });
        });

        stream.on('end', () => {
            console.log(`Pronađeno ${images.length} slika za SKU: ${sku}, size: ${size}`);
            images.sort((a, b) => a.name.localeCompare(b.name));
            res.json(images);
        });
    } catch (error) {
        console.error('Error in /api/images/:sku/:size:', error);
        res.status(500).json({ error: 'Failed to list images', details: error.message });
    }
});

// Proxy za slike - omogućava dohvaćanje slika direktno kroz API
app.get('/api/image-proxy/:objectPath(*)', authenticateToken, (req, res) => {
    try {
        const objectPath = req.params.objectPath;

        console.log(`Proxy zahtjev za sliku: ${objectPath}`);

        // Dohvati objekt iz MinIO
        minioClient.getObject(BUCKET_NAME, objectPath, (err, dataStream) => {
            if (err) {
                console.error(`Greška pri dohvaćanju slike ${objectPath}:`, err);
                return res.status(404).json({ error: 'Slika nije pronađena' });
            }

            // Odredi Content-Type prema ekstenziji datoteke
            const extension = path.extname(objectPath).toLowerCase();
            let contentType = 'application/octet-stream'; // Default

            if (extension === '.jpg' || extension === '.jpeg') {
                contentType = 'image/jpeg';
            } else if (extension === '.png') {
                contentType = 'image/png';
            } else if (extension === '.gif') {
                contentType = 'image/gif';
            } else if (extension === '.webp') {
                contentType = 'image/webp';
            }

            // Postavi odgovarajuće zaglavlje
            res.setHeader('Content-Type', contentType);

            // Pipe datotočni stream direktno u HTTP odgovor
            dataStream.pipe(res);
        });
    } catch (error) {
        console.error('Greška u image-proxy ruti:', error);
        res.status(500).json({ error: 'Greška pri dohvaćanju slike' });
    }
});

// Endpoint za preuzimanje ZIP arhive za određene SKU-ove
app.post('/api/download-zip', async (req, res) => {
    try {
        const { skus, size } = req.body;

        if (!skus || !Array.isArray(skus) || skus.length === 0) {
            return res.status(400).json({ error: 'Invalid or missing SKUs array' });
        }

        const imageSize = size || 'large'; // Default na 'large' ako nije specificiran
        const timestamp = Date.now();
        const zipFileName = `products-${timestamp}.zip`;
        const zipFilePath = path.join(TEMP_DIR, zipFileName);

        // Kreiraj write stream za ZIP fajl
        const output = fs.createWriteStream(zipFilePath);
        const archive = archiver('zip', {
            zlib: { level: 5 } // Nivo kompresije
        });

        // Postavi event listenere
        output.on('close', () => {
            console.log(`ZIP archive created: ${zipFilePath} (${archive.pointer()} bytes)`);

            // Šalji fajl klijentu
            res.download(zipFilePath, `products-${skus.join('-')}.zip`, (err) => {
                if (err) {
                    console.error('Error sending ZIP file:', err);
                }

                // Obriši privremeni fajl nakon slanja
                fs.unlink(zipFilePath, (unlinkErr) => {
                    if (unlinkErr) {
                        console.error('Error deleting temporary ZIP file:', unlinkErr);
                    }
                });
            });
        });

        archive.on('error', (err) => {
            console.error('Error creating ZIP archive:', err);
            res.status(500).json({ error: 'Failed to create ZIP archive', details: err.message });
        });

        // Pipe archive na output
        archive.pipe(output);

        // Za svaki SKU, dodaj odgovarajuće slike u arhivu
        for (const sku of skus) {
            const prefix = `${sku}/${imageSize}/`;

            // Dohvati sve slike za trenutni SKU
            try {
                const stream = minioClient.listObjectsV2(BUCKET_NAME, prefix, false);

                const objectsPromises = [];

                stream.on('data', (obj) => {
                    // Dodaj obećanje za dohvaćanje objekta
                    const objectPromise = new Promise((resolve, reject) => {
                        minioClient.getObject(BUCKET_NAME, obj.name, (err, dataStream) => {
                            if (err) {
                                console.error(`Error getting object ${obj.name}:`, err);
                                reject(err);
                                return;
                            }

                            // Kreiraj putanju u ZIP arhivi
                            const zipPath = obj.name;

                            // Dodaj dataStream u arhivu
                            archive.append(dataStream, { name: zipPath });
                            resolve();
                        });
                    });

                    objectsPromises.push(objectPromise);
                });

                stream.on('error', (err) => {
                    console.error(`Error listing objects for SKU ${sku}:`, err);
                });

                // Čekaj da se završi listanje objekata
                await new Promise(resolve => stream.on('end', resolve));

                // Čekaj da se svi objekti dodaju u arhivu
                await Promise.allSettled(objectsPromises);

            } catch (err) {
                console.error(`Error processing SKU ${sku}:`, err);
            }
        }

        // Finaliziraj arhivu
        archive.finalize();

    } catch (error) {
        console.error('Error in /api/download-zip:', error);

        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to create ZIP archive', details: error.message });
        }
    }
});

// Pokreni server
const PORT = process.env.PORT || 9080;
app.listen(PORT,"0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});