FROM node:18-alpine

WORKDIR /app

# Kopiraj package.json i package-lock.json (ako postoji)
COPY package*.json ./

# Instaliraj dependencies
RUN npm install

# Kopiraj source code
COPY . .

# Kreiraj temp direktorij za ZIP operacije
RUN mkdir -p temp && chmod 777 temp

# Izloži port koji će koristiti app
EXPOSE 9080

# Pokreni app
CMD ["node", "index.js"]