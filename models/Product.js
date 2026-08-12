const { query } = require("../db");

const Product = {
  // Katalog — mijozlarga ko'rinadigan faol mahsulotlar
  async findActive({ category, search } = {}) {
    const conditions = [`is_active = TRUE`];
    const values = [];
    let i = 1;

    if (category && category !== "Barchasi") {
      conditions.push(`category = $${i++}`);
      values.push(category);
    }
    if (search) {
      conditions.push(`(name ILIKE $${i} OR category ILIKE $${i})`);
      values.push(`%${search}%`);
      i++;
    }

    const { rows } = await query(
      `SELECT * FROM products WHERE ${conditions.join(" AND ")}
       ORDER BY is_featured DESC, sort_order ASC, created_at DESC`,
      values
    );
    return rows;
  },

  // Operator panel — barcha mahsulotlar (faol + nofaol)
  async findAll({ q } = {}) {
    if (q) {
      const { rows } = await query(
        `SELECT * FROM products WHERE name ILIKE $1
         ORDER BY sort_order ASC, created_at DESC`,
        [`%${q}%`]
      );
      return rows;
    }
    const { rows } = await query(
      `SELECT * FROM products ORDER BY sort_order ASC, created_at DESC`
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await query(`SELECT * FROM products WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] || null;
  },

  async findByIds(ids) {
    if (!ids.length) return [];
    const { rows } = await query(`SELECT * FROM products WHERE id = ANY($1)`, [ids]);
    return rows;
  },

  async create(data) {
    const { rows } = await query(
      `INSERT INTO products (name, category, price, weight, photo, description, is_featured, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        data.name,
        data.category || "Boshqa",
        Number(data.price) || 0,
        data.weight || "",
        data.photo || null,
        data.description || null,
        !!data.isFeatured,
        data.isActive !== false,
        Number(data.sortOrder) || 0,
      ]
    );
    return rows[0];
  },

  async update(id, fields) {
    const map = {
      name: "name", category: "category", price: "price", weight: "weight",
      photo: "photo", description: "description",
      isFeatured: "is_featured", isActive: "is_active", sortOrder: "sort_order",
    };
    const sets = [];
    const values = [];
    let i = 1;
    for (const [key, col] of Object.entries(map)) {
      if (fields[key] !== undefined) {
        sets.push(`${col} = $${i++}`);
        values.push(fields[key]);
      }
    }
    if (!sets.length) return null;
    sets.push(`updated_at = NOW()`);
    values.push(id);
    const { rows } = await query(
      `UPDATE products SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      values
    );
    return rows[0] || null;
  },

  async setActive(id, isActive) {
    const { rows } = await query(
      `UPDATE products SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [isActive, id]
    );
    return rows[0] || null;
  },

  async remove(id) {
    const { rowCount } = await query(`DELETE FROM products WHERE id = $1`, [id]);
    return rowCount > 0;
  },
};

module.exports = Product;
