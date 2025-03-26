import React, { useState } from 'react';
import { productService, seasonService } from '../../services/api';
import './AdminPage.css';

const AdminPage = () => {
    const [syncStatus, setSyncStatus] = useState(null);
    const [syncLoading, setSyncLoading] = useState(false);
    const [newSeason, setNewSeason] = useState({ prefix: '', seasonName: '', displayOrder: 0 });
    const [createStatus, setCreateStatus] = useState(null);
    const [createLoading, setCreateLoading] = useState(false);

    const handleSyncProducts = async () => {
        try {
            setSyncLoading(true);
            setSyncStatus(null);
            const response = await productService.syncProducts();
            setSyncStatus({
                success: true,
                message: `Sinkronizacija uspješna! Kreirano: ${response.data.created}, Ažurirano: ${response.data.updated}`
            });
        } catch (error) {
            console.error('Sync error:', error);
            setSyncStatus({
                success: false,
                message: error.response?.data?.message || 'Greška pri sinkronizaciji'
            });
        } finally {
            setSyncLoading(false);
        }
    };

    const handleCreateSeason = async (e) => {
        e.preventDefault();

        if (!newSeason.prefix || !newSeason.seasonName) {
            setCreateStatus({
                success: false,
                message: 'Prefiks i naziv sezone su obavezni!'
            });
            return;
        }

        try {
            setCreateLoading(true);
            setCreateStatus(null);
            await seasonService.createSeason(newSeason);
            setCreateStatus({
                success: true,
                message: `Sezona "${newSeason.seasonName}" uspješno kreirana!`
            });
            setNewSeason({ prefix: '', seasonName: '', displayOrder: 0 });
        } catch (error) {
            console.error('Create season error:', error);
            setCreateStatus({
                success: false,
                message: error.response?.data?.message || 'Greška pri kreiranju sezone'
            });
        } finally {
            setCreateLoading(false);
        }
    };

    const handleSeasonInputChange = (e) => {
        const { name, value } = e.target;
        setNewSeason(prev => ({
            ...prev,
            [name]: name === 'displayOrder' ? parseInt(value) || 0 : value
        }));
    };

    return (
        <div className="admin-container">
            <h1>Admin Panel</h1>

            <div className="admin-section">
                <h2>Sinkronizacija proizvoda</h2>
                <p>
                    Sinkronizira proizvode iz MinIO storage-a u bazu podataka. Ovo će skenirati sve SKU foldere
                    i ažurirati metapodatke proizvoda.
                </p>
                <button
                    className="admin-button"
                    onClick={handleSyncProducts}
                    disabled={syncLoading}
                >
                    {syncLoading ? 'Sinkronizacija u tijeku...' : 'Sinkroniziraj proizvode'}
                </button>

                {syncStatus && (
                    <div className={`status-message ${syncStatus.success ? 'success' : 'error'}`}>
                        {syncStatus.message}
                    </div>
                )}
            </div>

            <div className="admin-section">
                <h2>Upravljanje sezonama</h2>
                <form onSubmit={handleCreateSeason} className="create-season-form">
                    <div className="form-group">
                        <label htmlFor="prefix">Prefiks (za mapiranje SKU)</label>
                        <input
                            type="text"
                            id="prefix"
                            name="prefix"
                            value={newSeason.prefix}
                            onChange={handleSeasonInputChange}
                            placeholder="npr. 1251"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="seasonName">Naziv sezone</label>
                        <input
                            type="text"
                            id="seasonName"
                            name="seasonName"
                            value={newSeason.seasonName}
                            onChange={handleSeasonInputChange}
                            placeholder="npr. Proljeće 2023"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="displayOrder">Redoslijed prikaza</label>
                        <input
                            type="number"
                            id="displayOrder"
                            name="displayOrder"
                            value={newSeason.displayOrder}
                            onChange={handleSeasonInputChange}
                            min="0"
                        />
                    </div>

                    <button
                        type="submit"
                        className="admin-button"
                        disabled={createLoading}
                    >
                        {createLoading ? 'Kreiranje...' : 'Kreiraj sezonu'}
                    </button>
                </form>

                {createStatus && (
                    <div className={`status-message ${createStatus.success ? 'success' : 'error'}`}>
                        {createStatus.message}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminPage;