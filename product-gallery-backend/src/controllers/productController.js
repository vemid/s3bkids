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
        res.status(500).json({ message: 'Greška pri dohvaćanju proizvoda' });
    }
};

// Dohvaćanje proizvoda po SKU - Jednostavnija verzija
const getProductBySku = async (req, res) => {
    try {
        const { sku } = req.params;

        // Dohvati proizvod iz baze
        let product = await Product.findOne({ sku });

        // Ako proizvod ne postoji, vrati grešku
        if (!product) {
            return res.status(404).json({ message: 'Proizvod nije pronađen' });
        }

        res.json({
            product,
            images: { thumb: [], medium: [], large: [] } // Privremeno prazne slike
        });
    } catch (error) {
        console.error(`Greška pri dohvaćanju proizvoda ${req.params.sku}:`, error);
        res.status(500).json({ message: 'Greška pri dohvaćanju proizvoda' });
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
        res.status(500).json({ message: 'Greška pri dohvaćanju proizvoda za sezonu' });
    }
};

// Dohvaćanje proizvoda grupirano po sezonama
const getProductsGroupedBySeasons = async (req, res) => {
    try {
        const result = await groupProductsBySeasons();
        res.json(result);
    } catch (error) {
        console.error('Greška pri grupiranju proizvoda po sezonama:', error);
        res.status(500).json({ message: 'Greška pri grupiranju proizvoda po sezonama' });
    }
};

// Sinkronizacija proizvoda iz MinIO
const syncProducts = async (req, res) => {
    try {
        res.json({
            message: 'Sinkronizacija u toku, bit će završena uskoro.',
            total: 0,
            created: 0,
            updated: 0
        });

        // Pokreni sinkronizaciju u pozadini
        setTimeout(async () => {
            try {
                console.log('Započinjem sinkronizaciju proizvoda...');

                // Ostatak funkcije ćemo implementirati kasnije
            } catch (error) {
                console.error('Pozadinska greška pri sinkronizaciji proizvoda:', error);
            }
        }, 100);
    } catch (error) {
        console.error('Greška pri sinkronizaciji proizvoda:', error);
        res.status(500).json({ message: 'Greška pri sinkronizaciji proizvoda' });
    }
};

module.exports = {
    getAllProducts,
    getProductBySku,
    getProductsBySeason,
    getProductsGroupedBySeasons,
    syncProducts
};