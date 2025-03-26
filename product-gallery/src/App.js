import React, { useContext } from 'react';
import ProductGallery from './components/ProductGallery';
import Login from './components/Login';
import { AuthProvider, AuthContext } from './context/AuthContext';

// Wrapper komponenta koja provjerava autentifikaciju
const AuthenticatedApp = () => {
    const { user, loading, initialized, login, logout } = useContext(AuthContext);

    // Ako provjeravamo autentifikaciju, prikaži loading
    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Učitavanje...</p>
            </div>
        );
    }

    // Ako korisnik nije prijavljen, prikaži login stranicu
    if (!user && initialized) {
        return <Login onLogin={login} />;
    }

    // Ako je korisnik prijavljen, prikaži glavnu aplikaciju
    return (
        <div className="app-container">
            <ProductGallery onLogout={logout} user={user} />
        </div>
    );
};

function App() {
    return (
        <AuthProvider>
            <AuthenticatedApp />
        </AuthProvider>
    );
}

export default App;