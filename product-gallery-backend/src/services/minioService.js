const Minio = require('minio');

// Konfiguracija za javnu domenu
const PUBLIC_DOMAIN = 's3bkids.bebakids.com';
const USE_SSL = true;

// MinIO konfiguracija za interne operacije
const INTERNAL_ENDPOINT = process.env.MINIO_ENDPOINT || 'minio';
const INTERNAL_PORT = parseInt(process.env.MINIO_PORT || '9000');
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'adminbk';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'Admin710412!';
const BUCKET_NAME = process.env.MINIO_BUCKET || 'products';

// Kreiranje MinIO klijenta za interne operacije
const internalClient = new Minio.Client({
    endPoint: INTERNAL_ENDPOINT,
    port: INTERNAL_PORT,
    useSSL: false,
    accessKey: MINIO_ACCESS_KEY,
    secretKey: MINIO_SECRET_KEY
});

// Kreiranje MinIO klijenta za javne URL-ove
const publicClient = new Minio.Client({
    endPoint: PUBLIC_DOMAIN,
    port: 443,
    useSSL: USE_SSL,
    accessKey: MINIO_ACCESS_KEY,
    secretKey: MINIO_SECRET_KEY
});

// Funkcija za generiranje privremenog URL-a
const getPresignedUrl = async (objectName, expiry = 3600) => {
    try {
        return await publicClient.presignedGetObject(BUCKET_NAME, objectName, expiry);
    } catch (error) {
        console.error('Greška pri generiranju presigned URL-a:', error);
        throw error;
    }
};

// Dohvaćanje liste svih SKU foldera
const listSkuFolders = async () => {
    try {
        const objects = await listAllObjects(BUCKET_NAME, '');

        const skuSet = new Set();

        objects.forEach(obj => {
            const parts = obj.name.split('/');
            if (parts.length > 1 && parts[0].length > 0) {
                skuSet.add(parts[0]);
            }
        });

        return Array.from(skuSet);
    } catch (error) {
        console.error('Greška pri dohvaćanju SKU foldera:', error);
        throw error;
    }
};

// Dohvaćanje slika za određeni SKU
const getSkuImages = async (sku) => {
    try {
        console.log(`Tražim slike za SKU: ${sku}`);
        const objects = await listAllObjects(BUCKET_NAME, `${sku}/`);
        console.log(`Pronađeno ${objects.length} objekta za SKU ${sku}`);

        // Grupiraj po podfolderu
        const result = {
            thumb: [],
            medium: [],
            large: [],
            minithumb: []
        };

        // Za debugiranje
        const folders = new Set();

        // Za svaki objekt
        for (const obj of objects) {
            const parts = obj.name.split('/');
            // Spremamo sve foldere koje pronađemo za debug
            if (parts.length > 1) {
                folders.add(parts[1]);
            }

            // Provjerimo ima li barem 3 dijela (sku/folder/filename)
            if (parts.length >= 3) {
                const folder = parts[1].toLowerCase(); // normaliziramo na lowercase
                console.log(`Folder: ${folder}, Filename: ${parts[2]}`);

                // Provjeri je li ovaj folder podržan
                if (result[folder] !== undefined) {
                    try {
                        const url = await getPresignedUrl(obj.name);
                        result[folder].push({
                            name: parts[2],
                            url: url,
                            lastModified: obj.lastModified,
                            size: obj.size
                        });
                    } catch (urlError) {
                        console.error(`Greška pri generiranju URL-a za ${obj.name}:`, urlError);
                    }
                }
            }
        }

        // Debug ispis statistike
        console.log(`Statistika slika za SKU ${sku}:`);
        for (const [folder, images] of Object.entries(result)) {
            console.log(`  ${folder}: ${images.length} slika`);
        }
        console.log(`Pronađeni folderi: ${Array.from(folders).join(', ')}`);

        return result;
    } catch (error) {
        console.error(`Greška pri dohvaćanju slika za SKU ${sku}:`, error);
        throw error;
    }
};

// Pomoćna funkcija za izlistavanje svih objekata
const listAllObjects = (bucketName, prefix = '') => {
    return new Promise((resolve, reject) => {
        const objects = [];
        const stream = internalClient.listObjects(bucketName, prefix, true);

        stream.on('data', (obj) => objects.push(obj));
        stream.on('error', reject);
        stream.on('end', () => resolve(objects));
    });
};

module.exports = {
    internalClient,
    publicClient,
    getPresignedUrl,
    listSkuFolders,
    getSkuImages
};