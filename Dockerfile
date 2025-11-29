# Use officel puppeteer image
FROM ghcr.io/puppeteer/puppeteer:latest

USER root

COPY . /app
WORKDIR /app

RUN chown -R pptruser:pptruser /app

USER pptruser

RUN npm install

CMD ["node", "server.js"]

