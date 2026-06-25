FROM node:22-alpine

WORKDIR /app

COPY ax42-image-storage.mjs /app/ax42-image-storage.mjs

ENV NODE_ENV=production
ENV PORT=18142
ENV MEDIA_ROOT=/data/media

EXPOSE 18142
VOLUME ["/data/media"]

USER node

CMD ["node", "/app/ax42-image-storage.mjs"]
