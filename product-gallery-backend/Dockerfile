FROM node:16-alpine

WORKDIR /app

COPY package*.json ./

# Čista instalacija bez cache-a
RUN npm cache clean --force && \
    npm install --no-cache

COPY . .

# Postavite više memorije za Node.js
ENV NODE_OPTIONS="--max-old-space-size=4096"

EXPOSE 3500

# Koristimo direktno node umjesto npm start
CMD ["node", "src/app.js"]