const Minio = require('minio');

// Konfiguracija za javnu domenu
const PUBLIC_DOMAIN = 's3bkids.bebakids.com';
const USE_SSL = true;

// MinIO konfiguracija za interne operacije (list, get, itd.)
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

// Funkcija za generiranje privremenog URL-a koristeći javni klijent
const getPresignedUrl = async (objectName, expiry = 3600) => {
    try {
        // Koristi javni klijent za generiranje URL-a s ispravnim potpisom
        return await publicClient.presignedGetObject(BUCKET_NAME, objectName, expiry);
    } catch (error) {
        console.error('Greška pri generiranju presigned URL-a:', error);
        throw error;
    }
};

// Dohvaćanje liste svih SKU foldera - koristi interni klijent
const listSkuFolders = async () => {
    try {
        // Dohvati listu svih objekata
        const objects = await listAllObjects(BUCKET_NAME, '');

        // Izdvoji samo SKU foldere (prvi level direktorije)
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

// Dohvaćanje slika za određeni SKU - koristi interni klijent za listing, javni za URL-ove
const getSkuImages = async (sku) => {
    try {
        // Dohvati sve objekte iz SKU foldera koristeći interni klijent
        const objects = await listAllObjects(BUCKET_NAME, `${sku}/`);

        // Grupiraj po podfolderu (large, medium, thumb)
        const result = {
            thumb: [],
            medium: [],
            large: [],
            minithumb: []
        };

        // Za svaki objekt, generiraj presigned URL koristeći javni klijent
        for (const obj of objects) {
            // Podijeli putanju na dijelove
            const parts = obj.name.split('/');
            if (parts.length >= 3) {
                const folder = parts[1]; // large, medium, thumb
                if (result[folder]) {
                    const url = await getPresignedUrl(obj.name);
                    result[folder].push({
                        name: parts[2],
                        url: url,
                        lastModified: obj.lastModified
                    });
                }
            }
        }

        return result;
    } catch (error) {
        console.error(`Greška pri dohvaćanju slika za SKU ${sku}:`, error);
        throw error;
    }
};

// Pomoćna funkcija za izlistavanje svih objekata - koristi interni klijent
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