import React from 'react';
import { FaChevronLeft, FaChevronRight, FaImage, FaSpinner } from 'react-icons/fa';

const ImageViewer = ({
                         selectedSku,
                         images,
                         currentImageIndex,
                         selectedSize,
                         onSizeChange,
                         onPrevImage,
                         onNextImage,
                         loading,
                         error
                     }) => {
    const availableSizes = ['large', 'medium', 'thumb'];

    // Ako nemamo odabrani SKU, prikaži prazno stanje
    if (!selectedSku) {
        return (
            <div className="empty-state">
                <FaImage className="empty-state-icon" />
                <p>Odaberite SKU sa liste da biste vidjeli slike</p>
            </div>
        );
    }

    // Ako učitavamo, prikaži loading
    if (loading) {
        return (
            <div className="loading">
                <FaSpinner className="fa-spin" style={{ marginRight: '0.5rem' }} />
                Učitavanje slika...
            </div>
        );
    }

    // Ako imamo grešku, prikaži ju
    if (error) {
        return (
            <div className="empty-state" style={{ color: '#e74c3c' }}>
                <p>{error}</p>
            </div>
        );
    }

    // Ako nema slika, prikaži odgovarajuću poruku
    if (images.length === 0) {
        return (
            <div className="empty-state">
                <FaImage className="empty-state-icon" />
                <p>Nema slika za odabrani SKU: {selectedSku}</p>
            </div>
        );
    }

    // Dohvati trenutnu sliku
    const currentImage = images[currentImageIndex];

    return (
        <div className="image-viewer">
            <div className="image-controls">
                <div>
                    <h2>{selectedSku}</h2>
                </div>

                <div className="size-selector">
                    {availableSizes.map(size => (
                        <button
                            key={size}
                            className={`size-button ${selectedSize === size ? 'active' : ''}`}
                            onClick={() => onSizeChange(size)}
                        >
                            {size}
                        </button>
                    ))}
                </div>
            </div>

            <div className="image-display">
                <div className="image-container">
                    <img
                        src={currentImage.url}
                        alt={currentImage.name}
                        className="product-image"
                    />

                    {images.length > 1 && (
                        <>
                            <button
                                className="nav-button prev"
                                onClick={onPrevImage}
                                aria-label="Prethodna slika"
                            >
                                <FaChevronLeft />
                            </button>

                            <button
                                className="nav-button next"
                                onClick={onNextImage}
                                aria-label="Sljedeća slika"
                            >
                                <FaChevronRight />
                            </button>
                        </>
                    )}
                </div>

                <div className="image-info">
                    {currentImageIndex + 1} / {images.length} - {currentImage.name}
                </div>
            </div>
        </div>
    );
};

export default ImageViewer;