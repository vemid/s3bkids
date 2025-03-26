import React, { useState, useEffect, useCallback } from 'react';
import { FaSearch, FaTimes } from 'react-icons/fa';

const SkuSearch = ({ searchTerm, onSearch, totalResults, totalSkus }) => {
    const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);

    // Sinhronizuj lokalni search term s parent komponentom
    useEffect(() => {
        setLocalSearchTerm(searchTerm);
    }, [searchTerm]);

    // Debounce pretragu za bolje performanse
    useEffect(() => {
        const timer = setTimeout(() => {
            if (localSearchTerm !== searchTerm) {
                onSearch(localSearchTerm);
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(timer);
    }, [localSearchTerm, onSearch, searchTerm]);

    const handleChange = (e) => {
        setLocalSearchTerm(e.target.value);
    };

    // Očisti pretragu
    const handleClear = useCallback(() => {
        setLocalSearchTerm('');
        onSearch('');
    }, [onSearch]);

    // Pošalji pretragu na Enter
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter') {
            onSearch(localSearchTerm);
        } else if (e.key === 'Escape') {
            handleClear();
        }
    }, [localSearchTerm, onSearch, handleClear]);

    return (
        <div className="sku-search">
            <div className="search-input-container">
                <input
                    type="text"
                    placeholder="Pretraži SKU..."
                    value={localSearchTerm}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                />
                <FaSearch className="search-icon" />

                {localSearchTerm && (
                    <button className="clear-search-btn" onClick={handleClear} title="Očisti pretragu">
                        <FaTimes />
                    </button>
                )}
            </div>

            <div className="search-results-info">
                {localSearchTerm ? (
                    <span>
            Pronađeno {totalResults} od {totalSkus} SKU-ova
          </span>
                ) : (
                    <span>Ukupno {totalSkus} SKU-ova</span>
                )}
            </div>
        </div>
    );
};

export default SkuSearch;