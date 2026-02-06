FROM node:20-alpine
WORKDIR /app
COPY . .
COPY package*.json ./
RUN npm ci --include=dev
RUN npm run build
EXPOSE 4000
CMD ["npx","http-server","dist","-c-1","-a","0.0.0.0","-p","4000"]
