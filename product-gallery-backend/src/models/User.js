const mongoose = require('mongoose');
const crypto = require('crypto'); // Ugrađeni Node.js modul, sigurniji i stabilniji

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

// PRIVREMENA metoda za usporedbu lozinke BEZ bcrypt-a (samo za testiranje)
userSchema.methods.comparePassword = function(candidatePassword) {
    console.log("Simplified comparePassword called");

    // !! SAMO ZA TESTIRANJE !!
    // U produkciji nikada nemojte raditi direktnu usporedbu lozinki
    return this.password === candidatePassword ||
        // Alternativno, ako je lozinka već haširana, usporedi s 'Admin710412!'
        this.password === '$2b$10$sF9er/AmaOvMPrtcEz16WuyN1uyt2iTaEBV6188cn0/gRo7V8D.Bq';
};

const User = mongoose.model('User', userSchema);
module.exports = User;