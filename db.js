const { Pool } = require("pg");

let pool;
let _tablesReady = null;

function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL .env da topilmadi");

    // channel_binding ni olib tashlaymiz — Neon bilan muammo chiqaradi
    const cleanUrl = url.replace(/[&?]channel_binding=[^&]*/g, "");

    pool = new Pool({
      connectionString: cleanUrl,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
}

function ensureTables() {
  if (!_tablesReady) {
    _tablesReady = initTables(getPool()).catch((err) => {
      _tablesReady = null;
      throw err;
    });
  }
  return _tablesReady;
}

async function connect() {
  await ensureTables();
  return getPool();
}

async function query(text, params) {
  await ensureTables();
  return getPool().query(text, params);
}

// Eski ReQurilish (bozor) sxemasidan qolgan jadvallarni olib tashlash — bir martalik tozalash
async function dropLegacyMarketTables(p) {
  const drops = [
    "DROP TABLE IF EXISTS payment_locks   CASCADE",
    "DROP TABLE IF EXISTS payments        CASCADE",
    "DROP TABLE IF EXISTS offers          CASCADE",
    "DROP TABLE IF EXISTS rental_bookings CASCADE",
    "DROP TABLE IF EXISTS rentals         CASCADE",
    "DROP TABLE IF EXISTS product_likes   CASCADE",
  ];
  for (const sql of drops) {
    await p.query(sql).catch(() => {});
  }
}

// Har bir jadvalni alohida query da yaratamiz — xato bo'lsa qolganlar ishlaydi
async function initTables(p) {
  const run = (sql) => p.query(sql);

  await dropLegacyMarketTables(p);

  // 1. uuid-ossp extension (gen_random_uuid uchun)
  await run(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`).catch(() => {});

  // 2. Users
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      name        VARCHAR(255) NOT NULL DEFAULT '',
      phone       VARCHAR(50)  UNIQUE NOT NULL DEFAULT '',
      telegram    VARCHAR(255) DEFAULT '',
      avatar      TEXT,
      tg_chat_id  BIGINT,
      is_blocked  BOOLEAN      DEFAULT FALSE,
      role        VARCHAR(50)  DEFAULT 'user',
      joined      TIMESTAMPTZ  DEFAULT NOW(),
      created_at  TIMESTAMPTZ  DEFAULT NOW(),
      updated_at  TIMESTAMPTZ  DEFAULT NOW()
    );
  `);

  const userCols = [
    [`tg_chat_id`,  `BIGINT`],
    [`is_blocked`,  `BOOLEAN DEFAULT FALSE`],
    [`role`,        `VARCHAR(50) DEFAULT 'user'`],
    [`updated_at`,  `TIMESTAMPTZ DEFAULT NOW()`],
    [`avatar`,      `TEXT`],
    [`telegram`,    `VARCHAR(255) DEFAULT ''`],
  ];
  for (const [col, def] of userCols) {
    await run(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='users' AND column_name='${col}'
        ) THEN ALTER TABLE users ADD COLUMN ${col} ${def}; END IF;
      END $$;
    `).catch(() => {});
  }
  // Eski bozor sxemasidan qolgan "balance" ustuni kerak emas
  await run(`ALTER TABLE users DROP COLUMN IF EXISTS balance;`).catch(() => {});

  // 3. Products — tort/mahsulot katalogi (operator boshqaradi)
  await run(`
    CREATE TABLE IF NOT EXISTS products (
      id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      name         VARCHAR(255) NOT NULL DEFAULT '',
      category     VARCHAR(50)  NOT NULL DEFAULT 'Boshqa',
      price        NUMERIC      NOT NULL DEFAULT 0,
      weight       VARCHAR(50)  DEFAULT '',
      photo        TEXT,
      description  TEXT,
      is_featured  BOOLEAN      NOT NULL DEFAULT FALSE,
      is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
      sort_order   INTEGER      NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ  DEFAULT NOW(),
      updated_at   TIMESTAMPTZ  DEFAULT NOW()
    );
  `);

  // Eski ReQurilish e'lon-sxemasidan qolgan ustunlarni tozalash
  const legacyProductCols = [
    "owner_id", "status", "viloyat", "tuman", "qty", "condition", "unit",
    "photos", "approved_by", "rejected_reason", "view_count", "like_count",
    "pending_sale_until", "paid_fee", "paid_offer_id",
  ];
  for (const col of legacyProductCols) {
    await run(`ALTER TABLE products DROP COLUMN IF EXISTS ${col};`).catch(() => {});
  }

  const newProductCols = [
    [`weight`,      `VARCHAR(50) DEFAULT ''`],
    [`description`, `TEXT`],
    [`is_featured`, `BOOLEAN NOT NULL DEFAULT FALSE`],
    [`is_active`,   `BOOLEAN NOT NULL DEFAULT TRUE`],
    [`sort_order`,  `INTEGER NOT NULL DEFAULT 0`],
    [`updated_at`,  `TIMESTAMPTZ DEFAULT NOW()`],
  ];
  for (const [col, def] of newProductCols) {
    await run(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='products' AND column_name='${col}'
        ) THEN ALTER TABLE products ADD COLUMN ${col} ${def}; END IF;
      END $$;
    `).catch(() => {});
  }

  // 4. Orders — faqat "do'kondan olib ketish" buyurtmalari
  await run(`
    CREATE TABLE IF NOT EXISTS orders (
      id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      order_code       VARCHAR(10)  UNIQUE NOT NULL,
      user_id          UUID         NOT NULL,
      customer_name    VARCHAR(255) NOT NULL DEFAULT '',
      customer_phone   VARCHAR(50)  NOT NULL DEFAULT '',
      comment          TEXT         DEFAULT '',
      total            NUMERIC      NOT NULL DEFAULT 0,
      status           VARCHAR(20)  NOT NULL DEFAULT 'new',
      ready_at         TIMESTAMPTZ,
      picked_up_by     UUID,
      picked_up_by_name VARCHAR(255),
      picked_up_at     TIMESTAMPTZ,
      created_at       TIMESTAMPTZ  DEFAULT NOW(),
      updated_at       TIMESTAMPTZ  DEFAULT NOW()
    );
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='orders' AND constraint_name='orders_user_id_fkey'
      ) THEN
        ALTER TABLE orders ADD CONSTRAINT orders_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `).catch(() => {});

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='orders' AND constraint_name='orders_picked_up_by_fkey'
      ) THEN
        ALTER TABLE orders ADD CONSTRAINT orders_picked_up_by_fkey
          FOREIGN KEY (picked_up_by) REFERENCES users(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `).catch(() => {});

  // 5. Order items — buyurtma tarkibi (narx/nom "snapshot" qilinadi)
  await run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id    UUID        NOT NULL,
      product_id  UUID,
      name        VARCHAR(255) NOT NULL DEFAULT '',
      price       NUMERIC     NOT NULL DEFAULT 0,
      qty         INTEGER     NOT NULL DEFAULT 1
    );
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='order_items' AND constraint_name='order_items_order_id_fkey'
      ) THEN
        ALTER TABLE order_items ADD CONSTRAINT order_items_order_id_fkey
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `).catch(() => {});

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='order_items' AND constraint_name='order_items_product_id_fkey'
      ) THEN
        ALTER TABLE order_items ADD CONSTRAINT order_items_product_id_fkey
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `).catch(() => {});

  // 6. Telegram tokens (bir martalik mini-app kirish)
  await run(`
    CREATE TABLE IF NOT EXISTS tg_tokens (
      token      VARCHAR(20)  PRIMARY KEY,
      user_id    UUID         NOT NULL,
      expires_at TIMESTAMPTZ  NOT NULL,
      created_at TIMESTAMPTZ  DEFAULT NOW()
    );
  `);

  await run(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name='tg_tokens' AND constraint_name='tg_tokens_user_id_fkey'
      ) THEN
        ALTER TABLE tg_tokens ADD CONSTRAINT tg_tokens_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `).catch(() => {});

  // 7. Settings (feature flags — masalan app_logo)
  await run(`
    CREATE TABLE IF NOT EXISTS settings (
      key        VARCHAR(100) PRIMARY KEY,
      value      TEXT         NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ  DEFAULT NOW()
    );
  `);

  // 8. Indexes
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_products_active   ON products (is_active, sort_order);`,
    `CREATE INDEX IF NOT EXISTS idx_products_category  ON products (category);`,
    `CREATE INDEX IF NOT EXISTS idx_orders_user        ON orders (user_id);`,
    `CREATE INDEX IF NOT EXISTS idx_orders_status       ON orders (status, created_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_orders_code         ON orders (order_code);`,
    `CREATE INDEX IF NOT EXISTS idx_order_items_order   ON order_items (order_id);`,
    `CREATE INDEX IF NOT EXISTS idx_users_tg            ON users (tg_chat_id);`,
    `CREATE INDEX IF NOT EXISTS idx_users_phone         ON users (phone);`,
  ];
  for (const idx of indexes) {
    await run(idx).catch(() => {});
  }

  console.log("✅ Database jadvallari tayyor (Dadajon Tort)");
}

module.exports = { connect, query };
