import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: '/api',
  timeout: 10000, // 10 second timeout fallback
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token from localStorage to every request
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Global response interceptor to handle errors cleanly
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    // Detect Vite proxy error when backend Express server is not running on port 5000
    if (
      !error.response ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNABORTED' ||
      (error.response.status === 500 && typeof error.response.data === 'string' && error.response.data.includes('proxy error'))
    ) {
      const offlineError = new Error(
        'Backend server is offline or unreachable. Please verify server status.'
      );
      (offlineError as any).response = {
        status: 503,
        data: {
          success: false,
          message: 'Backend server is offline or unreachable. Please verify server status.',
        },
      };
      return Promise.reject(offlineError);
    }

    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      const publicPaths = ['/login', '/register', '/signup', '/'];
      if (!publicPaths.some((p) => window.location.pathname.startsWith(p))) {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
