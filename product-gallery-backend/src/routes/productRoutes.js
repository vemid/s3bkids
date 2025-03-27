const express = require('express');
const router = express.Router();
const {
    getAllProducts,
    getProductBySku,
    getProductsBySeason,
    getProductsGroupedBySeasons,
    syncProducts,
    downloadProductImages,
    searchProducts,
    downloadMultipleProducts
} = require('../controllers/productController');
const { authenticate, isAdmin } = require('../middleware/authMiddleware');

// Rute za proizvode
router.get('/search', authenticate, searchProducts);               // Pretraga proizvoda - NOVO
router.get('/grouped-by-seasons', authenticate, getProductsGroupedBySeasons); // Proizvodi po sezonama
router.get('/season/:seasonId', authenticate, getProductsBySeason); // Proizvodi za sezonu
router.post('/download-multiple', authenticate, downloadMultipleProducts); // Preuzimanje više proizvoda - NOVO
router.get('/:sku/download', authenticate, downloadProductImages); // Preuzimanje ZIP-a za jedan proizvod
router.get('/:sku', authenticate, getProductBySku);               // Dohvaćanje proizvoda po SKU
router.get('/', authenticate, getAllProducts);                    // Dohvaćanje svih proizvoda
router.post('/sync', authenticate, isAdmin, syncProducts);        // Sinkronizacija proizvoda (samo admin)

module.exports = router;