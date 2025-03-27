const Product = require('../models/Product');
const { getSkuImages, listSkuFolders, internalClient } = require('../services/minioService');
const { mapSkuToSeason, groupProductsBySeasons } = require('../services/seasonService');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const axios = require('axios');
const stream = require('stream');
const { promisify } = require('util');

// Dohvaćanje svih proizvoda
const getAllProducts = async (req, res) => {
    try {
        // Dohvati sve proizvode iz baze
        const products = await Product.find().sort({ sku: 1 });
        res.json(products);
    } catch (error) {
        console.error('Greška pri dohvaćanju proizvoda:', error);
        res.status(500).json({ message: error.message });
    }
};

// Dohvaćanje proizvoda po SKU
const getProductBySku = async (req, res) => {
    try {
        const { sku } = req.params;

        // Dohvati proizvod iz baze
        let product = await Product.findOne({ sku });

        // Ako proizvod ne postoji u bazi, pokušaj ga dohvatiti iz MinIO
        if (!product) {
            // Dohvati slike za SKU iz MinIO
            const images = await getSkuImages(sku);

            // Provjeri ima li proizvod slika
            if (Object.values(images).some(arr => arr.length > 0)) {
                // Mapiraj SKU na sezonu
                const seasonId = await mapSkuToSeason(sku);

                // Pripremi thumbnail URL
                let thumbnailUrl = '';
                if (images.thumb && images.thumb.length > 0) {
                    thumbnailUrl = images.thumb[0].url;
                } else if (images.minithumb && images.minithumb.length > 0) {
                    thumbnailUrl = images.minithumb[0].url;
                }

                // Kreiraj novi proizvod u bazi
                product = new Product({
                    sku,
                    seasonId,
                    thumbnailUrl,
                    imageCount: {
                        thumb: images.thumb ? images.thumb.length : 0,
                        medium: images.medium ? images.medium.length : 0,
                        large: images.large ? images.large.length : 0
                    }
                });

                await product.save();
            } else {
                return res.status(404).json({ message: 'Proizvod nije pronađen' });
            }
        }

        // Dohvati slike za proizvod
        const images = await getSkuImages(sku);

        // Vrati proizvod s slikama
        res.json({
            product,
            images
        });
    } catch (error) {
        console.error(`Greška pri dohvaćanju proizvoda ${req.params.sku}:`, error);
        res.status(500).json({ message: error.message });
    }
};

// Dohvaćanje proizvoda po sezoni
const getProductsBySeason = async (req, res) => {
    try {
        const { seasonId } = req.params;

        // Dohvati proizvode za sezonu
        const products = await Product.find({ seasonId }).sort({ sku: 1 });
        res.json(products);
    } catch (error) {
        console.error(`Greška pri dohvaćanju proizvoda za sezonu ${req.params.seasonId}:`, error);
        res.status(500).json({ message: error.message });
    }
};

// Dohvaćanje proizvoda grupirano po sezonama
const getProductsGroupedBySeasons = async (req, res) => {
    try {
        const result = await groupProductsBySeasons();
        res.json(result);
    } catch (error) {
        console.error('Greška pri grupiranju proizvoda po sezonama:', error);
        res.status(500).json({ message: error.message });
    }
};

// Sinkronizacija proizvoda iz MinIO
const syncProducts = async (req, res) => {
    try {
        // Dohvati sve SKU-ove iz MinIO
        const skuFolders = await listSkuFolders();
        console.log(`Pronađeno ${skuFolders.length} SKU foldera`);

        let createdCount = 0;
        let updatedCount = 0;

        // Za svaki SKU, dohvati slike i spremi proizvod u bazu
        for (const sku of skuFolders) {
            // Provjeri postoji li proizvod u bazi
            let product = await Product.findOne({ sku });

            // Dohvati slike za SKU
            const images = await getSkuImages(sku);

            // Izračunaj broj slika po tipu
            const imageCount = {
                thumb: images.thumb ? images.thumb.length : 0,
                medium: images.medium ? images.medium.length : 0,
                large: images.large ? images.large.length : 0
            };

            // Pripremi thumbnail URL
            let thumbnailUrl = '';
            if (images.thumb && images.thumb.length > 0) {
                thumbnailUrl = images.thumb[0].url;
            } else if (images.minithumb && images.minithumb.length > 0) {
                thumbnailUrl = images.minithumb[0].url;
            }

            if (product) {
                // Ažuriraj postojeći proizvod
                product.thumbnailUrl = thumbnailUrl;
                product.imageCount = imageCount;
                product.lastUpdated = new Date();
                await product.save();
                updatedCount++;
            } else {
                // Mapiraj SKU na sezonu
                const seasonId = await mapSkuToSeason(sku);

                // Kreiraj novi proizvod
                product = new Product({
                    sku,
                    seasonId,
                    thumbnailUrl,
                    imageCount
                });

                await product.save();
                createdCount++;
            }
        }

        res.json({
            message: 'Sinkronizacija proizvoda završena',
            total: skuFolders.length,
            created: createdCount,
            updated: updatedCount
        });
    } catch (error) {
        console.error('Greška pri sinkronizaciji proizvoda:', error);
        res.status(500).json({ message: error.message });
    }
};

