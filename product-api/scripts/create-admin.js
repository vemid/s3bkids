require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

// Admin podaci
const admin = {
    username: 'admin',
    email: 'admin@example.com',
    password: 'admin123',
    role: 'admin'
};

// Povezivanje s MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(async () => {
        console.log('Povezan s MongoDB-om');

        try {
            // Provjeri postoji li već admin korisnik
            const existingAdmin = await User.findOne({ username: admin.username });

            if (existingAdmin) {
                console.log('Admin korisnik već postoji.');
                process.exit(0);
            }

            // Kreiraj admin korisnika
            const newAdmin = new User(admin);
            await newAdmin.save();

            console.log('Admin korisnik uspješno kreiran:');
            console.log(`Username: ${admin.username}`);
            console.log(`Password: ${admin.password}`);
            console.log(`Role: ${admin.role}`);

            process.exit(0);
        } catch (error) {
            console.error('Greška pri kreiranju admin korisnika:', error);
            process.exit(1);
        }
    })
    .catch(err => {
        console.error('Greška pri povezivanju s MongoDB-om:', err);
        process.exit(1);
    });