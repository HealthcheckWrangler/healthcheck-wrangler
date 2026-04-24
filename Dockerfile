FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY config.yaml.example ./config.yaml

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production

EXPOSE 9464

CMD ["node", "--enable-source-maps", "dist/src/index.js"]
