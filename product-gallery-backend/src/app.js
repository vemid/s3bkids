require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/database');

// Uhvati nekontrolirane iznimke
process.on('uncaughtException', (err) => {
    console.error('NEKONTROLIRANA IZNIMKA:', err);
    console.error(err.stack);
    // Nemojmo odmah zaustaviti proces
    // process.exit(1);
});

// Uhvati odbačena Promise-a
process.on('unhandledRejection', (reason, promise) => {
    console.error('NEOBRAĐENO ODBIJANJE:', reason);
    // Nemojmo odmah zaustaviti proces
    // process.exit(1);
});

// Inicijalizacija Express aplikacije
const app = express();
const PORT = process.env.PORT || 3500;

// Povezivanje s MongoDB
connectDB();

// Middleware
app.use(cors({
    origin: '*',  // U razvoju dozvolite sve izvore
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(morgan('dev'));

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

// Middleware za rukovanje greškama
app.use((err, req, res, next) => {
    console.error('Middleware za greške:', err.stack);
    res.status(500).json({
        message: 'Interna greška servera',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Pokretanje servera
app.listen(PORT, () => {
    console.log(`Server pokrenut na portu ${PORT}`);
});