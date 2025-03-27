import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { productService } from '../../services/api';
import './ProductsPage.css';

const ProductsPage = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [seasonProducts, setSeasonProducts] = useState([]);
    const [activeSeasonId, setActiveSeasonId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearchMode, setIsSearchMode] = useState(false);
    const [selectedProducts, setSelectedProducts] = useState([]);
    const [selectMode, setSelectMode] = useState(false);
    const [downloadingMultiple, setDownloadingMultiple] = useState(false);

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

    // Handler za promjenu sezone
    const handleSeasonChange = (seasonId) => {
        setActiveSeasonId(seasonId);
        // Reset search mode ako je aktivan
        if (isSearchMode) {
            setIsSearchMode(false);
            setSearchQuery('');
            setSearchResults([]);
        }
    };

    // Handler za pretragu
    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        try {
            setLoading(true);
            const response = await productService.searchProducts(searchQuery);
            setSearchResults(response.data);
            setIsSearchMode(true);
            setLoading(false);
        } catch (error) {
            console.error('Error searching products:', error);
            setError('Greška pri pretraživanju proizvoda.');
            setLoading(false);
        }
    };

    // Handler za odabir proizvoda
    const handleProductSelect = (sku) => {
        setSelectedProducts(prev => {
            if (prev.includes(sku)) {
                return prev.filter(item => item !== sku);
            } else {
                return [...prev, sku];
            }
        });
    };

    // Handler za preuzimanje odabranih proizvoda
    const handleDownloadSelected = async () => {
        if (selectedProducts.length === 0) return;

        try {
            setDownloadingMultiple(true);
            await productService.downloadMultipleProducts(selectedProducts);
        } catch (error) {
            console.error('Error downloading multiple products:', error);
        } finally {
            setDownloadingMultiple(false);
        }
    };

    // Reset pretrage
    const resetSearch = () => {
        setIsSearchMode(false);
        setSearchQuery('');
        setSearchResults([]);
    };

    // Toggle između normalnog i mode selekcije
    const toggleSelectMode = () => {
        setSelectMode(!selectMode);
        if (selectMode) {
            // Ako izlazimo iz select mode, resetiramo selekciju
            setSelectedProducts([]);
        }
    };

    // Dohvaćanje proizvoda za prikaz
    const getDisplayProducts = () => {
        if (isSearchMode) {
            return searchResults;
        } else {
            return seasonProducts.find(season => season._id === activeSeasonId)?.products || [];
        }
    };

    // Filtriraj proizvode prema aktivnoj sezoni ili pretrazi
    const displayProducts = getDisplayProducts();

    if (loading) {
        return <div className="loading">Učitavanje proizvoda...</div>;
    }

    if (error) {
        return <div className="error">{error}</div>;
    }

    return (
        <div className="products-container">
            <div className="products-header">
                <h1>Galerija proizvoda</h1>

                <div className="products-toolbar">
                    {/* Search bar */}
                    <div className="search-container">
                        <form onSubmit={handleSearch} className="search-form">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Pretraži po SKU..."
                                className="search-input"
                            />
                            <button type="submit" className="search-button">Traži</button>
                            {isSearchMode && (
                                <button type="button" className="reset-search-button" onClick={resetSearch}>
                                    Resetiraj
                                </button>
                            )}
                        </form>
                    </div>

                    {/* Selection controls */}
                    <div className="selection-controls">
                        <button
                            className={`select-mode-button ${selectMode ? 'active' : ''}`}
                            onClick={toggleSelectMode}
                        >
                            {selectMode ? 'Završi odabir' : 'Odaberi više'}
                        </button>

                        {selectMode && selectedProducts.length > 0 && (
                            <button
                                className="download-selected-button"
                                onClick={handleDownloadSelected}
                                disabled={downloadingMultiple}
                            >
                                {downloadingMultiple
                                    ? 'Preuzimanje...'
                                    : `Preuzmi odabrano (${selectedProducts.length})`}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs za sezone - prikazuju se samo ako nije search mode */}
            {!isSearchMode && (
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
            )}

            {/* Informacija o rezultatima pretrage */}
            {isSearchMode && (
                <div className="search-results-info">
                    Pronađeno {searchResults.length} proizvoda za upit "{searchQuery}"
                </div>
            )}

            {/* Mreža proizvoda */}
            <div className="products-grid">
                {displayProducts.length > 0 ? (
                    displayProducts.map(product => (
                        <div
                            className={`product-card-container ${selectedProducts.includes(product.sku) ? 'selected' : ''}`}
                            key={product.sku}
                        >
                            {selectMode && (
                                <div className="product-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={selectedProducts.includes(product.sku)}
                                        onChange={() => handleProductSelect(product.sku)}
                                    />
                                </div>
                            )}

                            <Link
                                to={`/products/${product.sku}`}
                                className="product-card"
                                onClick={(e) => {
                                    // Spriječi navigaciju ako smo u select mode
                                    if (selectMode) {
                                        e.preventDefault();
                                        handleProductSelect(product.sku);
                                    }
                                }}
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
                        </div>
                    ))
                ) : (
                    <div className="no-products">
                        {isSearchMode
                            ? 'Nema rezultata pretrage'
                            : 'Nema proizvoda u ovoj sezoni'}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProductsPage;