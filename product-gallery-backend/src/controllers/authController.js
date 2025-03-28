const { loginUser, registerUser } = require('../services/authService');

// Kontroler za prijavu korisnika
const login = async (req, res) => {
    try {
        console.log("Login attempt received:", req.body);
        const { username, password } = req.body;

        if (!username || !password) {
            console.log("Missing username or password");
            return res.status(400).json({ message: 'Korisničko ime i lozinka su obavezni' });
        }

        console.log("Attempting login with:", { username });

        try {
            const result = await loginUser(username, password);
            console.log("Login successful");
            return res.json(result);
        } catch (loginError) {
            console.error("Login service error:", loginError.message);
            return res.status(401).json({ message: loginError.message });
        }
    } catch (error) {
        console.error("Unhandled error in login controller:", error);
        return res.status(500).json({ message: 'Interna greška servera' });
    }
};

// Kontroler za registraciju korisnika (samo za admina)
const register = async (req, res) => {
    try {
        const { username, password, email, role, allowedSeasons } = req.body;

        if (!username || !password || !email) {
            return res.status(400).json({ message: 'Korisničko ime, lozinka i email su obavezni' });
        }

        const userData = {
            username,
            password,
            email,
            role: role || 'viewer',
            allowedSeasons: allowedSeasons || []
        };

        const user = await registerUser(userData);
        res.status(201).json(user);
    } catch (error) {
        console.error("Register error:", error);
        res.status(400).json({ message: error.message });
    }
};

// Kontroler za dohvaćanje trenutnog korisnika
const getCurrentUser = async (req, res) => {
    try {
        // req.user je postavljen u authenticate middleware-u
        const user = {
            id: req.user._id,
            username: req.user.username,
            email: req.user.email,
            role: req.user.role,
            allowedSeasons: req.user.allowedSeasons,
            lastLogin: req.user.lastLogin
        };

        res.json(user);
    } catch (error) {
        console.error("Get current user error:", error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    login,
    register,
    getCurrentUser
};