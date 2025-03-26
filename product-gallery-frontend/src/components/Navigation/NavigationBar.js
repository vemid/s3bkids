import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './NavigationBar.css';

const NavigationBar = () => {
    const { currentUser, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <nav className="navbar">
            <div className="navbar-brand">
                <Link to="/">Galerija Proizvoda</Link>
            </div>
            <div className="navbar-menu">
                {currentUser ? (
                    <>
                        <Link to="/products" className="navbar-item">
                            Proizvodi
                        </Link>
                        <Link to="/seasons" className="navbar-item">
                            Sezone
                        </Link>
                        {currentUser.role === 'admin' && (
                            <Link to="/admin" className="navbar-item">
                                Admin
                            </Link>
                        )}
                        <div className="navbar-item user-menu">
                            <span>Korisnik: {currentUser.username}</span>
                            <button onClick={handleLogout} className="logout-button">
                                Odjava
                            </button>
                        </div>
                    </>
                ) : (
                    <Link to="/login" className="navbar-item">
                        Prijava
                    </Link>
                )}
            </div>
        </nav>
    );
};

export default NavigationBar;