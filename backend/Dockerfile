# Local-development image for the Express API.
#
# Debian-based (-slim), not Alpine: bcrypt ships glibc prebuilds only, so an
# Alpine (musl) image would fall back to compiling it from source.
ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-slim

WORKDIR /app
RUN chown node:node /app
USER node

# Dependencies first so this layer is cached until package*.json changes.
# devDependencies (jest, wrangler) are not needed to run the server.
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev

# .dockerignore keeps .env*, node_modules and coverage out of the image.
COPY --chown=node:node . .

EXPOSE 5000
CMD ["node", "src/server.js"]
