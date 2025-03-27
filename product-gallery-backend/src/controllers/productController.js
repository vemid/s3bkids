const Product = require('../models/Product');
const { getSkuImages, listSkuFolders, internalClient } = require('../services/minioService');
const { mapSkuToSeason, groupProductsBySeasons } = require('../services/seasonService');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// ... postojeće funkcije ...

// Nova funkcija za pretragu proizvoda
const searchProducts = async (req, res) => {
    try {
        const { query } = req.query;

        if (!query) {
            return res.status(400).json({ message: 'Query parametar je obavezan' });
        }

        // Pretraga po SKU kodu (case insensitive)
        const products = await Product.find({
            sku: { $regex: query, $options: 'i' }
        }).limit(100); // Limit na 100 rezultata za bolje performanse

        res.json(products);
    } catch (error) {
        console.error('Greška pri pretraživanju proizvoda:', error);
        res.status(500).json({ message: error.message });
    }
};

// Nova funkcija za masovno preuzimanje proizvoda
const downloadMultipleProducts = async (req, res) => {
    try {
        const { skus } = req.body;

        if (!skus || !Array.isArray(skus) || skus.length === 0) {
            return res.status(400).json({ message: 'Potrebno je poslati listu SKU kodova' });
        }

        if (skus.length > 20) {
            return res.status(400).json({ message: 'Maksimalan broj proizvoda za preuzimanje je 20' });
        }

        console.log(`Kreiranje ZIP arhive za ${skus.length} proizvoda`);

        // Kreiraj temp folder ako ne postoji
        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Ime ZIP fajla
        const zipFileName = `products_${Date.now()}.zip`;
        const zipFilePath = path.join(tempDir, zipFileName);

        // Kreiraj ZIP fajl
        const output = fs.createWriteStream(zipFilePath);
        const archive = archiver('zip', {
            zlib: { level: 6 } // Balans između veličine i brzine
        });

        // Rukovanje završetkom stvaranja ZIP-a
        output.on('close', function() {
            console.log(`ZIP arhiva kreirana: ${zipFilePath} (${archive.pointer()} bajtova)`);

            // Postavi headers za preuzimanje
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename=${zipFileName}`);

            // Šalji ZIP fajl kao odgovor
            const fileStream = fs.createReadStream(zipFilePath);
            fileStream.pipe(res);

            // Obriši ZIP nakon slanja
            fileStream.on('end', () => {
                fs.unlinkSync(zipFilePath);
                console.log(`ZIP arhiva obrisana: ${zipFilePath}`);
            });
        });

        archive.on('error', function(err) {
            console.error('Greška pri kreiranju ZIP arhive:', err);
            res.status(500).json({ message: 'Greška pri kreiranju ZIP arhive' });
        });

        // Poveži archive sa output streamom
        archive.pipe(output);

        // Dodaj slike za svaki SKU
        for (const sku of skus) {
            try {
                // Dodaj direktorij za ovaj SKU
                archive.append(null, { name: `${sku}/` });

                // Dohvati slike za SKU
                const images = await getSkuImages(sku);

                // Dodaj slike po tipovima
                const imageTypes = ['large', 'medium', 'thumb'];

                for (const type of imageTypes) {
                    if (images[type] && images[type].length > 0) {
                        // Dodaj direktorij za tip
                        archive.append(null, { name: `${sku}/${type}/` });

                        // Za svaku sliku
                        for (const image of images[type]) {
                            try {
                                console.log(`Preuzimanje slike ${image.name} iz foldera ${sku}/${type}...`);

                                // Putanja objekta u MinIO
                                const objectName = `${sku}/${type}/${image.name}`;

                                // Privremena putanja
                                const tempFilePath = path.join(tempDir, `temp_${sku}_${type}_${image.name}`);

                                // Dohvati objekt izravno iz MinIO
                                await internalClient.fGetObject(BUCKET_NAME, objectName, tempFilePath);

                                // Dodaj u ZIP
                                archive.file(tempFilePath, { name: `${sku}/${type}/${image.name}` });

                                // Obriši temp fajl nakon dodavanja u ZIP
                                fs.unlinkSync(tempFilePath);

                                console.log(`Slika ${image.name} dodana u ZIP`);
                            } catch (err) {
                                console.error(`Greška pri dodavanju slike ${image.name} za SKU ${sku}:`, err);
                            }
                        }
                    }
                }
            } catch (err) {
                console.error(`Greška pri obradi SKU ${sku}:`, err);
            }
        }

        // Završi ZIP proces
        await archive.finalize();

    } catch (error) {
        console.error(`Greška pri masovnom preuzimanju:`, error);
        res.status(500).json({ message: error.message });
    }
};

// Dodajemo nove funkcije u exports
module.exports = {
    getAllProducts,
    getProductBySku,
    getProductsBySeason,
    getProductsGroupedBySeasons,
    syncProducts,
    downloadProductImages,
    searchProducts,
    downloadMultipleProducts
};