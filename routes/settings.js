const express = require("express");
const router  = express.Router();
const { query } = require("../db");
const operatorAuth = require("../middleware/operatorAuth");

// GET /api/settings/:key  — public (har kim o'qishi mumkin)
router.get("/:key", async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT value FROM settings WHERE key = $1`,
      [req.params.key]
    );
    if (!rows.length) return res.json({ value: null });
    res.json({ value: rows[0].value });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// PUT /api/settings/:key  — faqat operator o'zgartirishi mumkin
router.put("/:key", operatorAuth, async (req, res) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ message: "value kerak" });
  try {
    await query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [req.params.key, String(value)]
    );
    res.json({ ok: true, key: req.params.key, value: String(value) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
