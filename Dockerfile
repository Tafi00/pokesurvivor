FROM node:20-alpine
WORKDIR /app
COPY . .
RUN mkdir -p /app/data /app/assets
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
