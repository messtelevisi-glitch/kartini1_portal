FROM node:22-slim

WORKDIR /app

COPY package.json .npmrc ./
RUN npm install --legacy-peer-deps --no-audit --no-fund

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.ts"]
