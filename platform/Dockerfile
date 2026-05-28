FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache tini python3 py3-pip
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY package.json ./
COPY server ./server
COPY projects ./projects
COPY engines ./engines
COPY templates ./templates
COPY scripts ./scripts
COPY lib ./lib
COPY instrumentation.ts ./
ENV NODE_ENV=production
ENV PORT=8082
EXPOSE 8082
ENTRYPOINT ["/sbin/tini","--"]
CMD ["npm", "start"]
