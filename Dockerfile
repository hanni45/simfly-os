FROM ghcr.io/puppeteer/puppeteer:21.5.0

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "src/index.js"]
