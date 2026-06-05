// PM2 进程管理配置（VPS 部署用）
// 用法： pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'gpt-recharge',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 3000,
        COOKIE_SECURE: '1',
        // 上线前改成你自己的长随机字符串：
        AUTH_SECRET: 'please-change-this-to-a-long-random-secret',
      },
    },
  ],
};
