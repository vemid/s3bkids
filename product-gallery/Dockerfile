# Build faza
FROM node:18-alpine as build

WORKDIR /app

# Kopiraj package.json i package-lock.json (ako postoji)
COPY package*.json ./

# Instaliraj dependencies
RUN npm install

# Kopiraj source code
COPY . .

# Kreiraj production build
RUN npm run build

# Produkcijska faza
FROM nginx:alpine

# Kopiraj build artefakte u Nginx
COPY --from=build /app/build /usr/share/nginx/html

# Kopiraj Nginx konfiguraciju
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Izloži port
EXPOSE 9070

# Pokreni Nginx
CMD ["nginx", "-g", "daemon off;"]