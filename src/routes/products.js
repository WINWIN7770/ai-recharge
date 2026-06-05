const express = require('express');
const { readCollection } = require('../db');

const router = express.Router();

// 公开：商品列表（仅上架商品）
router.get('/', (req, res) => {
  const products = readCollection('products').filter((p) => p.active);
  const { category } = req.query;
  const list = category ? products.filter((p) => p.category === category) : products;
  res.json({ products: list });
});

// 公开：商品详情
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const product = readCollection('products').find((p) => p.id === id && p.active);
  if (!product) return res.status(404).json({ error: '商品不存在或已下架' });
  res.json({ product });
});

module.exports = router;
