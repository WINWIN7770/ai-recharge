/**
 * 上传处理：本地模式写入磁盘并返回 /uploads/xxx；
 * 云模式（MongoDB / 临时文件系统）转为 base64 data URL 随数据持久化。
 */
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { UPLOAD_DIR, USE_MONGO } = require('./db');

// 统一用内存存储，由 saveUpload 决定落地方式
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /image\//.test(file.mimetype)),
});

function saveUpload(file, prefix = 'img') {
  if (!file) return '';
  if (USE_MONGO) {
    // 云端：存为 data URL，跟随数据库持久化
    const mime = file.mimetype || 'image/png';
    return `data:${mime};base64,${file.buffer.toString('base64')}`;
  }
  // 本地：写入磁盘
  const ext = (path.extname(file.originalname || '').slice(0, 10)) || '.png';
  const name = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), file.buffer);
  return `/uploads/${name}`;
}

module.exports = { memoryUpload, saveUpload };
