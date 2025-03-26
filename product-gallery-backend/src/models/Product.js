const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    sku: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    seasonId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Season'
    },
    name: {
        type: String,
        trim: true
    },
    thumbnailUrl: {
        type: String
    },
    imageCount: {
        thumb: {
            type: Number,
            default: 0
        },
        medium: {
            type: Number,
            default: 0
        },
        large: {
            type: Number,
            default: 0
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

// Indeks za brzo pretraživanje
productSchema.index({ sku: 1 });

const Product = mongoose.model('Product', productSchema);
module.exports = Product;