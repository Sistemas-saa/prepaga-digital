FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
# Solo `npm ci`: instala EXACTAMENTE lo que dice package-lock.json. Si el lock no
# coincide con package.json, el build falla en vez de instalar otras versiones
# sin avisar (antes habia un fallback a `npm install`, que no es reproducible).
# Si falla por eso: correr `npm install` en el repo, commitear el lock y rebuild.
RUN npm ci --legacy-peer-deps --no-audit --no-fund --prefer-offline

COPY . .

# .git no entra a la imagen (.dockerignore), asi que build-version.json diria
# commit "unknown". Pasarlo al construir:
#   docker compose build --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) --build-arg GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
ARG GIT_COMMIT=unknown
ARG GIT_BRANCH=unknown
ENV GIT_COMMIT=$GIT_COMMIT GIT_BRANCH=$GIT_BRANCH
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
