require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const connectDB = require('./config/database');

// Inicijalizacija Express aplikacije
const app = express();
const PORT = process.env.PORT || 3500;

// Povezivanje s MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Osnovni route za provjeru
app.get('/', (req, res) => {
    res.json({ message: 'Product Gallery API', status: 'active' });
});

// Rute
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/seasons', require('./routes/seasonRoutes'));

// Middleware za rukovanje greškama
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        message: 'Interna greška servera',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Pokretanje servera
app.listen(PORT, () => {
    console.log(`Server pokrenut na portu ${PORT}`);
});