# 上线部署指南（让用户搜得到，电脑/手机都能访问）

> 程序已做好生产化改造：环境变量、安全 Cookie、SEO（robots/sitemap/meta）、手机端自适应、Docker / PM2 配置齐全。
> 下面三步：**买服务器 → 买域名并解析 → 让搜索引擎收录**。买服务器和域名需要你本人账号和付款，我无法代付，但每步都给了可照抄的命令。

---

## 一、为什么这类站建议用「海外服务器」
- ChatGPT 代充面向的用户需要访问 OpenAI，**海外（香港/新加坡/日本）服务器**延迟低、无需备案，最适合。
- 若用**中国大陆服务器 + 国内域名**，必须先做 **ICP 备案**（2–3 周，需企业/个人实名），且此类内容大概率备案不通过。**故强烈推荐海外服务器，免备案即可上线。**

---

## 二、方案 A：海外 VPS（推荐，数据可持久、最适合长期经营和拓展业务）

本程序用本地文件存数据（`data/` 目录），VPS 持久磁盘最契合。

### 1. 买一台 VPS
- 服务商：**Vultr / DigitalOcean / 阿里云国际站 / 腾讯云国际 / 搬瓦工(Bandwagon)** 等
- 配置：1 核 1G 起步（约 $5/月），地区选 **香港 / 新加坡 / 日本**
- 系统：**Ubuntu 22.04**

### 2. 上传代码并启动（SSH 登录服务器后执行）
```bash
# 安装 Node.js 20 与 PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo npm install -g pm2

# 上传代码：把 D:\代充网站 整个目录传到服务器 /opt/recharge
#   方式①用 scp： scp -r D:\代充网站 root@你的IP:/opt/recharge
#   方式②先 git push 到 GitHub，再 git clone
cd /opt/recharge
npm install --omit=dev

# 配置环境变量
cp .env.example .env
nano .env        # 修改 AUTH_SECRET 为长随机串，确认 NODE_ENV=production

# 用 PM2 常驻运行（先改 ecosystem.config.js 里的 AUTH_SECRET）
pm2 start ecosystem.config.js
pm2 save && pm2 startup     # 开机自启
```
此时 `http://你的服务器IP:3000` 已可访问。

### 3. 配 Nginx + HTTPS（绑定域名、自动 https）
```bash
sudo apt-get install -y nginx
sudo nano /etc/nginx/sites-available/recharge
```
粘贴（把 `你的域名` 换掉）：
```nginx
server {
    listen 80;
    server_name 你的域名.com www.你的域名.com;
    client_max_body_size 6m;          # 允许上传收款码/凭证
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/recharge /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 免费 HTTPS 证书（自动续期）
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名.com -d www.你的域名.com
```
完成后 `https://你的域名.com` 即正式上线，电脑/手机浏览器都能访问。

### 用 Docker 部署（可选，替代上面的 Node/PM2）
```bash
docker build -t gpt-recharge .
docker run -d --name recharge -p 3000:3000 \
  -e AUTH_SECRET=你的长随机串 -e NODE_ENV=production \
  -v /opt/recharge-data:/app/data gpt-recharge
```

---

## 三、方案 B：PaaS 一键托管（最简单，适合先快速上线）
**Render / Railway / Fly.io** 可从 GitHub 直接部署，免运维。注意：

- 必须为 `data/` 目录挂载**持久磁盘/卷**，否则重启后数据（订单、设置、收款码）会丢失：
  - Render：添加 **Disk**，Mount Path 填 `/opt/render/project/src/data`（或仓库内 `data` 路径）。
  - Railway / Fly.io：添加 **Volume** 挂载到 `/app/data`。
- 在平台「Environment」里设置：`NODE_ENV=production`、`AUTH_SECRET=长随机串`、`COOKIE_SECURE=1`。
- 启动命令 `node server.js`，端口用平台注入的 `PORT`（程序已自动读取）。

> ⚠️ 不要用 Vercel/Netlify 的 Serverless 函数部署本程序——它们文件系统是临时的，本地 JSON 数据会丢。要用 Vercel 需先把存储换成云数据库+对象存储。

---

## 四、买域名 + 解析（让网址好记好搜）
1. 注册商：**Namecheap / Cloudflare / 阿里云 / 腾讯云**。海外服务器搭配 Namecheap/Cloudflare 最省事。
2. 选好域名后，加两条 DNS 记录指向你的服务器 IP：
   | 类型 | 主机记录 | 值 |
   |------|---------|-----|
   | A | @ | 你的服务器IP |
   | A | www | 你的服务器IP |
3. 等待解析生效（几分钟~2 小时），再回到第二步跑 certbot 发 HTTPS 证书。

---

## 五、让用户「搜得到」（搜索引擎收录）
有了正式域名+HTTPS 后：
1. **Google**：到 [Google Search Console](https://search.google.com/search-console) 添加你的域名 → 提交 `https://你的域名/sitemap.xml`。
2. **Bing**：到 [Bing Webmaster Tools](https://www.bing.com/webmasters) 添加并提交 sitemap。
3. **百度**（针对国内用户）：到 [百度搜索资源平台](https://ziyuan.baidu.com) 提交（注意：百度对未备案的海外站收录较慢/有限）。
4. 程序已内置：`/robots.txt`、`/sitemap.xml`（自动用真实域名）、首页 SEO 标题/描述/关键词、社交分享卡片、手机端自适应。收录通常需要几天到几周，可在站长平台看进度。
5. 加速：让网址出现在你的社群/公众号/小红书等，外链越多收录越快。

---

## 六、上线前安全清单（务必做）
- [ ] 改掉默认管理员密码（用 admin 登录后…，当前可在「用户管理/数据文件」中处理；建议尽快加「修改密码」入口）
- [ ] 设置强随机 `AUTH_SECRET`
- [ ] `NODE_ENV=production` + `COOKIE_SECURE=1`（已随 HTTPS 生效）
- [ ] 关闭「模拟支付」（站点设置里取消勾选）
- [ ] 上传真实支付宝/微信收款码
- [ ] 定期备份 `data/` 目录（订单、用户、设置都在里面）

---

## 七、关于「拓展更多代充业务」
当前结构已为扩展预留：商品有 `category` 分类字段，新增业务（如 Claude、Midjourney、Netflix、Steam、游戏点卡代充等）只需在管理后台「商品管理」加分类和商品即可，无需改代码。
若业务做大，建议后续把本地 JSON 存储升级为 **SQLite/MySQL**（解决高并发写入），上传文件改用对象存储——这部分我可以再帮你改造。
