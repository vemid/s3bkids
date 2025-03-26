const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware za provjeru JWT tokena
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Pristup odbijen. Token nije pronađen.' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Provjeri je li korisnik još aktivan
        const user = await User.findById(decoded.userId);

        if (!user || !user.active) {
            return res.status(401).json({ error: 'Pristup odbijen. Korisnički račun nije aktivan.' });
        }

        req.user = {
            userId: decoded.userId,
            username: decoded.username,
            role: decoded.role
        };

        next();
    } catch (error) {
        console.error('Greška pri autentifikaciji:', error);
        res.status(403).json({ error: 'Pristup odbijen. Nevažeći token.' });
    }
};

// Middleware za provjeru admin privilegija
const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    }

    return res.status(403).json({ error: 'Pristup odbijen. Potrebne su admin privilegije.' });
};

module.exports = {
    authenticateToken,
    requireAdmin
};