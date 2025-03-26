const express = require('express');
const router = express.Router();
const { login, register, getCurrentUser } = require('../controllers/authController');
const { authenticate, isAdmin } = require('../middleware/authMiddleware');

// Rute za autentifikaciju
router.post('/login', login);                            // Prijava korisnika
router.post('/register', authenticate, isAdmin, register); // Registracija novog korisnika (samo admin)
router.get('/me', authenticate, getCurrentUser);          // Dohvaćanje trenutnog korisnika

module.exports = router;