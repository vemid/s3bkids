FROM node:16-alpine

WORKDIR /app

# Instaliranje potrebnih paketa
RUN apk add --no-cache tzdata

# Postavljanje vremenske zone
ENV TZ=Europe/Belgrade

# Kopiranje package.json i package-lock.json
COPY package*.json ./

# Instaliranje zavisnosti
RUN npm install

# Kopiranje izvornog koda
COPY . .

# Pokretanje skripte
CMD ["node", "ftp-sync.js"]
