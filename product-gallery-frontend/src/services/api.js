import axios from 'axios';

// Korištenje relativne putanje (React će ovo pretvoriti u absolutnu putanju)
const API_URL = process.env.REACT_APP_API_URL || '/api';

// Kreiranje Axios instance
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor za dodavanje tokena u zahtjeve
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Auth servisi
export const authService = {
    login: async (username, password) => {
        const response = await api.post('/auth/login', { username, password });
        if (response.data.token) {
            localStorage.setItem('token', response.data.token);
            localStorage.setItem('user', JSON.stringify(response.data.user));
        }
        return response.data;
    },
    logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    },
    getCurrentUser: () => {
        return JSON.parse(localStorage.getItem('user'));
    },
    isAuthenticated: () => {
        return !!localStorage.getItem('token');
    },
};

// Product servisi
export const productService = {
    getAllProducts: async () => {
        return api.get('/products');
    },
    getProductBySku: async (sku) => {
        return api.get(`/products/${sku}`);
    },
    getProductsBySeasons: async () => {
        return api.get('/products/grouped-by-seasons');
    },
    syncProducts: async () => {
        return api.post('/products/sync');
    },
    downloadProductImages: async (sku) => {
        // Koristimo window.open umjesto axios za direktno preuzimanje
        const token = localStorage.getItem('token');
        window.open(`${API_URL}/products/${sku}/download?token=${token}`, '_blank');
    }
};

// Season servisi
export const seasonService = {
    getAllSeasons: async () => {
        return api.get('/seasons');
    },
    getSeasonById: async (id) => {
        return api.get(`/seasons/${id}`);
    },
    createSeason: async (seasonData) => {
        return api.post('/seasons', seasonData);
    },
    updateSeason: async (id, seasonData) => {
        return api.put(`/seasons/${id}`, seasonData);
    },
    deleteSeason: async (id) => {
        return api.delete(`/seasons/${id}`);
    },
};

export default api;