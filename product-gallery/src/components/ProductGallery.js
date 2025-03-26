import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import SkuList from './SkuList';
import SkuSearch from './SkuSearch';
import ImageViewer from './ImageViewer';

// Ikone
import { FaDownload, FaCheckSquare, FaSignOutAlt, FaUser, FaSync } from 'react-icons/fa';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:9080';

const ProductGallery = ({ onLogout, user }) => {
    // State varijable
    const [skuList, setSkuList] = useState([]);
    const [filteredSkuList, setFilteredSkuList] = useState([]);
    const [selectedSku, setSelectedSku] = useState(null);
    const [selectedSize, setSelectedSize] = useState('large');
    const [images, setImages] = useState([]);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSkus, setSelectedSkus] = useState([]);
    const [isMultiSelect, setIsMultiSelect] = useState(false);
    const [loading, setLoading] = useState(true);
    const [imageLoading, setImageLoading] = useState(false);
    const [error, setError] = useState(null);
    const [totalSkus, setTotalSkus] = useState(0);
    const [page, setPage] = useState(1);
    const [limit] = useState(100);
    const [hasMore, setHasMore] = useState(true);

    // Učitaj listu SKU-ova s paginacijom
    const fetchSkuList = useCallback(async (pageNum = 1, reset = false) => {
        try {
            setLoading(true);
            setError(null);

            const response = await axios.get(`${API_URL}/api/skus`, {
                params: { page: pageNum, limit }
            });

            const { data, total } = response.data;

            setTotalSkus(total);

            if (reset) {
                setSkuList(data);
                setFilteredSkuList(data);
            } else {
                setSkuList(prev => [...prev, ...data]);
                setFilteredSkuList(prev => [...prev, ...data]);
            }

            setHasMore(pageNum * limit < total);
            setLoading(false);
        } catch (err) {
            console.error('Error fetching SKU list:', err);
            setError('Greška pri učitavanju liste SKU-ova');
            setLoading(false);
        }
    }, [limit]);

    // Inicijalno učitavanje SKU-ova
    useEffect(() => {
        fetchSkuList(1, true);
    }, [fetchSkuList]);

    // Učitaj više SKU-ova kad se dođe do kraja liste
    const loadMoreSkus = useCallback(() => {
        if (!loading && hasMore) {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchSkuList(nextPage);
        }
    }, [loading, hasMore, page, fetchSkuList]);

    // Učitaj slike za odabrani SKU samo kad se promijeni SKU ili veličina
    useEffect(() => {
        if (selectedSku) {
            const fetchImages = async () => {
                try {
                    setImageLoading(true);
                    setError(null);

                    const response = await axios.get(`${API_URL}/api/images/${selectedSku}/${selectedSize}`);

                    setImages(response.data);
                    setCurrentImageIndex(0);
                    setImageLoading(false);
                } catch (err) {
                    console.error(`Error fetching images for SKU ${selectedSku}:`, err);
                    setError(`Greška pri učitavanju slika za SKU ${selectedSku}`);
                    setImageLoading(false);
                }
            };

            fetchImages();
        } else {
            setImages([]);
        }
    }, [selectedSku, selectedSize]);

    // Filtriraj SKU-ove prema pretrazi - optimizovano s useMemo
    useMemo(() => {
        if (searchTerm.trim() === '') {
            setFilteredSkuList(skuList);
        } else {
            const filtered = skuList.filter(sku =>
                sku.toLowerCase().includes(searchTerm.toLowerCase())
            );
            setFilteredSkuList(filtered);
        }
    }, [searchTerm, skuList]);

    // Handler za odabir SKU-a
    const handleSelectSku = useCallback((sku) => {
        if (isMultiSelect) {
            // U multi-select modu, dodajemo/uklanjamo SKU iz selekcije
            setSelectedSkus(prev => {
                if (prev.includes(sku)) {
                    return prev.filter(s => s !== sku);
                } else {
                    return [...prev, sku];
                }
            });
        } else {
            // U single-select modu, samo postavimo trenutni SKU
            setSelectedSku(sku);
        }
    }, [isMultiSelect]);

    // Handler za promjenu veličine slike
    const handleSizeChange = useCallback((size) => {
        setSelectedSize(size);
    }, []);

    // Navigacija kroz slike
    const handlePrevImage = useCallback(() => {
        setCurrentImageIndex(prev => (prev > 0 ? prev - 1 : images.length - 1));
    }, [images.length]);

    const handleNextImage = useCallback(() => {
        setCurrentImageIndex(prev => ((prev + 1) % images.length));
    }, [images.length]);

    // Handler za pretragu
    const handleSearch = useCallback((value) => {
        setSearchTerm(value);
    }, []);

    // Promjena moda odabira (single/multi)
    const toggleMultiSelect = useCallback(() => {
        setIsMultiSelect(prev => {
            const newValue = !prev;

            if (!prev) {
                // Ako prelazimo u multi-select, dodajemo trenutni SKU ako postoji
                if (selectedSku && !selectedSkus.includes(selectedSku)) {
                    setSelectedSkus([selectedSku]);
                }
            } else {
                // Ako izlazimo iz multi-select, postavljamo prvi selektirani kao trenutni
                if (selectedSkus.length > 0) {
                    setSelectedSku(selectedSkus[0]);
                }
            }

            return newValue;
        });
    }, [selectedSku, selectedSkus]);

    // Preuzimanje ZIP arhive
    const downloadSelectedSkus = useCallback(() => {
        const skusToDownload = isMultiSelect ? selectedSkus : [selectedSku];

        if (skusToDownload.length === 0 || !skusToDownload[0]) {
            console.warn('No SKUs selected for download');
            return;
        }

        // Šalji zahtjev i preuzmi ZIP
        axios({
            method: 'post',
            url: `${API_URL}/api/download-zip`,
            data: {
                skus: skusToDownload,
                size: selectedSize
            },
            responseType: 'blob'
        })
            .then(response => {
                // Kreiraj URL za preuzimanje
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;

                // Generiraj ime za ZIP
                const fileName = `products-${skusToDownload.join('-')}.zip`;
                link.setAttribute('download', fileName);

                // Dodaj u DOM, klikni i očisti
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
            })
            .catch(error => {
                console.error('Error downloading ZIP:', error);
                setError('Greška pri preuzimanju ZIP arhive');
            });
    }, [isMultiSelect, selectedSku, selectedSkus, selectedSize]);

    // Osvježi podatke
    const handleRefresh = useCallback(() => {
        // Osvježi listu SKU-ova
        fetchSkuList(1, true);

        // Ako je odabran SKU, osvježi i slike
        if (selectedSku) {
            setSelectedSku(prev => {
                // Moramo postaviti na null i onda nazad na istu vrijednost da bi se okidao useEffect
                setSelectedSku(null);
                return prev;
            });
        }

        // Opciono: očisti keš na serveru
        axios.post(`${API_URL}/api/cache/clear`)
            .catch(error => console.error('Error clearing cache:', error));
    }, [fetchSkuList, selectedSku]);

    return (
        <>
            <header className="app-header">
                <h1>Pregled slika proizvoda</h1>

                <div className="action-buttons">
                    <div className="user-info">
                        <FaUser className="user-icon" />
                        <span className="username">{user?.username || 'Korisnik'}</span>
                    </div>

                    <button
                        className="btn btn-secondary"
                        onClick={handleRefresh}
                        title="Osvježi podatke"
                        disabled={loading || imageLoading}
                    >
                        <FaSync className={`btn-icon ${loading || imageLoading ? 'fa-spin' : ''}`} />
                        Osvježi
                    </button>

                    <button
                        className={`btn ${isMultiSelect ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={toggleMultiSelect}
                        title={isMultiSelect ? "Isključi višestruki odabir" : "Uključi višestruki odabir"}
                    >
                        <FaCheckSquare className="btn-icon" />
                        {isMultiSelect ? `Odabrano: ${selectedSkus.length}` : "Višestruki odabir"}
                    </button>

                    {(selectedSku || selectedSkus.length > 0) && (
                        <button
                            className="btn btn-success"
                            onClick={downloadSelectedSkus}
                            title="Preuzmi ZIP arhivu odabranih SKU-ova"
                            disabled={loading || imageLoading}
                        >
                            <FaDownload className="btn-icon" />
                            Preuzmi ZIP
                        </button>
                    )}

                    <button
                        className="btn btn-secondary"
                        onClick={onLogout}
                        title="Odjava"
                    >
                        <FaSignOutAlt className="btn-icon" />
                        Odjava
                    </button>
                </div>
            </header>

            <div className="app-content">
                <div className="sidebar">
                    <SkuSearch
                        searchTerm={searchTerm}
                        onSearch={handleSearch}
                        totalResults={filteredSkuList.length}
                        totalSkus={totalSkus}
                    />

                    <SkuList
                        skuList={filteredSkuList}
                        selectedSku={selectedSku}
                        selectedSkus={selectedSkus}
                        isMultiSelect={isMultiSelect}
                        onSelectSku={handleSelectSku}
                        loading={loading}
                        loadMore={loadMoreSkus}
                        hasMore={hasMore}
                    />
                </div>

                <div className="main-content">
                    <ImageViewer
                        selectedSku={selectedSku}
                        images={images}
                        currentImageIndex={currentImageIndex}
                        selectedSize={selectedSize}
                        onSizeChange={handleSizeChange}
                        onPrevImage={handlePrevImage}
                        onNextImage={handleNextImage}
                        loading={imageLoading}
                        error={error}
                    />
                </div>
            </div>
        </>
    );
};

export default ProductGallery;