import axios from 'axios';

// Korištenje relativne putanje
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
    searchProducts: async (query) => {
        return api.get(`/products/search?query=${encodeURIComponent(query)}`);
    },
    syncProducts: async () => {
        return api.post('/products/sync');
    },
    downloadProductImages: async (sku) => {
        // Koristimo window.open za direktno preuzimanje
        const token = localStorage.getItem('token');
        window.open(`${API_URL}/products/${sku}/download?token=${token}`, '_blank');
    },
    downloadMultipleProducts: async (skus) => {
        // Za više proizvoda, šaljemo POST zahtjev
        const token = localStorage.getItem('token');
        window.open(`${API_URL}/products/download-multiple?token=${token}`, '_blank', '_self');

        // Kreiramo form za POST zahtjev
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = `${API_URL}/products/download-multiple?token=${token}`;
        form.target = '_blank';
        form.style.display = 'none';

        // Dodamo podatke
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'skus';
        input.value = JSON.stringify(skus);
        form.appendChild(input);

        // Dodamo form u dokument, submitamo ga i onda uklonimo
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
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