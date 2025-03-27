FROM node:18-alpine

WORKDIR /app

# Kopiranje package.json i package-lock.json (ako postoji)
COPY package*.json ./

# Instalacija zavisnosti
RUN npm install

# Kopiranje izvornog koda
COPY . .

# Kreiranje temp direktorijuma
RUN mkdir -p /app/temp

# Komanda za pokretanje servisa
CMD ["node", "minio-to-ftp-sync.js"]