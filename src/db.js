/**
 * 极简 JSON 文件数据库
 * 纯 JS 实现，无任何原生依赖，保证在 Windows 上零编译跑通。
 * 每个集合存为 data/<name>.json，写入采用「临时文件 + rename」原子替换。
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

// 确保目录存在
for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readCollection(name) {
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return [];
  try {
    const raw = fs.readFileSync(fp, 'utf8').trim();
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error(`[db] 读取 ${name} 失败:`, e.message);
    return [];
  }
}

function writeCollection(name, data) {
  const fp = filePath(name);
  const tmp = `${fp}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, fp);
}

// 单对象存储（如 settings）
function readObject(name, def = {}) {
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return { ...def };
  try {
    const raw = fs.readFileSync(fp, 'utf8').trim();
    if (!raw) return { ...def };
    return { ...def, ...JSON.parse(raw) };
  } catch (e) {
    console.error(`[db] 读取 ${name} 失败:`, e.message);
    return { ...def };
  }
}

function writeObject(name, obj) {
  writeCollection(name, obj);
}

// 生成自增 ID（基于集合内最大 id）
function nextId(collection) {
  if (!collection.length) return 1;
  return Math.max(...collection.map((x) => x.id || 0)) + 1;
}

// 生成订单号：年月日时分秒 + 4位随机
function genOrderNo() {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, '0');
  const stamp =
    d.getFullYear().toString() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds());
  const rand = p(Math.floor(Math.random() * 10000), 4);
  return stamp + rand;
}

module.exports = {
  DATA_DIR,
  UPLOAD_DIR,
  readCollection,
  writeCollection,
  readObject,
  writeObject,
  nextId,
  genOrderNo,
};