// Preuzimanje svih slika kao ZIP arhive - poboljšana verzija
const downloadProductImages = async (req, res) => {
    try {
        const { sku } = req.params;
        console.log(`Kreiranje ZIP arhive za SKU: ${sku}`);

        // Dohvati slike za SKU
        const images = await getSkuImages(sku);
        console.log(`Dohvaćene slike: ${JSON.stringify(images, null, 2)}`);

        // Provjeri ima li slika
        const hasImages = Object.values(images).some(arr => arr.length > 0);
        if (!hasImages) {
            return res.status(404).json({ message: 'Proizvod nema slika' });
        }

        // Kreiraj temp folder ako ne postoji
        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Ime ZIP fajla
        const zipFileName = `${sku}_images.zip`;
        const zipFilePath = path.join(tempDir, zipFileName);

        // Kreiraj ZIP fajl
        const output = fs.createWriteStream(zipFilePath);
        const archive = archiver('zip', {
            zlib: { level: 9 } // Najviša razina kompresije
        });

        // Rukovanje završetkom stvaranja ZIP-a
        output.on('close', function() {
            console.log(`ZIP arhiva kreirana: ${zipFilePath} (${archive.pointer()} bajtova)`);

            // Postavi headers za preuzimanje
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename=${zipFileName}`);

            // Šalji ZIP fajl kao odgovor
            const fileStream = fs.createReadStream(zipFilePath);
            fileStream.pipe(res);

            // Obriši ZIP nakon slanja
            fileStream.on('end', () => {
                fs.unlinkSync(zipFilePath);
                console.log(`ZIP arhiva obrisana: ${zipFilePath}`);
            });
        });

        archive.on('error', function(err) {
            console.error('Greška pri kreiranju ZIP arhive:', err);
            res.status(500).json({ message: 'Greška pri kreiranju ZIP arhive' });
        });

        // Poveži archive sa output streamom
        archive.pipe(output);

        // Preuzimanje i dodavanje slika u ZIP
        const imageTypes = ['large', 'medium', 'thumb'];

        // Alternativni pristup: Direktno dohvaćanje objekata iz MinIO umjesto korištenja URL-ova
        // Ovo izbjegava probleme s presigned URL-ovima
        for (const type of imageTypes) {
            if (images[type] && images[type].length > 0) {
                // Dodaj direktorij u ZIP
                archive.append(null, { name: `${type}/` });

                // Za svaku sliku
                for (const image of images[type]) {
                    try {
                        console.log(`Preuzimanje slike ${image.name} iz foldera ${type}...`);

                        // Putanja objekta u MinIO
                        const objectName = `${sku}/${type}/${image.name}`;

                        // Privremena putanja
                        const tempFilePath = path.join(tempDir, `temp_${type}_${image.name}`);

                        // Dohvati objekt izravno iz MinIO
                        await internalClient.fGetObject(BUCKET_NAME, objectName, tempFilePath);

                        // Dodaj u ZIP
                        archive.file(tempFilePath, { name: `${type}/${image.name}` });

                        // Obriši temp fajl nakon dodavanja u ZIP
                        fs.unlinkSync(tempFilePath);

                        console.log(`Slika ${image.name} dodana u ZIP`);
                    } catch (err) {
                        console.error(`Greška pri dodavanju slike ${image.name}:`, err);
                    }
                }
            }
        }

        // Završi ZIP proces
        archive.finalize();

    } catch (error) {
        console.error(`Greška pri preuzimanju slika za SKU ${req.params.sku}:`, error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getAllProducts,
    getProductBySku,
    getProductsBySeason,
    getProductsGroupedBySeasons,
    syncProducts,
    downloadProductImages
};