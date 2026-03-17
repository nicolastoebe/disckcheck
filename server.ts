import express from "express";
import "dotenv/config";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway") ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT, email TEXT UNIQUE, password TEXT,
      plan TEXT DEFAULT 'premium',
      role TEXT DEFAULT 'inspector',
      active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS evaluations (
      id SERIAL PRIMARY KEY, user_id INTEGER,
      client_name TEXT, client_phone TEXT,
      brand TEXT, model TEXT, version TEXT,
      year_fab INTEGER, year_model INTEGER, km INTEGER,
      plate TEXT, color TEXT, chassis TEXT, city TEXT,
      evaluation_date TEXT, type TEXT,
      final_classification TEXT, final_summary TEXT,
      photo_front TEXT, photo_rear TEXT,
      photo_side_right TEXT, photo_side_left TEXT,
      photo_dashboard TEXT, photo_seats_front TEXT,
      photo_seats_rear TEXT, photo_trunk TEXT,
      photos TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS checklist_items (
      id SERIAL PRIMARY KEY, evaluation_id INTEGER,
      category TEXT, item_name TEXT,
      status TEXT, notes TEXT, photos TEXT,
      FOREIGN KEY (evaluation_id) REFERENCES evaluations(id)
    );
    CREATE INDEX IF NOT EXISTS idx_eval_user ON evaluations(user_id);
    CREATE INDEX IF NOT EXISTS idx_eval_plate ON evaluations(plate);
    CREATE INDEX IF NOT EXISTS idx_eval_created ON evaluations(created_at);
    CREATE INDEX IF NOT EXISTS idx_items_eval ON checklist_items(evaluation_id);
  `);

  // Adiciona coluna role se não existir (para bancos já criados)
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'inspector';
  `);

  // Admin padrão
  await pool.query(`
    INSERT INTO users (id, name, email, password, plan, role)
    VALUES (1, 'Admin', 'admin@disckcheck.com', 'DisckCheck#2026', 'premium', 'admin')
    ON CONFLICT (email) DO UPDATE SET role = 'admin';
  `);

  // Exemplo de avaliação
  const ex = await pool.query(`SELECT id FROM evaluations WHERE id = 1 LIMIT 1`);
  if (ex.rows.length === 0) {
    await pool.query(`
      INSERT INTO evaluations (
        id, user_id, client_name, client_phone, brand, model, version,
        year_fab, year_model, km, plate, color, chassis, city,
        evaluation_date, type, final_classification, final_summary,
        photo_front, photo_rear, photo_side_right, photo_side_left,
        photo_dashboard, photo_seats_front, photo_seats_rear, photo_trunk
      ) VALUES (
        1, 1, 'Exemplo de Cliente', '(11) 99999-9999', 'PORSCHE', '911', 'CARRERA S 3.0 24V',
        2022, 2023, 5400, 'DSK-2026', 'CINZA', 'WP0ZZZ99ZNS123456', 'SAO PAULO/SP',
        CURRENT_DATE, 'premium', 'warning',
        'Veículo em excelente estado geral, porém com ressalva técnica no conjunto de rodagem dianteiro.',
        'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=60',
        'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=800&q=60',
        'https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=800&q=60',
        'https://images.unsplash.com/photo-1611821064430-0d40291d0f0b?w=800&q=60',
        'https://images.unsplash.com/photo-1542362567-b055002b91f4?w=800&q=60',
        'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=60',
        'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=800&q=60',
        'https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=800&q=60'
      ) ON CONFLICT (id) DO NOTHING;
    `);
    await pool.query(`
      INSERT INTO checklist_items (evaluation_id, category, item_name, status, notes, photos) VALUES
        (1,'Estrutura Técnica','Longarinas Dianteiras','original','Integridade preservada','[]'),
        (1,'Mecânica','Motor','ok','Sem vazamentos','[]'),
        (1,'Mecânica','Câmbio','ok','Trocas fluidas','[]'),
        (1,'Pneus','Pneu Dianteiro Esquerdo','problem','Desgaste excessivo.','[]');
    `);
  }
  console.log("✅ Banco de dados pronto!");
}

