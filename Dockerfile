FROM node:18-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN mkdir -p server/data server/uploads/herbs

ENV PORT=7860
ENV NODE_ENV=production

EXPOSE 7860

CMD ["node", "server/app.js"]
