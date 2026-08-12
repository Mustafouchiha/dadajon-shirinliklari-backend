// ─── eskiz.uz SMS yuboruvchi ──────────────────────────────────────
//
//  SMS_ENABLED=false → SMS yuborilmaydi, faqat console da chiqadi
//  SMS_ENABLED=true  → Haqiqiy ESKIZ_EMAIL/ESKIZ_PASSWORD talab qilinadi
//
const ESKIZ_BASE = "https://notify.eskiz.uz/api";

let _token = null;
let _tokenExpires = 0;

function smsEnabled() {
  if (process.env.SMS_ENABLED !== undefined) return process.env.SMS_ENABLED === "true";
  // Backward-compat: DEMO_MODE=true bo'lsa console rejim
  if (process.env.DEMO_MODE !== undefined) return process.env.DEMO_MODE !== "true";
  return false;
}

const hasEskizCredentials = () => {
  const email = process.env.ESKIZ_EMAIL;
  const pass  = process.env.ESKIZ_PASSWORD;
  return (
    email && pass &&
    !["your@email.com", "mustafouchiha@email.com"].includes(email) &&
    pass !== "your_eskiz_password"
  );
};

async function getToken() {
  if (_token && Date.now() < _tokenExpires) return _token;
  const res = await fetch(`${ESKIZ_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email:    process.env.ESKIZ_EMAIL,
      password: process.env.ESKIZ_PASSWORD,
    }),
  });
  if (!res.ok) throw new Error("eskiz.uz login xatosi: " + await res.text());
  const data = await res.json();
  _token        = data.data?.token;
  _tokenExpires = Date.now() + 28 * 60 * 1000;
  return _token;
}

async function sendSMS(phone, text) {
  // SMS_ENABLED=false → CONSOLE
  if (!smsEnabled()) {
    console.log("\n📱 SMS [CONSOLE REJIM] ──────────────────────────");
    console.log(`   📞 Telefon : ${phone}`);
    console.log(`   💬 Matn    : ${text}`);
    console.log("─────────────────────────────────────────────────\n");
    return { ok: true, mode: "console", enabled: false };
  }

  // SMS_ENABLED=true va credentials yo'q → XATO
  if (!hasEskizCredentials()) {
    const msg = "SMS xatosi: SMS_ENABLED=true, lekin ESKIZ_EMAIL/ESKIZ_PASSWORD .env da yo'q.";
    console.error("❌ SMS XATO:", msg);
    throw new Error(msg);
  }

  // Haqiqiy SMS
  try {
    const token = await getToken();
    const res = await fetch(`${ESKIZ_BASE}/message/sms/send`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        mobile_phone: phone.replace(/\D/g, ""),
        message:      text,
        from:         process.env.SMS_FROM || "4546",
        callback_url: "",
      }),
    });
    const data = await res.json();
    if (data.status === "waiting") {
      console.log(`✅ SMS yuborildi → ${phone}`);
      return { ok: true, mode: "sms", enabled: true };
    }
    throw new Error(data.message || "SMS yuborishda xatolik");
  } catch (err) {
    throw err;
  }
}

module.exports = { sendSMS };
