const { query } = require("./db");

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 kun

function makeToken() {
  return (
    Math.random().toString(36).slice(2, 6).toUpperCase() +
    Math.random().toString(36).slice(2, 6).toUpperCase()
  );
}

async function createToken(userId) {
  const token = makeToken();
  const expiresAt = new Date(Date.now() + TTL_MS);
  await query(
    `INSERT INTO tg_tokens (token, user_id, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET user_id=$2, expires_at=$3`,
    [token, userId, expiresAt]
  );
  return token;
}

async function verifyToken(token) {
  const { rows } = await query(
    `DELETE FROM tg_tokens WHERE token=$1 AND expires_at > NOW() RETURNING user_id`,
    [token]
  );
  if (!rows[0]) return null;
  return { userId: rows[0].user_id };
}

// Eskirgan tokenlarni tozalash (har soatda)
setInterval(async () => {
  await query("DELETE FROM tg_tokens WHERE expires_at <= NOW()").catch(() => {});
}, 60 * 60 * 1000);

module.exports = { createToken, verifyToken };
