const Season = require('../models/Season');
const Product = require('../models/Product');

// Funkcija za pridruživanje SKU sa sezonom - koristi samo prva 3 znaka
const mapSkuToSeason = async (sku) => {
    try {
        // Koristi samo prva 3 znaka kao prefiks
        const prefix = sku.substring(0, 3);

        // Pronađi sezonu s tim prefiksom
        const season = await Season.findOne({ prefix });

        // Logiranje rezultata za debug
        console.log(`Mapiranje SKU ${sku} na sezonu: prefiks=${prefix}, pronađena sezona=${season ? season.seasonName : 'nije pronađena'}`);

        return season ? season._id : null;
    } catch (error) {
        console.error('Greška pri mapiranju SKU na sezonu:', error);
        return null;
    }
};

// Grupiranje proizvoda po sezoni
const groupProductsBySeasons = async () => {
    try {
        const seasons = await Season.find({ active: true }).sort({ displayOrder: 1 });
        const result = [];

        for (const season of seasons) {
            const products = await Product.find({ seasonId: season._id });

            result.push({
                _id: season._id,
                name: season.seasonName,
                prefix: season.prefix,
                displayOrder: season.displayOrder,
                productCount: products.length,
                products: products
            });
        }

        return result;
    } catch (error) {
        console.error('Greška pri grupiranju proizvoda po sezonama:', error);
        throw error;
    }
};

module.exports = {
    mapSkuToSeason,
    groupProductsBySeasons
};