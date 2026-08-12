const jwt = require("jsonwebtoken");
const { query } = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "dadajon_tort_secret_key_2024";

// Bosh operatorning telefon raqami — Railway (yoki .env) muhit o'zgaruvchisidan olinadi
function mainOperatorPhone() {
  const raw = process.env.MAIN_OPERATOR_PHONE || "";
  return raw.replace(/\D/g, "").slice(-9);
}

if (!process.env.MAIN_OPERATOR_PHONE) {
  console.warn(
    "⚠️  MAIN_OPERATOR_PHONE o'rnatilmagan! Operator panelga hech kim kira olmaydi " +
    "(faqat role='operator' bo'lgan foydalanuvchilar). .env yoki Railway'da MAIN_OPERATOR_PHONE ni kiriting."
  );
}

module.exports = async function operatorAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token talab etiladi" });
  }

  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
    const { rows } = await query("SELECT * FROM users WHERE id = $1 LIMIT 1", [decoded.id]);
    const user = rows[0];
    if (!user) return res.status(401).json({ message: "Foydalanuvchi topilmadi" });
    if (user.is_blocked) return res.status(403).json({ message: "Hisobingiz bloklangan" });

    const userPhone = (user.phone || "").replace(/\D/g, "").slice(-9);
    const isMainOperator = !!mainOperatorPhone() && userPhone === mainOperatorPhone();
    const isOperator = isMainOperator || user.role === "operator";

    if (!isOperator) {
      return res.status(403).json({ message: "Ruxsat yo'q" });
    }

    req.user = user;
    req.isMainOperator = isMainOperator;
    next();
  } catch {
    res.status(401).json({ message: "Token yaroqsiz" });
  }
};

module.exports.mainOperatorPhone = mainOperatorPhone;
