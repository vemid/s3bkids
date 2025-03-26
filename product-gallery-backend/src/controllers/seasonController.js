const Season = require('../models/Season');
const Product = require('../models/Product');

// Dohvaćanje svih sezona
const getAllSeasons = async (req, res) => {
    try {
        const seasons = await Season.find().sort({ displayOrder: 1 });
        res.json(seasons);
    } catch (error) {
        console.error('Greška pri dohvaćanju sezona:', error);
        res.status(500).json({ message: error.message });
    }
};

// Dohvaćanje sezone po ID-u
const getSeasonById = async (req, res) => {
    try {
        const { id } = req.params;

        const season = await Season.findById(id);

        if (!season) {
            return res.status(404).json({ message: 'Sezona nije pronađena' });
        }

        res.json(season);
    } catch (error) {
        console.error(`Greška pri dohvaćanju sezone ${req.params.id}:`, error);
        res.status(500).json({ message: error.message });
    }
};

// Kreiranje nove sezone
const createSeason = async (req, res) => {
    try {
        const { prefix, seasonName, displayOrder, active } = req.body;

        // Provjeri postoji li već sezona s tim prefiksom
        const existingSeason = await Season.findOne({ prefix });

        if (existingSeason) {
            return res.status(400).json({ message: 'Sezona s tim prefiksom već postoji' });
        }

        // Kreiraj novu sezonu
        const season = new Season({
            prefix,
            seasonName,
            displayOrder: displayOrder || 0,
            active: active !== undefined ? active : true
        });

        await season.save();

        res.status(201).json(season);
    } catch (error) {
        console.error('Greška pri kreiranju sezone:', error);
        res.status(500).json({ message: error.message });
    }
};

// Ažuriranje sezone
const updateSeason = async (req, res) => {
    try {
        const { id } = req.params;
        const { prefix, seasonName, displayOrder, active } = req.body;

        // Pronađi sezonu
        let season = await Season.findById(id);

        if (!season) {
            return res.status(404).json({ message: 'Sezona nije pronađena' });
        }

        // Ako se mijenja prefiks, provjeri je li jedinstveni
        if (prefix && prefix !== season.prefix) {
            const existingSeason = await Season.findOne({ prefix });

            if (existingSeason && existingSeason._id.toString() !== id) {
                return res.status(400).json({ message: 'Sezona s tim prefiksom već postoji' });
            }
        }

        // Ažuriraj sezonu
        season.prefix = prefix || season.prefix;
        season.seasonName = seasonName || season.seasonName;
        season.displayOrder = displayOrder !== undefined ? displayOrder : season.displayOrder;
        season.active = active !== undefined ? active : season.active;

        await season.save();

        res.json(season);
    } catch (error) {
        console.error(`Greška pri ažuriranju sezone ${req.params.id}:`, error);
        res.status(500).json({ message: error.message });
    }
};

// Brisanje sezone
const deleteSeason = async (req, res) => {
    try {
        const { id } = req.params;

        // Pronađi sezonu
        const season = await Season.findById(id);

        if (!season) {
            return res.status(404).json({ message: 'Sezona nije pronađena' });
        }

        // Provjeri ima li proizvoda povezanih s ovom sezonom
        const productCount = await Product.countDocuments({ seasonId: id });

        if (productCount > 0) {
            return res.status(400).json({
                message: 'Nije moguće obrisati sezonu jer postoje povezani proizvodi',
                productCount
            });
        }

        // Obriši sezonu
        await Season.findByIdAndDelete(id);

        res.json({ message: 'Sezona uspješno obrisana' });
    } catch (error) {
        console.error(`Greška pri brisanju sezone ${req.params.id}:`, error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getAllSeasons,
    getSeasonById,
    createSeason,
    updateSeason,
    deleteSeason
};