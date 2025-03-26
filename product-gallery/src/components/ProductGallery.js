import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SkuList from './SkuList';
import SkuSearch from './SkuSearch';
import ImageViewer from './ImageViewer';

// Ikone
import { FaDownload, FaCheckSquare, FaSignOutAlt, FaUser } from 'react-icons/fa';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:9080';

const ProductGallery = ({ onLogout, user }) => {
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
    const [error, setError] = useState(null);

    // Učitaj listu SKU-ova
    useEffect(() => {
        const fetchSkuList = async () => {
            try {
                setLoading(true);
                const response = await axios.get(`${API_URL}/api/skus`);
                setSkuList(response.data);
                setFilteredSkuList(response.data);
                setLoading(false);
            } catch (err) {
                console.error('Error fetching SKU list:', err);
                setError('Greška pri učitavanju liste SKU-ova');
                setLoading(false);
            }
        };

        fetchSkuList();
    }, []);

    // Učitaj slike za odabrani SKU
    useEffect(() => {
        if (selectedSku) {
            const fetchImages = async () => {
                try {
                    setLoading(true);
                    const response = await axios.get(`${API_URL}/api/images/${selectedSku}/${selectedSize}`);
                    setImages(response.data);
                    setCurrentImageIndex(0);
                    setLoading(false);
                } catch (err) {
                    console.error(`Error fetching images for SKU ${selectedSku}:`, err);
                    setError(`Greška pri učitavanju slika za SKU ${selectedSku}`);
                    setLoading(false);
                }
            };

            fetchImages();
        } else {
            setImages([]);
        }
    }, [selectedSku, selectedSize]);

    // Filtriraj SKU-ove prema pretrazi
    useEffect(() => {
        if (searchTerm.trim() === '') {
            setFilteredSkuList(skuList);
        } else {
            const filtered = skuList.filter(sku =>
                sku.toLowerCase().includes(searchTerm.toLowerCase())
            );
            setFilteredSkuList(filtered);
        }
    }, [searchTerm, skuList]);

    const handleSelectSku = (sku) => {
        if (isMultiSelect) {
            // U multi-select modu, dodajemo/uklanjamo SKU iz selekcije
            if (selectedSkus.includes(sku)) {
                setSelectedSkus(prev => prev.filter(s => s !== sku));
            } else {
                setSelectedSkus(prev => [...prev, sku]);
            }
        } else {
            // U single-select modu, samo postavimo trenutni SKU
            setSelectedSku(sku);
        }
    };

    const handleSizeChange = (size) => {
        setSelectedSize(size);
    };

    const handlePrevImage = () => {
        setCurrentImageIndex(prev => (prev > 0 ? prev - 1 : images.length - 1));
    };

    const handleNextImage = () => {
        setCurrentImageIndex(prev => ((prev + 1) % images.length));
    };

    const handleSearch = (value) => {
        setSearchTerm(value);
    };

    const toggleMultiSelect = () => {
        setIsMultiSelect(prev => !prev);

        if (!isMultiSelect) {
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
    };

    const downloadSelectedSkus = () => {
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
    };

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
                    />

                    <SkuList
                        skuList={filteredSkuList}
                        selectedSku={selectedSku}
                        selectedSkus={selectedSkus}
                        isMultiSelect={isMultiSelect}
                        onSelectSku={handleSelectSku}
                        loading={loading}
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
                        loading={loading}
                        error={error}
                    />
                </div>
            </div>
        </>
    );
};

export default ProductGallery;