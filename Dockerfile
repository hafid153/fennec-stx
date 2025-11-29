FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update && \
    apt-get install -y \
        chromium \
        libnss3 libxss1 libatk-bridge2.0-0 libgtk-3-0 \
        libdrm2 libgbm1 libasound2 libxkbcommon0 libxcomposite1 libxrandr2 \
        fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
        wget gnupg \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN mkdir -p /app/session_info /app/data

EXPOSE 3000

CMD ["node", "server.js"]
