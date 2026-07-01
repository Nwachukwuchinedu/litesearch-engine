import "dotenv/config";
import { MongoClient } from "mongodb";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import express from "express";
import { LiteSearchManager } from "litesearch-engine";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MONGO_URI = process.env.MONGO_URI;

async function main() {
  const mongo = new MongoClient(MONGO_URI);
  await mongo.connect();
  console.log("Connected to MongoDB");

  const collection = mongo.db().collection("documents");

  // ── Index into LiteSearch ──────────────────────────────────────────────
  const start = performance.now();

  const manager = new LiteSearchManager();

  manager.createIndex("users", {
    idField: "id",
    fields: {
      name:       { weight: 3, suggest: true },
      email:      { weight: 2 },
      department: { weight: 1, suggest: true },
      skills:     { weight: 2 },
      bio:        { weight: 1 },
    },
  });

  manager.createIndex("products", {
    idField: "id",
    fields: {
      name:        { weight: 3, suggest: true },
      category:    { weight: 1, suggest: true },
      brand:       { weight: 2 },
      description: { weight: 1 },
      tags:        { weight: 2 },
    },
  });

  manager.createIndex("articles", {
    idField: "id",
    fields: {
      title:   { weight: 3, suggest: true },
      author:  { weight: 2, suggest: true },
      body:    { weight: 1 },
      tags:    { weight: 2 },
    },
  });

  const cursor = collection.find().batchSize(500);
  const indexMap = { user: "users", product: "products", article: "articles" };
  let count = 0;

  for await (const doc of cursor) {
    manager.add(indexMap[doc.type], doc);
    count++;
  }

  const took = (performance.now() - start).toFixed(0);
  console.log(`Indexed ${count} documents in ${took}ms`);
  console.log(`  users:    ${manager.stats("users").documentCount}`);
  console.log(`  products: ${manager.stats("products").documentCount}`);
  console.log(`  articles: ${manager.stats("articles").documentCount}`);

  // ── Express ─────────────────────────────────────────────────────────────
  const app = express();
  app.use(express.static(join(__dirname, "dist")));

  app.get("/api/search", (req, res) => {
    const q = (req.query.q || "").trim();
    const index = req.query.index || "all";
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const sortBy = req.query.sort;

    const opts = { limit, offset, highlight: true };
    if (sortBy) {
      const [field, dir] = sortBy.split(":");
      opts.sort = { field, direction: dir || "desc" };
    }

    try {
      if (index === "all") {
        if (!q) {
          // Browse all indexes and merge
          const allHits = [];
          let total = 0;
          for (const name of ["users", "products", "articles"]) {
            const result = manager.browse(name, { limit: Number.MAX_SAFE_INTEGER, offset: 0 });
            for (const hit of result.hits) {
              allHits.push({ ...hit, document: { ...hit.document, _index: name } });
            }
            total += result.total;
          }
          allHits.sort((a, b) => b.score - a.score);
          const paginated = allHits.slice(offset, offset + limit);
          res.json({
            hits: paginated,
            total,
            took: 0,
            query: q,
            pagination: { limit, offset, hasMore: offset + limit < total },
          });
        } else {
          res.json(manager.searchAll(q, { ...opts, indexes: ["users", "products", "articles"] }));
        }
      } else {
        if (!q) res.json(manager.browse(index, opts));
        else res.json(manager.search(index, q, opts));
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/suggest", (req, res) => {
    const q = (req.query.q || "").trim();
    const index = req.query.index || "users";
    if (!q) return res.json({ suggestions: [], took: 0, query: "" });
    try { res.json(manager.suggest(index, q)); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/stats", (req, res) => {
    try {
      res.json({
        users:    manager.stats("users"),
        products: manager.stats("products"),
        articles: manager.stats("articles"),
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/facets", (req, res) => {
    const q = (req.query.q || "").trim();
    const index = req.query.index || "products";
    const field = req.query.field || "category";
    try {
      const result = manager.search(index, q, {
        facets: { [field]: { type: "terms", size: 15 } },
      });
      res.json({ facets: result.facets, took: result.took, total: result.total });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  const PORT = process.env.PORT || 3456;
  app.listen(PORT, () => {
    console.log(`\nDemo at http://localhost:${PORT}`);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
