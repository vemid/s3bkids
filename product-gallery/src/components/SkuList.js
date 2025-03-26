import React, { useEffect, useRef } from 'react';
import { FaFolder, FaSpinner } from 'react-icons/fa';

const SkuList = ({
                     skuList,
                     selectedSku,
                     selectedSkus,
                     isMultiSelect,
                     onSelectSku,
                     loading,
                     loadMore,
                     hasMore
                 }) => {
    const listRef = useRef(null);
    const loadingRef = useRef(null);

    // Implementacija infinite scrolling
    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasMore && !loading) {
                loadMore();
            }
        }, { threshold: 0.5 });

        if (loadingRef.current) {
            observer.observe(loadingRef.current);
        }

        return () => {
            if (loadingRef.current) {
                observer.unobserve(loadingRef.current);
            }
        };
    }, [hasMore, loadMore, loading]);

    // Skroluj do selektovanog SKU-a
    useEffect(() => {
        if (selectedSku && listRef.current) {
            const selectedElement = listRef.current.querySelector(`.sku-item.selected`);

            if (selectedElement) {
                selectedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, [selectedSku]);

    if (loading && skuList.length === 0) {
        return (
            <div className="loading">
                <FaSpinner className="fa-spin" style={{ marginRight: '0.5rem' }} />
                Učitavanje...
            </div>
        );
    }

    return (
        <div ref={listRef} className="sku-list-container">
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

                {hasMore && (
                    <li ref={loadingRef} className="sku-item-loading">
                        {loading && <FaSpinner className="fa-spin" />}
                        {loading ? 'Učitavanje...' : 'Učitaj više...'}
                    </li>
                )}
            </ul>
        </div>
    );
};

export default SkuList;