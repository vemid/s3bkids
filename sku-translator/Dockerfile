FROM node:16

WORKDIR /usr/src/app

# Instaliranje Java JDK za JDBC
RUN apt-get update && apt-get install -y \
    default-jdk \
    && rm -rf /var/lib/apt/lists/*

# Kreiranje direktorijuma za JDBC drajvere
RUN mkdir -p drivers

# Kopiraj package.json i package-lock.json
COPY package*.json ./

# Instaliraj zavisnosti
RUN npm install
# Opciono: Mogu se instalirati samo ako postoje
RUN npm install jdbc node-jt400 --no-save || true

# Kopiraj source kod
COPY sku-translator-service.js ./

# Kopiraj JDBC drajvere (ako postoje)
COPY ./drivers/* ./drivers/ || true

# Izloži port
EXPOSE 3002

# Pokreni servis
CMD ["node", "sku-translator-service.js"]