const express = require('express');
const router = express.Router();
const {
    getAllProducts,
    getProductBySku,
    getProductsBySeason,
    getProductsGroupedBySeasons,
    syncProducts
} = require('../controllers/productController');
const { authenticate, isAdmin } = require('../middleware/authMiddleware');

// Rute za proizvode
router.get('/', authenticate, getAllProducts);                        // Dohvaćanje svih proizvoda
router.get('/grouped-by-seasons', authenticate, getProductsGroupedBySeasons); // Dohvaćanje proizvoda po sezonama
router.get('/season/:seasonId', authenticate, getProductsBySeason);    // Dohvaćanje proizvoda za određenu sezonu
router.get('/:sku', authenticate, getProductBySku);                   // Dohvaćanje proizvoda po SKU
router.post('/sync', authenticate, isAdmin, syncProducts);            // Sinkronizacija proizvoda (samo admin)

module.exports = router;