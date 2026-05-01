FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src
COPY config.yaml.example ./config.yaml

RUN npm run build && npm run build:ui && npm prune --omit=dev

ARG BUILD_VERSION=dev
ENV NODE_ENV=production
ENV HCW_VERSION=${BUILD_VERSION}

CMD ["node", "--enable-source-maps", "dist/src/index.js"]
