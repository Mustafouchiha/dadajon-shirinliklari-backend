// Haqiqiy OTP store — Telegram orqali yuboriladigan kodlar
const store = new Map(); // phone -> { code, expiresAt, attempts }

const TTL      = 5 * 60 * 1000; // 5 daqiqa
const MAX_TRY  = 5;              // Maksimal urinish soni

function createOtp(phone) {
  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 xonali
  store.set(phone, { code, expiresAt: Date.now() + TTL, attempts: 0 });
  return code;
}

function verifyOtp(phone, inputCode) {
  // Demo rejim: OTP_STRICT=false bo'lsa har qanday kod qabul qilinadi
  if (process.env.OTP_STRICT === "false") return { ok: true };

  const entry = store.get(phone);
  if (!entry) return { ok: false, reason: "Kod yuborilmagan yoki muddati o'tgan" };
  if (Date.now() > entry.expiresAt) {
    store.delete(phone);
    return { ok: false, reason: "Kodning muddati o'tdi. Qayta yuboring" };
  }
  entry.attempts++;
  if (entry.attempts > MAX_TRY) {
    store.delete(phone);
    return { ok: false, reason: "Ko'p noto'g'ri urinish. Qayta yuboring" };
  }
  if (entry.code !== String(inputCode).trim()) {
    return { ok: false, reason: "Kod noto'g'ri" };
  }
  store.delete(phone); // to'g'ri — o'chirish
  return { ok: true };
}

// Eskirgan OTPlarni tozalash (har 10 daqiqada)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store.entries()) {
    if (now > val.expiresAt) store.delete(key);
  }
}, 10 * 60 * 1000);

module.exports = { createOtp, verifyOtp };
