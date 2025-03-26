const express = require('express');
const router = express.Router();
const {
    getAllSeasons,
    getSeasonById,
    createSeason,
    updateSeason,
    deleteSeason
} = require('../controllers/seasonController');
const { authenticate, isAdmin } = require('../middleware/authMiddleware');

// Rute za sezone
router.get('/', authenticate, getAllSeasons);               // Dohvaćanje svih sezona
router.get('/:id', authenticate, getSeasonById);           // Dohvaćanje sezone po ID-u
router.post('/', authenticate, isAdmin, createSeason);      // Kreiranje nove sezone (samo admin)
router.put('/:id', authenticate, isAdmin, updateSeason);    // Ažuriranje sezone (samo admin)
router.delete('/:id', authenticate, isAdmin, deleteSeason); // Brisanje sezone (samo admin)

module.exports = router;