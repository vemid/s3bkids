import React from 'react';
import { FaSearch } from 'react-icons/fa';

const SkuSearch = ({ searchTerm, onSearch }) => {
    const handleChange = (e) => {
        onSearch(e.target.value);
    };

    return (
        <div className="sku-search">
            <input
                type="text"
                placeholder="Pretraži SKU..."
                value={searchTerm}
                onChange={handleChange}
            />
            <FaSearch className="search-icon" />
        </div>
    );
};

export default SkuSearch;