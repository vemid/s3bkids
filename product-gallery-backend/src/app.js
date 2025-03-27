require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/database');

// Uhvati nekontrolirane iznimke
process.on('uncaughtException', (err) => {
    console.error('NEKONTROLIRANA IZNIMKA:', err);
    console.error(err.stack);
    // Ne zaustavljamo proces
});

// Uhvati odbačena Promise-a
process.on('unhandledRejection', (reason, promise) => {
    console.error('NEOBRAĐENO ODBIJANJE:', reason);
    // Ne zaustavljamo proces
});

// Inicijalizacija Express aplikacije
const app = express();
const PORT = process.env.PORT || 3500;

// CORS konfiguracija - dozvolite sve izvore u razvoju
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser middleware - povećani limit za veće zahtjeve
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// Povezivanje s MongoDB
connectDB();

// Osnovni route za provjeru
app.get('/', (req, res) => {
    res.json({ message: 'Product Gallery API', status: 'active' });
});

// Rute
try {
    app.use('/api/auth', require('./routes/authRoutes'));
    app.use('/api/products', require('./routes/productRoutes'));
    app.use('/api/seasons', require('./routes/seasonRoutes'));
} catch (error) {
    console.error('Greška pri učitavanju ruta:', error);
}

// Middleware za rukovanje 404 greškama
app.use((req, res, next) => {
    res.status(404).json({ message: `Route ${req.originalUrl} nije pronađena` });
});

// Middleware za rukovanje greškama
app.use((err, req, res, next) => {
    console.error('Middleware za greške:', err);
    res.status(500).json({
        message: 'Interna greška servera',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Pokretanje servera
app.listen(PORT, () => {
    console.log(`Server pokrenut na portu ${PORT}`);
});