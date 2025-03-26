import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import NavigationBar from './components/Navigation/NavigationBar';
import Login from './components/Auth/Login';
import './App.css';

// Placeholder komponente - Kasnije ćemo ih zamijeniti pravim komponentama
const Products = () => <div>Proizvodi</div>;
const ProductDetail = () => <div>Detalji proizvoda</div>;
const Seasons = () => <div>Sezone</div>;
const Admin = () => <div>Admin Panel</div>;
const NotFound = () => <div>Stranica nije pronađena</div>;

// Protected Route komponenta
const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();

    if (loading) {
        return <div>Učitavanje...</div>;
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
        return <div>Učitavanje...</div>;
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
                                    <Products />
                                </ProtectedRoute>
                            }
                        />
                        <Route
                            path="/products/:sku"
                            element={
                                <ProtectedRoute>
                                    <ProductDetail />
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
                                    <Admin />
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