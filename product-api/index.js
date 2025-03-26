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
const CACHE_TTL = 5 * 60 * 1000; // 5 minuta

// Jednostavni keš za optimizaciju
const cache = {
    skus: null,
    skuExpiry: 0,
    images: {},
    imageExpiry: {}
};

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
app.use('/api/image-proxy', authenticateToken);

// Endpoint za dobijanje liste SKU-ova s paginacijom
app.get('/api/skus', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const startIndex = (page - 1) * limit;
        const now = Date.now();

        // Provjeri keš
        if (cache.skus && cache.skuExpiry > now) {
            console.log('Serving SKUs from cache');
            const paginatedSkus = cache.skus.slice(startIndex, startIndex + limit);

            return res.json({
                total: cache.skus.length,
                page,
                limit,
                data: paginatedSkus,
                cached: true
            });
        }

        console.log('Fetching SKUs from MinIO');
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
            const sortedSkus = Array.from(skus).sort();
            const paginatedSkus = sortedSkus.slice(startIndex, startIndex + limit);

            // Keširaj rezultate
            cache.skus = sortedSkus;
            cache.skuExpiry = now + CACHE_TTL;

            res.json({
                total: sortedSkus.length,
                page,
                limit,
                data: paginatedSkus,
                cached: false
            });
        });
    } catch (error) {
        console.error('Error in /api/skus:', error);
        res.status(500).json({ error: 'Failed to list SKUs', details: error.message });
    }
});

// Endpoint za dobijanje slika za određeni SKU - optimizovan
app.get('/api/images/:sku/:size', async (req, res) => {
    try {
        const { sku, size } = req.params;
        const now = Date.now();
        const cacheKey = `${sku}_${size}`;

        // Provjeri keš
        if (cache.images[cacheKey] && cache.imageExpiry[cacheKey] > now) {
            console.log(`Serving images for ${sku}/${size} from cache`);
            return res.json(cache.images[cacheKey]);
        }

        const images = [];
        const prefix = `${sku}/${size}/`;

        console.log(`Fetching images for ${sku}/${size} from MinIO`);
        const stream = minioClient.listObjectsV2(BUCKET_NAME, prefix, false);

        let objectCount = 0;

        stream.on('data', (obj) => {
            objectCount++;
            // Koristi direktni URL za sliku
            const publicUrl = `https://s3bkids.bebakids.com/products/${obj.name}`;

            images.push({
                name: obj.name.replace(prefix, ''),
                fullPath: obj.name,
                url: publicUrl,
                size: obj.size,
                lastModified: obj.lastModified
            });
        });

        stream.on('error', (err) => {
            console.error(`Error listing images for SKU ${sku}:`, err);
            res.status(500).json({ error: 'Failed to list images', details: err.message });
        });

        stream.on('end', () => {
            console.log(`Found ${objectCount} images for ${sku}/${size}`);
            // Sortiraj slike po imenu
            images.sort((a, b) => a.name.localeCompare(b.name));

            // Keširaj rezultate
            cache.images[cacheKey] = images;
            cache.imageExpiry[cacheKey] = now + CACHE_TTL;

            res.json(images);
        });
    } catch (error) {
        console.error('Error in /api/images/:sku/:size:', error);
        res.status(500).json({ error: 'Failed to list images', details: error.message });
    }
});

// Proxy za slike - kao alternativni pristup
app.get('/api/image-proxy/:objectPath(*)', (req, res) => {
    try {
        const objectPath = req.params.objectPath;

        console.log(`Proxy request for image: ${objectPath}`);

        // Dohvati objekt iz MinIO
        minioClient.getObject(BUCKET_NAME, objectPath, (err, dataStream) => {
            if (err) {
                console.error(`Error getting object ${objectPath}:`, err);
                return res.status(404).json({ error: 'Image not found' });
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

            // Postavi keš zaglavlja za browser
            res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 dan

            // Pipe datotočni stream direktno u HTTP odgovor
            dataStream.pipe(res);
        });
    } catch (error) {
        console.error('Error in image proxy:', error);
        res.status(500).json({ error: 'Error fetching image' });
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

// Endpoint za čišćenje keša
app.post('/api/cache/clear', authenticateToken, (req, res) => {
    try {
        cache.skus = null;
        cache.skuExpiry = 0;
        cache.images = {};
        cache.imageExpiry = {};

        console.log('Cache cleared');
        res.json({ status: 'ok', message: 'Cache cleared' });
    } catch (error) {
        console.error('Error clearing cache:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

// Pokreni server
const PORT = process.env.PORT || 9080;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});