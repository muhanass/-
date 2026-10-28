# Runs the self-hosted app on your own domain. Build from the repository root,
# because the page itself lives in web/ and the server in host/.
FROM node:22-bookworm-slim

# better-sqlite3 ships prebuilt binaries for this platform, and falls back to
# compiling; the toolchain is here so that fallback cannot fail the build.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY host/package.json host/package-lock.json ./host/
RUN cd host && npm ci --omit=dev

COPY host ./host
COPY web ./web

# The database is the shop's records: it has to live on a disk that outlives
# the container, which is what mounting something at /data is for.
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=4s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "host/server.js"]
