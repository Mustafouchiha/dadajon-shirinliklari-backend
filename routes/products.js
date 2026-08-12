const express = require("express");
const Product = require("../models/Product");

const router = express.Router();

function formatProduct(p) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    price: Number(p.price),
    weight: p.weight || "",
    photo: p.photo,
    description: p.description || "",
    isFeatured: p.is_featured,
    createdAt: p.created_at,
  };
}

// GET /api/products — faol tortlar katalogi (mehmon ham ko'ra oladi)
router.get("/", async (req, res) => {
  try {
    const { category, search } = req.query;
    const rows = await Product.findActive({ category, search });
    res.json(rows.map(formatProduct));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/products/:id — bitta mahsulot
router.get("/:id", async (req, res) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p || !p.is_active) return res.status(404).json({ message: "Topilmadi" });
    res.json(formatProduct(p));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
