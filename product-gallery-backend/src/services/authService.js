const jwt = require('jsonwebtoken');
const User = require('../models/User');

// JWT Secret iz environment varijabli
const JWT_SECRET = process.env.JWT_SECRET || 'your-very-secure-jwt-secret-key';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';

// Generiranje JWT tokena
const generateToken = (userId) => {
    return jwt.sign({ id: userId }, JWT_SECRET, {
        expiresIn: JWT_EXPIRY
    });
};

// Prijava korisnika - sa sigurnijim uspoređivanjem lozinki
const loginUser = async (username, password) => {
    console.log("loginUser service called with username:", username);

    try {
        // Pronađi korisnika po korisničkom imenu
        const user = await User.findOne({ username });
        console.log("User found:", !!user);

        if (!user) {
            throw new Error('Korisnik nije pronađen');
        }

        // Provjeri lozinku - koristimo try-catch da uhvatimo moguće bcrypt greške
        console.log("Comparing password");

        let isMatch = false;
        try {
            isMatch = await user.comparePassword(password);
        } catch (passwordError) {
            console.error("Password comparison error:", passwordError);
            throw new Error('Greška pri provjeri lozinke');
        }

        console.log("Password match result:", isMatch);

        if (!isMatch) {
            throw new Error('Neispravna lozinka');
        }

        // Ažuriraj lastLogin
        console.log("Updating lastLogin");
        user.lastLogin = new Date();
        await user.save();

        // Generiraj token
        console.log("Generating token");
        const token = generateToken(user._id);

        console.log("Returning user data and token");
        return {
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                allowedSeasons: user.allowedSeasons
            }
        };
    } catch (error) {
        console.error("Login service error:", error);
        throw error;
    }
};

// Registracija novog korisnika (samo za admina)
const registerUser = async (userData) => {
    try {
        // Provjeri postoji li već korisnik s tim korisničkim imenom ili emailom
        const existingUser = await User.findOne({
            $or: [
                { username: userData.username },
                { email: userData.email }
            ]
        });

        if (existingUser) {
            throw new Error('Korisničko ime ili email već postoji');
        }

        // Kreiraj novog korisnika
        const user = new User(userData);
        await user.save();

        return {
            id: user._id,
            username: user.username,
            email: user.email,
            role: user.role
        };
    } catch (error) {
        throw error;
    }
};

module.exports = {
    generateToken,
    loginUser,
    registerUser
};