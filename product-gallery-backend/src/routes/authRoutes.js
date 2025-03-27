const express = require('express');
const router = express.Router();
const { login, register, getCurrentUser } = require('../controllers/authController');
const { authenticate, isAdmin } = require('../middleware/authMiddleware');

// Rute za autentifikaciju
router.post('/login', (req, res) => {
    console.log("Auth route /login hit");
    return login(req, res);
});

router.post('/register', authenticate, isAdmin, register);
router.get('/me', authenticate, getCurrentUser);

module.exports = router;