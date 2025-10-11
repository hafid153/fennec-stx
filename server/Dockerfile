# Utilise l'image Puppeteer officielle
FROM ghcr.io/puppeteer/puppeteer:latest

# Copie ton code
COPY . /app
WORKDIR /app

# Installe les dépendances Node.js (dans ton app)
RUN npm install

# Lance ton serveur
CMD ["node", "server.js"]
