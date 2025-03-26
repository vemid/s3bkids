const mongoose = require('mongoose');

const seasonSchema = new mongoose.Schema({
    prefix: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    seasonName: {
        type: String,
        required: true,
        trim: true
    },
    displayOrder: {
        type: Number,
        default: 0
    },
    active: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indeks za brzo pretraživanje
seasonSchema.index({ prefix: 1 });
seasonSchema.index({ displayOrder: 1 });

const Season = mongoose.model('Season', seasonSchema);
module.exports = Season;