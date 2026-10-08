# potolok-render: Node 22 + headless Chromium (swiftshader WebGL) для серверного 3D-рендера.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app
COPY package.json ./
# playwright (CLI) ставит только headless-shell Chromium + системные библиотеки; в рантайме
# нужен лишь playwright-core. Шрифты не нужны — на канвасе нет текста.
RUN npm install --no-audit --no-fund --include=dev \
 && npx playwright install --with-deps --only-shell chromium \
 && npm prune --omit=dev \
 && rm -rf /var/lib/apt/lists/* /root/.npm /tmp/*

COPY server.mjs ./

EXPOSE 8080
CMD ["node", "server.mjs"]
