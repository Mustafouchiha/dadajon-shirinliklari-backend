const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || 'dadajon_tort_secret_key_2024';

module.exports = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token topilmadi" });
  }

  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(decoded.id);
    if (!req.user) return res.status(401).json({ message: "Foydalanuvchi topilmadi" });
    if (req.user.is_blocked) return res.status(403).json({ message: "Hisobingiz bloklangan" });
    next();
  } catch {
    return res.status(401).json({ message: "Token yaroqsiz" });
  }
};
