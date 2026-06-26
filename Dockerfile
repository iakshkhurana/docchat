# One image for both the app and the worker — they differ only by entrypoint
# (docker-compose sets `npm run start` vs `npm run worker`).
FROM node:20-slim AS base
WORKDIR /app
# Prisma needs openssl at runtime
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# ---- dependencies ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ---- runtime ----
FROM base AS runner
ENV NODE_ENV=production
# full tree (incl. tsx + source) so the same image can run `next start` or `tsx worker`
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start"]
