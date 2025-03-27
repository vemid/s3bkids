const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    role: {
        type: String,
        enum: ['admin', 'editor', 'viewer'],
        default: 'viewer'
    },
    allowedSeasons: [{
        type: String
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date,
        default: null
    }
});

// Middleware za hashiranje lozinke prije spremanja
userSchema.pre('save', async function(next) {
    try {
        // Samo ako je lozinka modificirana (ili nova)
        if (!this.isModified('password')) return next();

        // Generiramo salt i hash
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        console.error("Password hash error:", error);
        next(error);
    }
});

// Sigurnija metoda za usporedbu lozinke
userSchema.methods.comparePassword = async function(candidatePassword) {
    console.log("comparePassword called");

    try {
        // Koristimo sinkronu verziju za usporedbu - asinkrona može uzrokovati probleme
        return bcrypt.compareSync(candidatePassword, this.password);
    } catch (error) {
        console.error("Password comparison error:", error);
        return false; // Sigurnije je vratiti false nego baciti grešku
    }
};

const User = mongoose.model('User', userSchema);
module.exports = User;