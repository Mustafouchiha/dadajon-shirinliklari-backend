const { query } = require("../db");

const User = {
  async findOne({ phone }) {
    const { rows } = await query(
      "SELECT * FROM users WHERE phone = $1 LIMIT 1",
      [phone]
    );
    return rows[0] || null;
  },

  async findByTgChatId(tgChatId) {
    const { rows } = await query(
      "SELECT * FROM users WHERE tg_chat_id = $1 LIMIT 1",
      [tgChatId]
    );
    return rows[0] || null;
  },

  async findById(id) {
    const { rows } = await query(
      "SELECT * FROM users WHERE id = $1 LIMIT 1",
      [id]
    );
    return rows[0] || null;
  },

  async create({ name, phone, telegram = "" }) {
    const { rows } = await query(
      `INSERT INTO users (name, phone, telegram)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, phone, telegram]
    );
    return rows[0];
  },

  async findByIdAndUpdate(id, update) {
    const fields = [];
    const values = [];
    let i = 1;

    if (update.name !== undefined)       { fields.push(`name = $${i++}`);        values.push(update.name); }
    if (update.phone !== undefined)      { fields.push(`phone = $${i++}`);       values.push(update.phone); }
    if (update.telegram !== undefined)   { fields.push(`telegram = $${i++}`);    values.push(update.telegram); }
    if (update.avatar !== undefined)     { fields.push(`avatar = $${i++}`);      values.push(update.avatar); }
    if (update.tg_chat_id !== undefined) { fields.push(`tg_chat_id = $${i++}`);  values.push(update.tg_chat_id); }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
      values
    );
    return rows[0] || null;
  },
};

module.exports = User;
