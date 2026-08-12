const express = require("express");
const Order = require("../models/Order");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// POST /api/orders — savatdan buyurtma yaratish (faqat do'kondan olib ketish)
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { items, comment } = req.body;
    const customerName = (req.body.customerName || req.user.name || "").trim();
    const customerPhone = (req.body.customerPhone || req.user.phone || "").trim();

    if (!customerName || !customerPhone) {
      return res.status(400).json({ message: "Ism va telefon majburiy" });
    }
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ message: "Savat bo'sh" });
    }

    const order = await Order.create({
      userId: req.user.id,
      customerName,
      customerPhone,
      comment: comment || "",
      items: items.map((it) => ({ productId: it.productId || it.id, qty: it.qty })),
    });

    const { notifyOperator } = require("../bot");
    const lines = order.items.map((it) => `• ${it.name} × ${it.qty}`).join("\n");
    notifyOperator(
      `🆕 *Yangi buyurtma!*\n\n` +
      `📋 Kod: *${order.orderCode}*\n` +
      `👤 ${customerName} (${customerPhone})\n\n` +
      `${lines}\n\n` +
      `💰 Jami: ${order.total.toLocaleString()} so'm` +
      (comment ? `\n📝 Izoh: ${comment}` : "")
    ).catch(() => {});

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/orders/my — mening buyurtmalarim tarixi
router.get("/my", authMiddleware, async (req, res) => {
  try {
    const orders = await Order.findMineByUser(req.user.id);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/orders/:code — QR ko'rsatish / holatni tekshirish uchun bitta buyurtma
router.get("/:code", authMiddleware, async (req, res) => {
  try {
    const order = await Order.findByCode(req.params.code.toUpperCase());
    if (!order || order.userId !== req.user.id) {
      return res.status(404).json({ message: "Buyurtma topilmadi" });
    }
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/orders/:code/cancel — mijoz o'z "Yangi" statusdagi buyurtmasini bekor qilishi mumkin
router.put("/:code/cancel", authMiddleware, async (req, res) => {
  try {
    const order = await Order.cancel(req.params.code.toUpperCase(), req.user.id);
    if (!order) return res.status(400).json({ message: "Bekor qilib bo'lmaydi" });
    res.json({ message: "Buyurtma bekor qilindi" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
