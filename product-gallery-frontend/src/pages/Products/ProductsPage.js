import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { productService } from '../../services/api';
import './ProductsPage.css';

const ProductsPage = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [seasonProducts, setSeasonProducts] = useState([]);
    const [activeSeasonId, setActiveSeasonId] = useState(null);

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                setLoading(true);
                const response = await productService.getProductsBySeasons();
                setSeasonProducts(response.data);

                // Postavi prvu sezonu kao aktivnu
                if (response.data.length > 0) {
                    setActiveSeasonId(response.data[0]._id);
                }

                setLoading(false);
            } catch (error) {
                console.error('Error fetching products:', error);
                setError('Nije moguće dohvatiti proizvode. Molimo pokušajte ponovo.');
                setLoading(false);
            }
        };

        fetchProducts();
    }, []);

    const handleSeasonChange = (seasonId) => {
        setActiveSeasonId(seasonId);
    };

    // Filtriraj proizvode prema aktivnoj sezoni
    const filteredProducts = seasonProducts.find(season => season._id === activeSeasonId)?.products || [];

    if (loading) {
        return <div className="loading">Učitavanje proizvoda...</div>;
    }

    if (error) {
        return <div className="error">{error}</div>;
    }

    return (
        <div className="products-container">
            <h1>Galerija proizvoda</h1>

            {/* Tabs za sezone */}
            <div className="season-tabs">
                {seasonProducts.map(season => (
                    <button
                        key={season._id}
                        className={`season-tab ${season._id === activeSeasonId ? 'active' : ''}`}
                        onClick={() => handleSeasonChange(season._id)}
                    >
                        {season.name} ({season.productCount})
                    </button>
                ))}
            </div>

            {/* Mreža proizvoda */}
            <div className="products-grid">
                {filteredProducts.length > 0 ? (
                    filteredProducts.map(product => (
                        <Link
                            to={`/products/${product.sku}`}
                            className="product-card"
                            key={product.sku}
                        >
                            <div className="product-thumbnail">
                                {product.thumbnailUrl ? (
                                    <img src={product.thumbnailUrl} alt={product.sku} />
                                ) : (
                                    <div className="no-image">Nema slike</div>
                                )}
                            </div>
                            <div className="product-info">
                                <h3>{product.sku}</h3>
                                <div className="image-count">
                                    <span>Slika: {product.imageCount.thumb + product.imageCount.medium + product.imageCount.large}</span>
                                </div>
                            </div>
                        </Link>
                    ))
                ) : (
                    <div className="no-products">
                        Nema proizvoda u ovoj sezoni
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProductsPage;