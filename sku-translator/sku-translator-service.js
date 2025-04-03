const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const app = express();
app.use(express.json());

// Konfiguracija iz env varijabli
const PORT = process.env.PORT || 3002;
const DB_HOST = process.env.INFORMIX_HOST || 'informix-host';
const DB_PORT = process.env.INFORMIX_PORT || 9088;
const DB_NAME = process.env.INFORMIX_DB || 'database';
const DB_USER = process.env.INFORMIX_USER || 'informix';
const DB_PASSWORD = process.env.INFORMIX_PASSWORD || 'password';
const DB_SERVER = process.env.INFORMIX_SERVER || 'ol_informix1170';

// Konfiguracija za Informix konekciju
const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
    host: DB_HOST,
    port: DB_PORT,
    dialect: 'informix',
    dialectOptions: {
        server: DB_SERVER
    },
    define: {
        freezeTableName: true
    },
    logging: console.log
});

// Funkcija za proveru konekcije
async function testConnection() {
    try {
        await sequelize.authenticate();
        console.log('Uspešna konekcija sa Informix bazom.');
        return true;
    } catch (error) {
        console.error('Neuspešna konekcija sa bazom:', error);
        return false;
    }
}

// Funkcija za dobavljanje SKU na osnovu kataloškog SKU
async function getSkuFromCatalogSku(catalogSku) {
    try {
        // Ovde treba prilagoditi pravi SQL upit prema vašoj šemi baze
        const [results] = await sequelize.query(`
      SELECT artikal_sifra AS sku
      FROM artikli
      WHERE kataloski_broj = '${catalogSku}'
      LIMIT 1
    `);

        if (results && results.length > 0) {
            return results[0].sku;
        } else {
            console.log(`Nije pronađen SKU za kataloški broj: ${catalogSku}`);
            return null;
        }
    } catch (error) {
        console.error(`Greška pri dobavljanju SKU za ${catalogSku}:`, error);
        return null;
    }
}

// Alternativna implementacija bez baze (za testiranje)
const mockSkuMapping = {
    // Primeri mapiranja između kataloških SKU i pravih SKU
    'KSKUA12345678': 'RSKUA12345678',
    'KSKUB87654321': 'RSKUB87654321'
};

function getMockSku(catalogSku) {
    // Ako je mapiranje poznato, vrati pravi SKU, inače vrati isti kod
    return mockSkuMapping[catalogSku] || catalogSku;
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('SKU Translator servis je aktivan');
});

// Endpoint za prevođenje pojedinačnog kataloškog SKU
app.get('/translate/:catalogSku', async (req, res) => {
    const { catalogSku } = req.params;

    if (!catalogSku) {
        return res.status(400).json({ error: 'Nedostaje kataloški SKU' });
    }

    try {
        // Ako je konekcija sa bazom moguća, koristi bazu, inače mock podatke
        const isDbConnected = await testConnection();

        let sku;
        if (isDbConnected) {
            sku = await getSkuFromCatalogSku(catalogSku);
        } else {
            console.log('Korišćenje mock mapiranja za testiranje...');
            sku = getMockSku(catalogSku);
        }

        if (sku) {
            return res.json({ catalogSku, sku });
        } else {
            return res.status(404).json({
                error: 'SKU nije pronađen',
                fallback: catalogSku // Vraćamo originalni kod kao fallback
            });
        }
    } catch (error) {
        console.error('Greška pri prevođenju SKU:', error);
        return res.status(500).json({
            error: 'Interna greška servera',
            fallback: catalogSku // Vraćamo originalni kod kao fallback
        });
    }
});

// Batch prevođenje za više kataloških SKU odjednom
app.post('/translate-batch', async (req, res) => {
    const { catalogSkus } = req.body;

    if (!catalogSkus || !Array.isArray(catalogSkus) || catalogSkus.length === 0) {
        return res.status(400).json({ error: 'Nedostaje niz kataloških SKU' });
    }

    try {
        const isDbConnected = await testConnection();
        const results = {};

        for (const catalogSku of catalogSkus) {
            let sku;
            if (isDbConnected) {
                sku = await getSkuFromCatalogSku(catalogSku);
            } else {
                sku = getMockSku(catalogSku);
            }
            results[catalogSku] = sku || catalogSku; // Fallback na originalni kod
        }

        return res.json({ translations: results });
    } catch (error) {
        console.error('Greška pri batch prevođenju SKU:', error);
        return res.status(500).json({ error: 'Interna greška servera' });
    }
});

// Cache endpoint - za osvežavanje cache-a mapiranja
app.post('/refresh-cache', async (req, res) => {
    try {
        // Ovde biste implementirali logiku za osvežavanje cache-a
        // mapiranja između kataloških i pravih SKU
        console.log('Osvežavanje cache-a mapiranja SKU...');

        // Simulacija uspeha
        return res.json({ success: true, message: 'Cache osvežen' });
    } catch (error) {
        console.error('Greška pri osvežavanju cache-a:', error);
        return res.status(500).json({ error: 'Interna greška servera' });
    }
});

// Pokretanje servera
app.listen(PORT, () => {
    console.log(`SKU Translator servis pokrenut na portu ${PORT}`);
    testConnection(); // Odmah testiraj konekciju
});