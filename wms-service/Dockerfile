FROM node:20-alpine

WORKDIR /usr/src/app

# Cài đặt OpenSSL cần thiết cho Prisma trên Alpine
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

RUN npx prisma generate

EXPOSE 5001

CMD ["npm", "start"]
