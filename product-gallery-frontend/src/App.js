import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import NavigationBar from './components/Navigation/NavigationBar';
import Login from './components/Auth/Login';
import ProductsPage from './pages/Products/ProductsPage';
import ProductDetailPage from './pages/ProductDetail/ProductDetailPage';
import AdminPage from './pages/Admin/AdminPage';
import './App.css';

// Za stranicu sezone koristimo privremeni placeholder
const Seasons = () => <div className="container">Stranica za sezone će biti implementirana uskoro.</div>;
const NotFound = () => <div className="container">Stranica nije pronađena</div>;

// Protected Route komponenta
const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();

    if (loading) {
        return <div className="loading-container">Učitavanje...</div>;
    }

    if (!isAuthenticated()) {
        return <Navigate to="/login" />;
    }

    return children;
};

// Admin Route komponenta
const AdminRoute = ({ children }) => {
    const { currentUser, loading } = useAuth();

    if (loading) {
        return <div className="loading-container">Učitavanje...</div>;
    }

    if (!currentUser || currentUser.role !== 'admin') {
        return <Navigate to="/products" />;
    }

    return children;
};

function AppContent() {
    const { isAuthenticated } = useAuth();

    return (
        <Router>
            <div className="app">
                <NavigationBar />
                <main className="content">
                    <Routes>
                        <Route
                            path="/"
                            element={
                                isAuthenticated() ? (
                                    <Navigate to="/products" />
                                ) : (
                                    <Navigate to="/login" />
                                )
                            }
                        />
                        <Route path="/login" element={<Login />} />
                        <Route
                            path="/products"
                            element={
                                <ProtectedRoute>
                                    <ProductsPage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/products/:sku"
                            element={
                                <ProtectedRoute>
                                    <ProductDetailPage />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/seasons"
                            element={
                                <ProtectedRoute>
                                    <Seasons />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/admin"
                            element={
                                <AdminRoute>
                                    <AdminPage />
                                </AdminRoute>
                            }
                        />
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </main>
            </div>
        </Router>
    );
}

function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
}

export default App;