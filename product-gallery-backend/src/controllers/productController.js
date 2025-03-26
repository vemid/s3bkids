const Product = require('../models/Product');
const { getSkuImages, listSkuFolders } = require('../services/minioService');
const { mapSkuToSeason, groupProductsBySeasons } = require('../services/seasonService');

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

                // Pripremi thumbnail URL (prva slika iz thumb foldera)
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

module.exports = {
    getAllProducts,
    getProductBySku,
    getProductsBySeason,
    getProductsGroupedBySeasons,
    syncProducts
};