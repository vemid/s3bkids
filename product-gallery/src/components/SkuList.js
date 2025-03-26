import React from 'react';
import { FaFolder, FaSpinner } from 'react-icons/fa';

const SkuList = ({
                     skuList,
                     selectedSku,
                     selectedSkus,
                     isMultiSelect,
                     onSelectSku,
                     loading
                 }) => {
    if (loading && skuList.length === 0) {
        return (
            <div className="loading">
                <FaSpinner className="fa-spin" style={{ marginRight: '0.5rem' }} />
                Učitavanje...
            </div>
        );
    }

    return (
        <>
            <h2>Proizvodi ({skuList.length})</h2>
            <ul className="sku-list">
                {skuList.map(sku => (
                    <li
                        key={sku}
                        className={`sku-item ${
                            isMultiSelect
                                ? selectedSkus.includes(sku) ? 'selected' : ''
                                : selectedSku === sku ? 'selected' : ''
                        }`}
                        onClick={() => onSelectSku(sku)}
                    >
                        <FaFolder className="sku-item-icon" />
                        {sku}
                    </li>
                ))}

                {skuList.length === 0 && !loading && (
                    <div className="empty-state" style={{ padding: '1rem 0' }}>
                        Nema pronađenih SKU-ova
                    </div>
                )}
            </ul>
        </>
    );
};

export default SkuList;