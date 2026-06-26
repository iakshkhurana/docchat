1. wrote a docker compose with pgsql, chromadb, redis (caching). docker compose up -d to up the containers
2. installed next.js app thru create-next-app ; installed prisma , create prisma/schema.prisma, wrote prisma schema for pg & validated using cmd & migrated using npx prisma migrate dev --name init (issue faced : forgot to write generator and prismaClient)

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

3. 