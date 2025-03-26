const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'bebakids';

// Middleware za provjeru autentifikacije
const authenticate = async (req, res, next) => {
    try {
        // Provjeri postoji li token
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ message: 'Pristup odbijen. Token nije proslijeđen' });
        }

        // Verificiraj token
        const decoded = jwt.verify(token, JWT_SECRET);

        // Pronađi korisnika
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({ message: 'Korisnik nije pronađen' });
        }

        // Postavi korisnika na request objekt
        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: 'Neispravan token' });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token je istekao' });
        }

        console.error('Greška autentifikacije:', error);
        res.status(500).json({ message: 'Interna greška servera' });
    }
};

// Middleware za provjeru admin prava
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: 'Pristup zabranjen. Potrebna su admin prava' });
    }
};

module.exports = {
    authenticate,
    isAdmin
};