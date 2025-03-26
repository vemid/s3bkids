import React, { useState } from 'react';
import axios from 'axios';
import { FaUser, FaLock } from 'react-icons/fa';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:9080';

const Login = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!username || !password) {
            setError('Molimo unesite korisničko ime i lozinku');
            return;
        }

        try {
            setLoading(true);
            setError('');

            const response = await axios.post(`${API_URL}/api/auth/login`, {
                username,
                password
            });

            // Spremi token u localStorage
            localStorage.setItem('token', response.data.token);
            localStorage.setItem('user', JSON.stringify(response.data.user));

            // Postavi Authorization header za buduće zahtjeve
            axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;

            // Obavijesti roditelja da je prijava uspješna
            onLogin(response.data.user);

        } catch (err) {
            console.error('Login error:', err);
            setError(err.response?.data?.error || 'Greška pri prijavi. Pokušajte ponovno.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-box">
                <h2>Prijava</h2>

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="username">
                            <FaUser className="input-icon" />
                            Korisničko ime
                        </label>
                        <input
                            type="text"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            disabled={loading}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">
                            <FaLock className="input-icon" />
                            Lozinka
                        </label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={loading}
                        />
                    </div>

                    <button
                        type="submit"
                        className="login-button"
                        disabled={loading}
                    >
                        {loading ? 'Prijava u tijeku...' : 'Prijava'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;