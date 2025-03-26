FROM node:18-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Relativna putanja za API, React će je koristiti za pozive
ENV REACT_APP_API_URL=/api

RUN npm run build

FROM nginx:alpine

# Kopiranje statičkih datoteka iz build faze
COPY --from=build /app/build /usr/share/nginx/html

# Kopiranje Nginx konfiguracije
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Izlaganje porta 8080 umjesto 80
EXPOSE 8010

CMD ["nginx", "-g", "daemon off;"]