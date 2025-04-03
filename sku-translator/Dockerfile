FROM node:16

WORKDIR /usr/src/app

# Instaliranje Java JDK za JDBC
RUN apt-get update && apt-get install -y \
    default-jdk \
    && rm -rf /var/lib/apt/lists/*

# Kreiranje direktorijuma za JDBC drajvere
RUN mkdir -p drivers

# Kopiraj package.json i sku-translator-service.js
COPY package.json sku-translator-service.js ./

# Instaliraj zavisnosti
RUN npm install
RUN npm install jdbc node-jt400 --no-save || true

# Izloži port
EXPOSE 3002

# Pokreni servis
CMD ["node", "sku-translator-service.js"]