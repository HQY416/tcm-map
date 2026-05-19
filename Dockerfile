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
RUN cp -r server/uploads/herbs server/init-uploads/herbs 2>/dev/null; mkdir -p server/init-uploads/herbs
RUN cp server/uploads/video_*.mp4 server/init-uploads/ 2>/dev/null; true

RUN chmod +x start.sh

ENV PORT=7860
ENV NODE_ENV=production

EXPOSE 7860

CMD ["./start.sh"]
