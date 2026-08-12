const express = require("express");
const { query } = require("../db");
const Product = require("../models/Product");
const Order = require("../models/Order");
const operatorAuth = require("../middleware/operatorAuth");

const router = express.Router();
router.use(operatorAuth);

function isMainOp(req) {
  return !!req.isMainOperator;
}

// Frontend: hozirgi foydalanuvchi operatormi va bosh operatormi shu orqali aniqlanadi
router.get("/me", (req, res) => {
  res.json({ isOperator: true, isMainOperator: !!req.isMainOperator, role: req.user.role });
});

function formatProductAdmin(p) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    price: Number(p.price),
    weight: p.weight || "",
    photo: p.photo,
    description: p.description || "",
    isFeatured: p.is_featured,
    isActive: p.is_active,
    sortOrder: p.sort_order,
    createdAt: p.created_at,
  };
}

// ── Mahsulotlar (menyu) ───────────────────────────────────────────
router.get("/products", async (req, res) => {
  try {
    const rows = await Product.findAll({ q: (req.query.q || "").trim() });
    res.json(rows.map(formatProductAdmin));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/products", async (req, res) => {
  try {
    const { name, category, price, weight, photo, description, isFeatured } = req.body;
    if (!name || price === undefined || price === null) {
      return res.status(400).json({ message: "Nomi va narxi majburiy" });
    }
    const product = await Product.create({ name, category, price, weight, photo, description, isFeatured });
    res.status(201).json(formatProductAdmin(product));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/products/:id", async (req, res) => {
  try {
    const updated = await Product.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Topilmadi yoki o'zgartiriladigan maydon yo'q" });
    res.json(formatProductAdmin(updated));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/products/:id/toggle-active", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Topilmadi" });
    const updated = await Product.setActive(req.params.id, !product.is_active);
    res.json(formatProductAdmin(updated));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/products/:id", async (req, res) => {
  try {
    const ok = await Product.remove(req.params.id);
    if (!ok) return res.status(404).json({ message: "Topilmadi" });
    res.json({ message: "O'chirildi" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Buyurtmalar ────────────────────────────────────────────────────
router.get("/orders", async (req, res) => {
  try {
    const status = req.query.status || "";
    const orders = await Order.findAll({ status });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/orders/:code", async (req, res) => {
  try {
    const order = await Order.findByCode(req.params.code.toUpperCase());
    if (!order) return res.status(404).json({ message: "Buyurtma topilmadi" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Buyurtmani "tayyor" deb belgilash — mijozga xabar boradi, do'konga kelib QR ko'rsatishi kerak
router.put("/orders/:code/ready", async (req, res) => {
  try {
    const order = await Order.setStatus(req.params.code.toUpperCase(), "ready");
    if (!order) return res.status(404).json({ message: "Buyurtma topilmadi" });

    const { rows } = await query("SELECT tg_chat_id FROM users WHERE id = $1", [order.user_id]);
    if (rows[0]?.tg_chat_id) {
      const { notifyUser } = require("../bot");
      await notifyUser(rows[0].tg_chat_id,
        `🍰 *Buyurtmangiz tayyor!*\n\n📋 Kod: *${order.order_code}*\n\n` +
        `Do'konga kelib QR kodingizni ko'rsating.`,
        { parse_mode: "Markdown" }
      ).catch(() => {});
    }
    res.json({ message: "Tayyor deb belgilandi" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// QR skanerlash natijasida chaqiriladi — buyurtmani operator mijozga topshirdi
router.put("/orders/:code/pickup", async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const existing = await Order.findByCode(code);
    if (!existing) return res.status(404).json({ message: "Bunday buyurtma topilmadi" });
    if (existing.status === "picked_up") {
      return res.status(400).json({ message: "Bu buyurtma allaqachon berilgan", order: existing });
    }
    if (existing.status === "cancelled") {
      return res.status(400).json({ message: "Bu buyurtma bekor qilingan" });
    }

    const order = await Order.markPickedUp(code, req.user);
    if (!order) return res.status(400).json({ message: "Berib bo'lmadi" });

    const { rows } = await query("SELECT tg_chat_id FROM users WHERE id = $1", [order.user_id]);
    if (rows[0]?.tg_chat_id) {
      const { notifyUser } = require("../bot");
      await notifyUser(rows[0].tg_chat_id,
        `✅ *Buyurtmangiz berildi!*\n\n📋 Kod: ${order.order_code}\n\nXaridingiz uchun rahmat! 🍰`,
        { parse_mode: "Markdown" }
      ).catch(() => {});
    }

    res.json({ message: "Mijozga berildi", order: await Order.findByCode(code) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Foydalanuvchilar ─────────────────────────────────────────────
router.get("/users", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    let rows;
    if (!q) {
      ({ rows } = await query(
        "SELECT id, name, phone, telegram, tg_chat_id, is_blocked, role, joined FROM users ORDER BY joined DESC LIMIT 50"
      ));
    } else {
      ({ rows } = await query(
        `SELECT id, name, phone, telegram, tg_chat_id, is_blocked, role, joined FROM users
         WHERE phone ILIKE $1 OR name ILIKE $1
         ORDER BY joined DESC LIMIT 30`,
        [`%${q}%`]
      ));
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/users/:id/block", async (req, res) => {
  try {
    await query("UPDATE users SET is_blocked = TRUE WHERE id = $1", [req.params.id]);
    res.json({ message: "Bloklandi" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/users/:id/unblock", async (req, res) => {
  try {
    await query("UPDATE users SET is_blocked = FALSE WHERE id = $1", [req.params.id]);
    res.json({ message: "Blok ochildi" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Operatorlar ─────────────────────────────────────────────────
router.get("/operators", async (req, res) => {
  try {
    const { mainOperatorPhone } = operatorAuth;
    const { rows } = await query(
      `SELECT id, name, phone, telegram, role, joined FROM users
       WHERE role = 'operator' OR phone = $1 ORDER BY joined ASC`,
      [mainOperatorPhone()]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/operators", async (req, res) => {
  if (!isMainOp(req)) {
    return res.status(403).json({ message: "Faqat bosh operator operator qo'sha oladi" });
  }
  try {
    const search = (req.body.identifier || req.body.phone || "").trim();
    if (!search) return res.status(400).json({ message: "Telefon yoki ism majburiy" });

    const phoneKey = search.replace(/\D/g, "").slice(-9);
    let targetUser = null;
    if (phoneKey.length === 9) {
      const { rows } = await query("SELECT * FROM users WHERE phone = $1 LIMIT 1", [phoneKey]);
      targetUser = rows[0] || null;
    }
    if (!targetUser) {
      const { rows } = await query(
        "SELECT * FROM users WHERE name ILIKE $1 ORDER BY joined DESC LIMIT 1",
        [`%${search}%`]
      );
      targetUser = rows[0] || null;
    }
    if (!targetUser) return res.status(404).json({ message: "Foydalanuvchi topilmadi" });

    const { rows: updated } = await query(
      "UPDATE users SET role = 'operator' WHERE id = $1 RETURNING id, name, phone, role",
      [targetUser.id]
    );
    res.json({ message: "Operator qo'shildi", user: updated[0] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete("/operators/:id", async (req, res) => {
  if (!isMainOp(req)) {
    return res.status(403).json({ message: "Faqat bosh operator operatorni o'chira oladi" });
  }
  try {
    await query("UPDATE users SET role = 'user' WHERE id = $1", [req.params.id]);
    res.json({ message: "Operator o'chirildi" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Statistika ───────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM products WHERE is_active = TRUE) AS active_products,
        (SELECT COUNT(*) FROM orders WHERE status = 'new') AS new_orders,
        (SELECT COUNT(*) FROM orders WHERE status = 'ready') AS ready_orders,
        (SELECT COUNT(*) FROM orders WHERE status = 'picked_up' AND created_at::date = CURRENT_DATE) AS picked_up_today,
        (SELECT COALESCE(SUM(total),0) FROM orders WHERE status = 'picked_up' AND created_at::date = CURRENT_DATE) AS revenue_today
    `);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
