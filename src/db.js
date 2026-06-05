/**
 * 双模式存储层
 * - 未设置 MONGODB_URI：使用本地 JSON 文件（开发/单机）
 * - 设置了 MONGODB_URI：使用 MongoDB（适合 Render 等免费托管，数据持久不丢失）
 *
 * 设计：启动时把全部数据载入内存缓存 → 读取同步（routes 无需改动），
 *       写入更新缓存并异步持久化（写操作的 route 需 await）。
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const MONGO_URI = process.env.MONGODB_URI || '';
const USE_MONGO = !!MONGO_URI;

for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const cache = {};        // 内存缓存：{ [name]: array | object }
let mongoDb = null;      // MongoDB Db 实例
let kvCol = null;        // 键值集合：{ _id: name, data: <array|object> }

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

// ---- 持久化（写后端） ----
async function persist(name) {
  const value = cache[name];
  if (USE_MONGO) {
    await kvCol.replaceOne({ _id: name }, { _id: name, data: value }, { upsert: true });
  } else {
    const fp = filePath(name);
    const tmp = `${fp}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmp, fp);
  }
}

// ---- 启动初始化：连接并载入缓存 ----
async function init() {
  if (USE_MONGO) {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    await client.connect();
    const dbName = process.env.MONGODB_DB || 'recharge';
    mongoDb = client.db(dbName);
    kvCol = mongoDb.collection('kv');
    const docs = await kvCol.find({}).toArray();
    for (const d of docs) cache[d._id] = d.data;
    console.log(`[db] 已连接 MongoDB（库: ${dbName}），载入 ${docs.length} 个集合`);
  } else {
    // 本地文件：把已存在的 .json 载入缓存
    for (const f of fs.readdirSync(DATA_DIR)) {
      if (!f.endsWith('.json')) continue;
      const name = f.replace(/\.json$/, '');
      try {
        const raw = fs.readFileSync(filePath(name), 'utf8').trim();
        cache[name] = raw ? JSON.parse(raw) : [];
      } catch (e) {
        console.error(`[db] 载入 ${name} 失败:`, e.message);
      }
    }
    console.log('[db] 使用本地 JSON 文件存储');
  }
}

// ---- 读（同步，来自缓存） ----
function readCollection(name) {
  if (!Array.isArray(cache[name])) cache[name] = [];
  return cache[name];
}

function readObject(name, def = {}) {
  if (cache[name] && typeof cache[name] === 'object' && !Array.isArray(cache[name])) {
    return { ...def, ...cache[name] };
  }
  return { ...def };
}

// ---- 写（异步，更新缓存 + 持久化） ----
async function writeCollection(name, data) {
  cache[name] = data;
  await persist(name);
}

async function writeObject(name, obj) {
  cache[name] = obj;
  await persist(name);
}

// 是否已存在某集合/对象的数据
function has(name) {
  return cache[name] !== undefined;
}

function nextId(collection) {
  if (!collection.length) return 1;
  return Math.max(...collection.map((x) => x.id || 0)) + 1;
}

function genOrderNo() {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, '0');
  const stamp =
    d.getFullYear().toString() +
    p(d.getMonth() + 1) + p(d.getDate()) +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  return stamp + p(Math.floor(Math.random() * 10000), 4);
}

module.exports = {
  DATA_DIR,
  UPLOAD_DIR,
  USE_MONGO,
  init,
  readCollection,
  writeCollection,
  readObject,
  writeObject,
  has,
  nextId,
  genOrderNo,
};
