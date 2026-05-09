FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src/ src/
RUN npm run build

FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist/ dist/
COPY docs/ docs/
COPY examples/ examples/
COPY README.md README.en.md LICENSE ./

ENTRYPOINT ["node", "dist/server.js"]
