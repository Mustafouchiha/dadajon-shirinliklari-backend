const crypto = require("crypto");
const { connect, query } = require("../db");
const Product = require("./Product");

// Chalkash bo'lmagan alifbo (0/O, 1/I kabi belgilar yo'q) — QR/qo'lda kiritish uchun qulay
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(len = 6) {
  const bytes = crypto.randomBytes(len);
  let code = "";
  for (let i = 0; i < len; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

function formatOrder(o, items = []) {
  return {
    id: o.id,
    orderCode: o.order_code,
    userId: o.user_id,
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    comment: o.comment || "",
    total: Number(o.total),
    status: o.status,
    readyAt: o.ready_at,
    pickedUpBy: o.picked_up_by,
    pickedUpByName: o.picked_up_by_name,
    pickedUpAt: o.picked_up_at,
    createdAt: o.created_at,
    items: items.map((it) => ({
      id: it.id,
      productId: it.product_id,
      name: it.name,
      price: Number(it.price),
      qty: it.qty,
    })),
  };
}

const Order = {
  formatOrder,

  // items: [{ productId, qty }]
  async create({ userId, customerName, customerPhone, comment, items }) {
    if (!Array.isArray(items) || !items.length) {
      throw new Error("Savat bo'sh");
    }
    const productIds = items.map((it) => it.productId);
    const products = await Product.findByIds(productIds);
    const byId = new Map(products.map((p) => [p.id, p]));

    const lineItems = items.map((it) => {
      const p = byId.get(it.productId);
      if (!p || !p.is_active) throw new Error("Mahsulot topilmadi yoki mavjud emas");
      const qty = Math.max(1, Number(it.qty) || 1);
      return { productId: p.id, name: p.name, price: Number(p.price), qty };
    });
    const total = lineItems.reduce((s, it) => s + it.price * it.qty, 0);

    const pool = await connect();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let order;
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode();
        try {
          const { rows } = await client.query(
            `INSERT INTO orders (order_code, user_id, customer_name, customer_phone, comment, total, status)
             VALUES ($1,$2,$3,$4,$5,$6,'new')
             RETURNING *`,
            [code, userId, customerName, customerPhone, comment || "", total]
          );
          order = rows[0];
          break;
        } catch (e) {
          if (e.code === "23505" && attempt < 4) continue; // unique clash — qayta urinish
          throw e;
        }
      }
      if (!order) throw new Error("Buyurtma kodi generatsiya qilinmadi");

      for (const it of lineItems) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, name, price, qty)
           VALUES ($1,$2,$3,$4,$5)`,
          [order.id, it.productId, it.name, it.price, it.qty]
        );
      }

      await client.query("COMMIT");
      return formatOrder(order, lineItems.map((it, idx) => ({ id: idx, ...it, product_id: it.productId })));
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  },

  async findByCode(code) {
    const { rows } = await query(`SELECT * FROM orders WHERE order_code = $1 LIMIT 1`, [code]);
    if (!rows[0]) return null;
    const { rows: items } = await query(`SELECT * FROM order_items WHERE order_id = $1`, [rows[0].id]);
    return formatOrder(rows[0], items);
  },

  async findMineByUser(userId) {
    const { rows } = await query(
      `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
    const orders = [];
    for (const o of rows) {
      const { rows: items } = await query(`SELECT * FROM order_items WHERE order_id = $1`, [o.id]);
      orders.push(formatOrder(o, items));
    }
    return orders;
  },

  async findAll({ status } = {}) {
    const VALID = ["new", "ready", "picked_up", "cancelled"];
    let rows;
    if (status && VALID.includes(status)) {
      ({ rows } = await query(
        `SELECT * FROM orders WHERE status = $1 ORDER BY created_at DESC LIMIT 100`,
        [status]
      ));
    } else {
      ({ rows } = await query(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 100`));
    }
    const orders = [];
    for (const o of rows) {
      const { rows: items } = await query(`SELECT * FROM order_items WHERE order_id = $1`, [o.id]);
      orders.push(formatOrder(o, items));
    }
    return orders;
  },

  async setStatus(code, status) {
    const extra = status === "ready" ? `, ready_at = NOW()` : "";
    const { rows } = await query(
      `UPDATE orders SET status = $1, updated_at = NOW() ${extra} WHERE order_code = $2 RETURNING *`,
      [status, code]
    );
    return rows[0] || null;
  },

  async markPickedUp(code, operatorUser) {
    const { rows } = await query(
      `UPDATE orders
       SET status = 'picked_up', picked_up_by = $1, picked_up_by_name = $2, picked_up_at = NOW(), updated_at = NOW()
       WHERE order_code = $3 AND status != 'picked_up'
       RETURNING *`,
      [operatorUser.id, operatorUser.name, code]
    );
    return rows[0] || null;
  },

  async cancel(code, userId) {
    const { rows } = await query(
      `UPDATE orders SET status = 'cancelled', updated_at = NOW()
       WHERE order_code = $1 AND user_id = $2 AND status = 'new'
       RETURNING *`,
      [code, userId]
    );
    return rows[0] || null;
  },
};

module.exports = Order;
