# Desarrollo (docker-compose.yml). Misma versión de Node que Dockerfile.prod
FROM node:24.22.2-alpine3.24

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
