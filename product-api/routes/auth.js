const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Route za prijavu korisnika
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Provjeri jesu li svi potrebni podaci prisutni
        if (!username || !password) {
            return res.status(400).json({ error: 'Korisničko ime i lozinka su obavezni' });
        }

        // Pronađi korisnika po korisničkom imenu
        const user = await User.findOne({ username });

        // Provjeri je li korisnik pronađen
        if (!user) {
            return res.status(401).json({ error: 'Pogrešno korisničko ime ili lozinka' });
        }

        // Provjeri je li korisnik aktivan
        if (!user.active) {
            return res.status(403).json({ error: 'Korisnički račun je deaktiviran. Kontaktirajte administratora.' });
        }

        // Usporedi lozinku
        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            return res.status(401).json({ error: 'Pogrešno korisničko ime ili lozinka' });
        }

        // Ažuriraj vrijeme zadnje prijave
        user.lastLogin = new Date();
        await user.save();

        // Kreiraj JWT token
        const token = jwt.sign(
            { userId: user._id, username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        // Vrati token i osnovne informacije o korisniku
        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Greška pri prijavi:', error);
        res.status(500).json({ error: 'Greška pri prijavi' });
    }
});

// Route za provjeru trenutnog korisnika
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');

        if (!user) {
            return res.status(404).json({ error: 'Korisnik nije pronađen' });
        }

        res.json(user);
    } catch (error) {
        console.error('Greška pri dohvaćanju korisnika:', error);
        res.status(500).json({ error: 'Greška pri dohvaćanju korisnika' });
    }
});

// Admin ruta za kreiranje novog korisnika
router.post('/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { username, email, password, role } = req.body;

        // Provjeri jesu li svi potrebni podaci prisutni
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Korisničko ime, email i lozinka su obavezni' });
        }

        // Provjeri je li korisničko ime ili email već zauzet
        const existingUser = await User.findOne({
            $or: [{ username }, { email }]
        });

        if (existingUser) {
            return res.status(400).json({ error: 'Korisničko ime ili email je već zauzet' });
        }

        // Kreiraj novog korisnika
        const newUser = new User({
            username,
            email,
            password,
            role: role || 'user'
        });

        await newUser.save();

        res.status(201).json({
            message: 'Korisnik uspješno kreiran',
            user: {
                id: newUser._id,
                username: newUser.username,
                email: newUser.email,
                role: newUser.role
            }
        });

    } catch (error) {
        console.error('Greška pri kreiranju korisnika:', error);
        res.status(500).json({ error: 'Greška pri kreiranju korisnika' });
    }
});

// Admin ruta za dohvaćanje svih korisnika
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        console.error('Greška pri dohvaćanju korisnika:', error);
        res.status(500).json({ error: 'Greška pri dohvaćanju korisnika' });
    }
});

// Admin ruta za ažuriranje korisnika
router.put('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { username, email, active, role } = req.body;

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ error: 'Korisnik nije pronađen' });
        }

        // Ažuriraj podatke ako su prisutni u zahtjevu
        if (username) user.username = username;
        if (email) user.email = email;
        if (active !== undefined) user.active = active;
        if (role) user.role = role;

        await user.save();

        res.json({
            message: 'Korisnik uspješno ažuriran',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                active: user.active
            }
        });

    } catch (error) {
        console.error('Greška pri ažuriranju korisnika:', error);
        res.status(500).json({ error: 'Greška pri ažuriranju korisnika' });
    }
});

// Ruta za promjenu lozinke
router.post('/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Trenutna i nova lozinka su obavezne' });
        }

        const user = await User.findById(req.user.userId);

        if (!user) {
            return res.status(404).json({ error: 'Korisnik nije pronađen' });
        }

        // Provjeri trenutnu lozinku
        const isMatch = await user.comparePassword(currentPassword);

        if (!isMatch) {
            return res.status(400).json({ error: 'Trenutna lozinka nije ispravna' });
        }

        // Postavi novu lozinku
        user.password = newPassword;
        await user.save();

        res.json({ message: 'Lozinka uspješno promijenjena' });

    } catch (error) {
        console.error('Greška pri promjeni lozinke:', error);
        res.status(500).json({ error: 'Greška pri promjeni lozinke' });
    }
});

module.exports = router;