async function startServer() {
  await initDB();

  const app  = express();
  const PORT = process.env.PORT || 3000;
  app.use(express.json({ limit: "50mb" }));

  // ── Health ──────────────────────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  // ── Auth ────────────────────────────────────────────────────────────────────
  app.post("/api/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const r = await pool.query("SELECT * FROM users WHERE email = $1 AND active = 1", [email]);
      const u = r.rows[0];
      if (!u) return res.status(401).json({ error: "Usuário não encontrado" });
      if (u.password !== password) return res.status(401).json({ error: "Senha incorreta" });
      res.json({ id: u.id, name: u.name, email: u.email, plan: u.plan, role: u.role || 'inspector' });
    } catch (err) { console.error(err); res.status(500).json({ error: "Erro interno" }); }
  });

  // ── Evaluations ─────────────────────────────────────────────────────────────
  app.get("/api/evaluations", async (req, res) => {
    try {
      const { q, limit = 50, offset = 0, user_id, role } = req.query;
      let query  = "SELECT id,client_name,plate,brand,model,type,final_classification,evaluation_date,created_at FROM evaluations";
      let params: any[] = [];
      const conditions: string[] = [];

      // Inspetores só veem seus próprios laudos
      if (role === 'inspector' && user_id) {
        conditions.push(`user_id = $${params.length + 1}`);
        params.push(Number(user_id));
      }
      if (q) {
        conditions.push(`(plate ILIKE $${params.length + 1} OR client_name ILIKE $${params.length + 1} OR model ILIKE $${params.length + 1})`);
        params.push(`%${q}%`);
      }
      if (conditions.length) query += " WHERE " + conditions.join(" AND ");
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(Number(limit), Number(offset));

      const r = await pool.query(query, params);
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erro interno" }); }
  });

  app.get("/api/evaluations/:id", async (req, res) => {
    try {
      const er = await pool.query("SELECT * FROM evaluations WHERE id = $1", [req.params.id]);
      if (!er.rows[0]) return res.status(404).json({ error: "Not found" });
      const ir = await pool.query("SELECT * FROM checklist_items WHERE evaluation_id = $1", [req.params.id]);
      const items = ir.rows.map((i: any) => ({ ...i, photos: i.photos ? JSON.parse(i.photos) : [] }));
      res.json({ ...er.rows[0], items });
    } catch (err) { console.error(err); res.status(500).json({ error: "Erro interno" }); }
  });

  app.post("/api/evaluations", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const {
        user_id, client_name, client_phone, brand, model, version,
        year_fab, year_model, km, plate, chassis, city, evaluation_date,
        type, final_classification, final_summary, photos, items,
        photo_front, photo_rear, photo_side_right, photo_side_left,
        photo_dashboard, photo_seats_front, photo_seats_rear, photo_trunk, color,
      } = req.body;
      const er = await client.query(
        `INSERT INTO evaluations (
          user_id,client_name,client_phone,brand,model,version,
          year_fab,year_model,km,plate,chassis,city,evaluation_date,
          type,final_classification,final_summary,photos,
          photo_front,photo_rear,photo_side_right,photo_side_left,
          photo_dashboard,photo_seats_front,photo_seats_rear,photo_trunk,color
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
        RETURNING id`,
        [user_id,client_name,client_phone,brand,model,version,
         year_fab,year_model,km,plate,chassis,city,evaluation_date,
         type,final_classification,final_summary,JSON.stringify(photos||[]),
         photo_front,photo_rear,photo_side_right,photo_side_left,
         photo_dashboard,photo_seats_front,photo_seats_rear,photo_trunk,color]
      );
      const evalId = er.rows[0].id;
      if (items?.length) {
        for (const item of items) {
          await client.query(
            `INSERT INTO checklist_items (evaluation_id,category,item_name,status,notes,photos) VALUES ($1,$2,$3,$4,$5,$6)`,
            [evalId, item.category, item.item_name, item.status, item.notes||null, JSON.stringify(item.photos||[])]
          );
        }
      }
      await client.query("COMMIT");
      res.json({ id: evalId });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err); res.status(500).json({ error: "Erro ao salvar" });
    } finally { client.release(); }
  });

  app.delete("/api/evaluations/:id", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM checklist_items WHERE evaluation_id = $1", [req.params.id]);
      await client.query("DELETE FROM evaluations WHERE id = $1", [req.params.id]);
      await client.query("COMMIT");
      res.json({ success: true });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err); res.status(500).json({ error: "Erro ao deletar" });
    } finally { client.release(); }
  });

  // ── Users (admin only) ──────────────────────────────────────────────────────
  app.get("/api/users", async (_req, res) => {
    try {
      const r = await pool.query(
        "SELECT id, name, email, plan, role, active, created_at FROM users ORDER BY created_at ASC"
      );
      res.json(r.rows);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erro interno" }); }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const { name, email, password, role = 'inspector' } = req.body;
      if (!name || !email || !password) return res.status(400).json({ error: "Preencha todos os campos" });
      const r = await pool.query(
        "INSERT INTO users (name, email, password, plan, role) VALUES ($1,$2,$3,'premium',$4) RETURNING id,name,email,plan,role,active,created_at",
        [name, email, password, role]
      );
      res.json(r.rows[0]);
    } catch (err: any) {
      if (err.code === '23505') return res.status(400).json({ error: "E-mail já cadastrado" });
      console.error(err); res.status(500).json({ error: "Erro interno" });
    }
  });

  app.put("/api/users/:id", async (req, res) => {
    try {
      const { name, email, password, role, active } = req.body;
      if (password) {
        await pool.query(
          "UPDATE users SET name=$1,email=$2,password=$3,role=$4,active=$5 WHERE id=$6",
          [name, email, password, role, active, req.params.id]
        );
      } else {
        await pool.query(
          "UPDATE users SET name=$1,email=$2,role=$3,active=$4 WHERE id=$5",
          [name, email, role, active, req.params.id]
        );
      }
      res.json({ success: true });
    } catch (err: any) {
      if (err.code === '23505') return res.status(400).json({ error: "E-mail já cadastrado" });
      console.error(err); res.status(500).json({ error: "Erro interno" });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      if (req.params.id === '1') return res.status(400).json({ error: "Não é possível excluir o admin principal" });
      await pool.query("DELETE FROM users WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Erro interno" }); }
  });

  // ── Frontend ────────────────────────────────────────────────────────────────
  if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));
  } else {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }

  app.listen(PORT, () => console.log(`🚀 Rodando na porta ${PORT}`));
}

startServer();
