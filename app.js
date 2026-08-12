const express = require("express");
const cors = require("cors");

const authRoutes     = require("./routes/auth");
const productRoutes  = require("./routes/products");
const orderRoutes    = require("./routes/orders");
const operatorRoutes = require("./routes/operator");
const settingsRoutes = require("./routes/settings");

const app = express();

// ── CORS ──────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.CLIENT_URL,
].filter(Boolean);

const isLocalhost = (o) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
const isVercelApp = (o) => /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(o);
const isRenderApp = (o) => /^https:\/\/[a-z0-9-]+\.onrender\.com$/.test(o);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin) || isLocalhost(origin) || isVercelApp(origin) || isRenderApp(origin)) {
        return cb(null, true);
      }
      cb(new Error("CORS: ruxsat yo'q — " + origin));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));

// ── Routes ────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/operator", operatorRoutes);
app.use("/api/settings", settingsRoutes);

// ── Ping: DB ulanishini uyg'otish ──────────────────────────────────
app.get("/api/ping", async (_req, res) => {
  res.json({ ok: true });
  try { const { query } = require("./db"); query("SELECT 1"); } catch {}
});

// ── Health check ─────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    message: "Dadajon Tort API ishlayapti ✅",
    database: "PostgreSQL",
    timestamp: new Date().toISOString(),
  });
});

// ── Bot status ────────────────────────────────────────
app.get("/bot-status", (_req, res) => {
  const tokenSet = !!process.env.TELEGRAM_BOT_TOKEN;
  const { getBot } = require('./bot');
  const botRunning = !!getBot();
  res.json({
    tokenSet,
    botRunning,
    miniAppUrl: process.env.MINI_APP_URL || '',
  });
});

// ── 404 ───────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: "Bu yo'l topilmadi" });
});

module.exports = app;
