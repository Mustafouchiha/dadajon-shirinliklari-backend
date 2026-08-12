const TG_BASE = "https://api.telegram.org";

async function sendTg(chatId, text, extra = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN sozlanmagan");
  if (!chatId) throw new Error("chatId yo'q");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000); // 10 soniya timeout

  try {
    const res = await fetch(`${TG_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: String(chatId),
        text,
        parse_mode: "Markdown",
        ...extra,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    if (!data.ok) throw new Error(data.description || "Telegram API xatosi");
    return data.result;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") throw new Error("Telegram API 10 soniyada javob bermadi");
    throw e;
  }
}

module.exports = { sendTg };
