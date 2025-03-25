FROM node:16

WORKDIR /usr/src/app

# Instaliraj potrebne pakete za Sharp
RUN apt-get update && apt-get install -y \
    libvips-dev \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Kopiraj package.json i package-lock.json
COPY package*.json ./

# Instaliraj zavisnosti
RUN npm install

# Kopiraj source kod
COPY . .

# Kreiraj temp direktorijum za slike
RUN mkdir -p temp && chmod 777 temp

# Pokreni servis
CMD ["node", "webhook-image-resize-service.js"]

# Izloži port za webhook
EXPOSE 3000
