FROM node:20-bookworm

RUN apt-get update && apt-get install -y git ffmpeg && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund

# Tambahkan baris ini supaya folder volume punya izin akses
RUN mkdir -p /app/auth_info && chmod 777 /app/auth_info

COPY . .

# Tambahkan variabel environment untuk PORT (Railway butuh ini)
ENV PORT=8080
EXPOSE 8080

CMD ["node", "index.js"]
