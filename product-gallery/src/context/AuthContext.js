import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:9080';

// Kreiraj context
export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [initialized, setInitialized] = useState(false);

    // Provjeri je li korisnik već prijavljen (pri učitavanju aplikacije)
    useEffect(() => {
        const checkLoggedIn = async () => {
            try {
                const token = localStorage.getItem('token');

                if (token) {
                    // Postavi token u headers za sve buduće zahtjeve
                    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

                    // Dohvati podatke o trenutnom korisniku
                    const response = await axios.get(`${API_URL}/api/auth/me`);
                    setUser(response.data);
                }
            } catch (error) {
                console.error('Error checking authentication:', error);
                // Ako dođe do greške, očisti local storage
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                delete axios.defaults.headers.common['Authorization'];
            } finally {
                setLoading(false);
                setInitialized(true);
            }
        };

        checkLoggedIn();
    }, []);

    // Funkcija za prijavu korisnika
    const login = (userData) => {
        setUser(userData);
    };

    // Funkcija za odjavu korisnika
    const logout = () => {
        // Očisti podatke
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        delete axios.defaults.headers.common['Authorization'];
        setUser(null);
    };

    // Pruži context vrijednosti svoj djeci
    return (
        <AuthContext.Provider value={{ user, loading, initialized, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};