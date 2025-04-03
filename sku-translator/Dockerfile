FROM node:16

WORKDIR /usr/src/app

# Kopiraj package.json i package-lock.json
COPY package.json ./
COPY package-lock.json* ./

# Instaliraj zavisnosti
RUN npm install
RUN npm install sequelize informix --save

# Kopiraj source kod
COPY sku-translator-service.js ./

# Izloži port
EXPOSE 3002

# Pokreni servis
CMD ["node", "sku-translator-service.js"]