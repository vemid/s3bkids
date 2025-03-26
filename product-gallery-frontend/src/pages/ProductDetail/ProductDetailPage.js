import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { productService } from '../../services/api';
import './ProductDetailPage.css';

const ProductDetailPage = () => {
    const { sku } = useParams();
    const navigate = useNavigate();
    const [product, setProduct] = useState(null);
    const [images, setImages] = useState({ thumb: [], medium: [], large: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [viewSize, setViewSize] = useState('medium'); // large, medium, thumb
    const [selectedImage, setSelectedImage] = useState(null);

    useEffect(() => {
        const fetchProductDetails = async () => {
            try {
                setLoading(true);
                const response = await productService.getProductBySku(sku);
                setProduct(response.data.product);
                setImages(response.data.images);

                // Postavi prvu sliku kao odabranu
                if (response.data.images.medium && response.data.images.medium.length > 0) {
                    setSelectedImage(response.data.images.medium[0]);
                } else if (response.data.images.large && response.data.images.large.length > 0) {
                    setSelectedImage(response.data.images.large[0]);
                } else if (response.data.images.thumb && response.data.images.thumb.length > 0) {
                    setSelectedImage(response.data.images.thumb[0]);
                }

                setLoading(false);
            } catch (error) {
                console.error('Error fetching product details:', error);
                setError('Nije moguće dohvatiti detalje proizvoda. Molimo pokušajte ponovo.');
                setLoading(false);
            }
        };

        fetchProductDetails();
    }, [sku]);

    const handleImageClick = (image) => {
        setSelectedImage(image);
    };

    const handleDownloadClick = (url, filename) => {
        // Kreiranje nevidljivog <a> elementa za preuzimanje
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'image';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const handleDownloadAll = () => {
        // Ovo je samo obavijest, za pravo preuzimanje svih slika
        // trebali bismo implementirati ZIP generiranje na backendu
        alert('Funkcionalnost preuzimanja svih slika odjednom bit će implementirana uskoro. Za sada možete preuzimati slike pojedinačno.');
    };

    const getCurrentImages = () => {
        return images[viewSize] || [];
    };

    if (loading) {
        return <div className="loading">Učitavanje detalja proizvoda...</div>;
    }

    if (error) {
        return <div className="error">{error}</div>;
    }

    if (!product) {
        return <div className="error">Proizvod nije pronađen</div>;
    }

    return (
        <div className="product-detail-container">
            <div className="product-detail-header">
                <button
                    className="back-button"
                    onClick={() => navigate(-1)}
                >
                    &larr; Natrag
                </button>
                <h1>Proizvod: {sku}</h1>
            </div>

            <div className="view-controls">
                <div className="size-toggle">
                    <button
                        className={`size-button ${viewSize === 'large' ? 'active' : ''}`}
                        onClick={() => setViewSize('large')}
                    >
                        Large ({images.large ? images.large.length : 0})
                    </button>
                    <button
                        className={`size-button ${viewSize === 'medium' ? 'active' : ''}`}
                        onClick={() => setViewSize('medium')}
                    >
                        Medium ({images.medium ? images.medium.length : 0})
                    </button>
                    <button
                        className={`size-button ${viewSize === 'thumb' ? 'active' : ''}`}
                        onClick={() => setViewSize('thumb')}
                    >
                        Thumb ({images.thumb ? images.thumb.length : 0})
                    </button>
                </div>
                <button
                    className="download-all-button"
                    onClick={handleDownloadAll}
                >
                    Preuzmi sve
                </button>
            </div>

            <div className="product-detail-content">
                <div className="image-gallery">
                    {getCurrentImages().length > 0 ? (
                        getCurrentImages().map((image, index) => (
                            <div
                                key={index}
                                className={`image-thumbnail ${selectedImage && selectedImage.url === image.url ? 'selected' : ''}`}
                                onClick={() => handleImageClick(image)}
                            >
                                <img src={image.url} alt={`${sku} ${index + 1}`} />
                            </div>
                        ))
                    ) : (
                        <div className="no-images">Nema dostupnih slika u ovoj veličini</div>
                    )}
                </div>

                <div className="selected-image-container">
                    {selectedImage ? (
                        <>
                            <div className="selected-image">
                                <img src={selectedImage.url} alt={sku} />
                            </div>
                            <div className="image-actions">
                                <button
                                    className="download-button"
                                    onClick={() => handleDownloadClick(selectedImage.url, selectedImage.name)}
                                >
                                    Preuzmi sliku
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="no-selection">Odaberite sliku iz galerije</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProductDetailPage;