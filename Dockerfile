# ChatGPT 代充平台 - 生产镜像
FROM node:20-alpine

WORKDIR /app

# 先装依赖（利用缓存）
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# 拷贝源码
COPY . .

# 数据目录（JSON 存储 + 上传文件），部署时建议挂载为持久卷
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
