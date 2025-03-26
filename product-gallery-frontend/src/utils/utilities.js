/**
 * Transformira MinIO URL iz internog Docker oblika u javno dostupni URL
 *
 * @param {string} url - Izvorni URL iz backedna (npr. http://minio:9000/...)
 * @returns {string} Transformirani URL (npr. /minio/...)
 */
export const transformMinioUrl = (url) => {
    if (!url) return url;

    // Zamijeni interni minio url s putanjom /minio
    return url.replace(/http:\/\/minio:9000\//g, '/minio/');
};