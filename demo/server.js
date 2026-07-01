import "dotenv/config";
import { MongoClient } from "mongodb";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import express from "express";
import { LiteSearchManager } from "litesearch-engine";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MONGO_URI = process.env.MONGO_URI;

async function enrichHits(hits, collection) {
  const ids = hits.map(h => h.id).filter(Boolean);
  if (ids.length === 0) return hits;
  const docs = await collection.find(
    { id: { $in: ids } },
    { projection: { _id: 0 } }
  ).toArray();
  const docMap = new Map(docs.map(d => [d.id, d]));
  return hits.map(h => {
    const doc = docMap.get(h.id);
    if (!doc) return { ...h, document: null };
    const oldIndex = h.document?._index;
    return { ...h, document: oldIndex ? { ...doc, _index: oldIndex } : doc };
  });
}

async function main() {
  const mongo = new MongoClient(MONGO_URI);
  await mongo.connect();
  console.log("Connected to MongoDB");

  const collection = mongo.db().collection("documents");

  const start = performance.now();

  const manager = new LiteSearchManager();

  // ── Indexes: storeDocuments: false — only IDs in memory ────────────────
  manager.createIndex("users", {
    idField: "id",
    storeDocuments: false,
    fields: {
      name:       { weight: 3, suggest: true },
      email:      { weight: 2 },
      department: { weight: 1, suggest: true },
      skills:     { weight: 2 },
      bio:        { weight: 1, suggest: false },
    },
  });

  manager.createIndex("products", {
    idField: "id",
    storeDocuments: false,
    fields: {
      name:        { weight: 3, suggest: true },
      category:    { weight: 1, suggest: true },
      brand:       { weight: 2 },
      description: { weight: 1, suggest: false },
      tags:        { weight: 2 },
    },
  });

  manager.createIndex("articles", {
    idField: "id",
    storeDocuments: false,
    fields: {
      title:   { weight: 3, suggest: true },
      author:  { weight: 2, suggest: true },
      body:    { weight: 1, suggest: false },
      tags:    { weight: 2 },
    },
  });

  const cursor = collection.find().batchSize(500);
  const batches = { users: [], products: [], articles: [] };
  const indexMap = { user: "users", product: "products", article: "articles" };
  let count = 0;

  for await (const doc of cursor) {
    batches[indexMap[doc.type]].push(doc);
    count++;
  }

  for (const [name, docs] of Object.entries(batches)) {
    if (docs.length) {
      manager.addMany(name, docs);
      console.log(`  ${name}: ${docs.length} documents`);
    }
  }

  const took = (performance.now() - start).toFixed(0);
  console.log(`Indexed ${count} documents in ${took}ms`);
  console.log(`  users:    ${manager.stats("users").documentCount}`);
  console.log(`  products: ${manager.stats("products").documentCount}`);
  console.log(`  articles: ${manager.stats("articles").documentCount}`);

  // ── Express ─────────────────────────────────────────────────────────────
  const app = express();
  app.use(express.static(join(__dirname, "dist")));

  app.get("/api/search", async (req, res) => {
    const q = (req.query.q || "").trim();
    const index = req.query.index || "all";
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;

    const opts = { limit, offset, highlight: false };

    try {
      if (index === "all") {
        if (!q) {
          // Browse all indexes: query MongoDB directly
          const [docs, total] = await Promise.all([
            collection.find({}, { projection: { _id: 0 } })
              .sort({ _id: 1 }).skip(offset).limit(limit).toArray(),
            collection.countDocuments(),
          ]);
          res.json({
            hits: docs.map(d => ({ id: d.id, document: d, score: 0, matchType: "exact" })),
            total, took: 0, query: q,
            pagination: { limit, offset, hasMore: offset + limit < total },
          });
        } else {
          // Search across all indexes
          let raw = manager.searchAll(q, { ...opts, indexes: ["users", "products", "articles"] });
          const hits = await enrichHits(raw.hits, collection);
          res.json({ ...raw, hits });
        }
      } else {
        if (!q) {
          // Browse single index: query MongoDB directly
          const type = index.replace(/s$/, "");
          const query = collection.find({ type }, { projection: { _id: 0 } });
          const [docs, total] = await Promise.all([
            query.sort({ _id: 1 }).skip(offset).limit(limit).toArray(),
            collection.countDocuments({ type }),
          ]);
          res.json({
            hits: docs.map(d => ({ id: d.id, document: d, score: 0, matchType: "exact" })),
            total, took: 0, query: q,
            pagination: { limit, offset, hasMore: offset + limit < total },
          });
        } else {
          // Search single index
          let raw = manager.search(index, q, opts);
          const hits = await enrichHits(raw.hits, collection);
          res.json({ ...raw, hits });
        }
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

  app.get("/api/facets", async (req, res) => {
    const q = (req.query.q || "").trim();
    const index = req.query.index || "products";
    const field = req.query.field || "category";
    const size = Math.min(parseInt(req.query.size) || 15, 50);
    try {
      if (!q) {
        // Facets over entire index: MongoDB aggregation
        const type = index.replace(/s$/, "");
        const agg = await collection.aggregate([
          { $match: { type } },
          { $group: { _id: `$${field}`, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: size },
        ]).toArray();
        res.json({
          facets: { [field]: { buckets: agg.map(a => ({ value: a._id, count: a.count })) } },
          total: await collection.countDocuments({ type }),
          took: 0,
        });
      } else {
        // Search then compute facets over matching docs
        const raw = manager.search(index, q, { limit: Number.MAX_SAFE_INTEGER, offset: 0, highlight: false });
        const ids = raw.hits.map(h => h.id).filter(Boolean);
        if (ids.length === 0) return res.json({ facets: {}, total: 0, took: raw.took });

        const agg = await collection.aggregate([
          { $match: { id: { $in: ids } } },
          { $group: { _id: `$${field}`, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: size },
        ]).toArray();
        res.json({
          facets: { [field]: { buckets: agg.map(a => ({ value: a._id, count: a.count })) } },
          total: raw.total,
          took: raw.took,
        });
      }
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  const PORT = process.env.PORT || 3456;
  app.listen(PORT, () => {
    console.log(`\nDemo at http://localhost:${PORT}`);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
