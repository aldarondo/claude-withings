FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

ENV PORT=8769
EXPOSE 8769

CMD ["node", "src/serve.js"]
