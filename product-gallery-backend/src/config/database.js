const mongoose = require('mongoose');

// MongoDB konfiguracija
const MONGO_USER = process.env.MONGO_USER || 'admin';
const MONGO_PASSWORD = process.env.MONGO_PASSWORD || 'Admin710412!';
const MONGO_HOST = process.env.MONGO_HOST || 'mongodb';
const MONGO_PORT = process.env.MONGO_PORT || '27017';
const MONGO_DB = process.env.MONGO_DB_NAME || 'productgallery';

const MONGO_URI = `mongodb://${MONGO_USER}:${MONGO_PASSWORD}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}?authSource=admin`;

// Funkcija za povezivanje s bazom
const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('MongoDB povezivanje uspješno');
    } catch (error) {
        console.error('Greška pri povezivanju s MongoDB:', error.message);
        process.exit(1);
    }
};

module.exports = connectDB;