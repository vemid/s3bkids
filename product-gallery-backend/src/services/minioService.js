const Minio = require('minio');

// MinIO konfiguracija
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'minio';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000');
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'adminbk';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'Admin710412!';
const BUCKET_NAME = process.env.MINIO_BUCKET || 'products';

// Javna domena MinIO servera
const PUBLIC_MINIO_URL = process.env.PUBLIC_MINIO_URL || 'https://s3bkids.bebakids.com';

// Kreiranje MinIO klijenta
const minioClient = new Minio.Client({
    endPoint: MINIO_ENDPOINT,
    port: MINIO_PORT,
    useSSL: false,
    accessKey: MINIO_ACCESS_KEY,
    secretKey: MINIO_SECRET_KEY
});

// Funkcija za transformaciju internog URL-a u javno dostupan URL
const transformUrl = (internalUrl) => {
    if (!internalUrl) return internalUrl;

    // Zamjeni interno ime kontejnera s javnom domenom
    return internalUrl.replace(`http://${MINIO_ENDPOINT}:${MINIO_PORT}`, PUBLIC_MINIO_URL);
};

// Funkcija za generiranje privremenog URL-a
const getPresignedUrl = async (objectName, expiry = 3600) => {
    try {
        const internalUrl = await minioClient.presignedGetObject(BUCKET_NAME, objectName, expiry);
        return transformUrl(internalUrl); // Transformiraj URL prije vraćanja
    } catch (error) {
        console.error('Greška pri generiranju presigned URL-a:', error);
        throw error;
    }
};

// Dohvaćanje liste svih SKU foldera
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

// Dohvaćanje slika za određeni SKU
const getSkuImages = async (sku) => {
    try {
        // Dohvati sve objekte iz SKU foldera
        const objects = await listAllObjects(BUCKET_NAME, `${sku}/`);

        // Grupiraj po podfolderu (large, medium, thumb)
        const result = {
            thumb: [],
            medium: [],
            large: [],
            minithumb: []
        };

        // Za svaki objekt, generiraj presigned URL
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

// Pomoćna funkcija za izlistavanje svih objekata
const listAllObjects = (bucketName, prefix = '') => {
    return new Promise((resolve, reject) => {
        const objects = [];
        const stream = minioClient.listObjects(bucketName, prefix, true);

        stream.on('data', (obj) => objects.push(obj));
        stream.on('error', reject);
        stream.on('end', () => resolve(objects));
    });
};

module.exports = {
    minioClient,
    getPresignedUrl,
    listSkuFolders,
    getSkuImages,
    transformUrl
};