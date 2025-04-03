const express = require('express');
const app = express();
app.use(express.json());

// Učitaj JDBC modul samo ako je potrebno
let jdbc = null;
try {
    jdbc = require('jdbc');
    console.log('JDBC modul uspešno učitan.');
} catch (error) {
    console.warn('JDBC modul nije dostupan:', error.message);
    console.warn('Servis će raditi u mock režimu.');
}

// Učitaj node-jt400 modul za IBM i baze ako je potrebno
let jt400 = null;
try {
    jt400 = require('node-jt400');
    console.log('JT400 modul uspešno učitan.');
} catch (error) {
    console.warn('JT400 modul nije dostupan:', error.message);
}

// Konfiguracija iz env varijabli
const PORT = process.env.PORT || 3002;
const DB_HOST = process.env.INFORMIX_HOST || 'informix-host';
const DB_PORT = process.env.INFORMIX_PORT || 9088;
const DB_NAME = process.env.INFORMIX_DB || 'database';
const DB_USER = process.env.INFORMIX_USER || 'informix';
const DB_PASSWORD = process.env.INFORMIX_PASSWORD || 'password';
const DB_SERVER = process.env.INFORMIX_SERVER || 'ol_informix1170';

// JDBC konfiguracija
const jdbcConfig = {
    libpath: __dirname + '/drivers/ifxjdbc.jar', // Putanja do JDBC drajvera
    drivername: 'com.informix.jdbc.IfxDriver',
    url: `jdbc:informix-sqli://${DB_HOST}:${DB_PORT}/${DB_NAME}:INFORMIXSERVER=${DB_SERVER}`,
    user: DB_USER,
    password: DB_PASSWORD,
    minpoolsize: 1,
    maxpoolsize: 10
};

// JT400 konfiguracija (alternativa)
const jt400Config = {
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME
};

// Inicijalizacija JDBC konekcije
let jdbcPool = null;
let jdbcInitialized = false;

async function initJdbcConnection() {
    if (!jdbc || jdbcInitialized) return false;

    try {
        jdbcPool = new jdbc(jdbcConfig);

        await new Promise((resolve, reject) => {
            jdbcPool.initialize((err) => {
                if (err) {
                    console.error('Greška pri inicijalizaciji JDBC:', err);
                    reject(err);
                } else {
                    console.log('JDBC inicijalizovan uspešno');
                    resolve();
                }
            });
        });

        jdbcInitialized = true;
        return true;
    } catch (error) {
        console.error('Greška pri inicijalizaciji JDBC:', error);
        return false;
    }
}

// Inicijalizacija JT400 konekcije
let jt400Pool = null;

function initJt400Connection() {
    if (!jt400 || jt400Pool) return false;

    try {
        jt400Pool = jt400.pool(jt400Config);
        console.log('JT400 konekcija inicijalizovana');
        return true;
    } catch (error) {
        console.error('Greška pri inicijalizaciji JT400:', error);
        return false;
    }
}

// Testiranje konekcije (generička funkcija)
async function testConnection() {
    // Pokušaj sa JDBC
    if (jdbc && !jdbcInitialized) {
        const jdbcSuccess = await initJdbcConnection();
        if (jdbcSuccess) return true;
    }

    // Pokušaj sa JT400
    if (jt400 && !jt400Pool) {
        const jt400Success = initJt400Connection();
        if (jt400Success) return true;
    }

    // Probaj direktne konekcije (ako su već inicijalizovane)
    if (jdbcInitialized) return true;
    if (jt400Pool) return true;

    console.log('Nijedna konekcija nije uspešna, korišćenje mock režima.');
    return false;
}

// Funkcija za dobavljanje SKU kroz JDBC
async function getSkuViaJdbc(catalogSku) {
    if (!jdbcInitialized) {
        const success = await initJdbcConnection();
        if (!success) return null;
    }

    return new Promise((resolve, reject) => {
        // Prilagodite SQL prema vašoj bazi
        const sql = `SELECT sif_rob AS sku FROM roba WHERE kat_bro = '${catalogSku}' LIMIT 1`;

        jdbcPool.reserve((err, connection) => {
            if (err) {
                console.error('Greška pri rezervisanju konekcije:', err);
                return reject(err);
            }

            connection.query(sql, (queryErr, results) => {
                if (queryErr) {
                    jdbcPool.release(connection, (releaseErr) => {
                        if (releaseErr) console.error('Greška pri oslobađanju konekcije:', releaseErr);
                    });
                    return reject(queryErr);
                }

                jdbcPool.release(connection, (releaseErr) => {
                    if (releaseErr) console.error('Greška pri oslobađanju konekcije:', releaseErr);
                });

                if (results && results.length > 0) {
                    resolve(results[0].sku);
                } else {
                    resolve(null);
                }
            });
        });
    });
}

// Funkcija za dobavljanje SKU kroz JT400
async function getSkuViaJt400(catalogSku) {
    if (!jt400Pool) {
        const success = initJt400Connection();
        if (!success) return null;
    }

    try {
        // Prilagodite SQL prema vašoj bazi
        const sql = `SELECT artikal_sifra AS sku FROM artikli WHERE kataloski_broj = '${catalogSku}' FETCH FIRST 1 ROWS ONLY`;
        const results = await jt400Pool.query(sql);

        if (results && results.length > 0) {
            return results[0].sku;
        }
        return null;
    } catch (error) {
        console.error('Greška pri JT400 upitu:', error);
        return null;
    }
}

// Funkcija koja kombinuje različite metode za dobavljanje SKU
async function getSkuFromCatalogSku(catalogSku) {
    // Probaj JDBC
    if (jdbcInitialized || jdbc) {
        try {
            const jdbcResult = await getSkuViaJdbc(catalogSku);
            if (jdbcResult) return jdbcResult;
        } catch (e) {
            console.error('JDBC greška:', e);
        }
    }

    // Probaj JT400
    if (jt400Pool || jt400) {
        try {
            const jt400Result = await getSkuViaJt400(catalogSku);
            if (jt400Result) return jt400Result;
        } catch (e) {
            console.error('JT400 greška:', e);
        }
    }

    console.log(`Nije pronađen SKU za kataloški broj: ${catalogSku} ni kroz jednu metodu`);
    return null;
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