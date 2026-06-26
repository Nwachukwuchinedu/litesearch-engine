import { MongoClient } from "mongodb";

const MONGO_URI = process.env.DATABASE_URL ||
  "mongodb://chinedusimeon2020_db_user:fOcCesg7dqCzMr4O@ac-9sedajb-shard-00-00.eadicdq.mongodb.net:27017,ac-9sedajb-shard-00-01.eadicdq.mongodb.net:27017,ac-9sedajb-shard-00-02.eadicdq.mongodb.net:27017/search-engine?ssl=true&replicaSet=atlas-to1hqi-shard-0&authSource=admin&appName=search-engine";

const firstNames = [
  "Chiamaka", "Kofi", "Aisha", "Amara", "Zanele", "Kwame", "Ngozi", "Tendai",
  "Folake", "Oluwaseun", "Mensah", "Akua", "Chidi", "Nyasha", "Sefu", "Imani",
  "Jamal", "Zahara", "Obinna", "Adwoa", "Fatima", "Musa", "Nkechi", "Kwesi",
  "Zuri", "Babatunde", "Chinwe", "Kwaku", "Ifeanyi", "Amina",
];

const lastNames = [
  "Obi", "Mensah", "Bello", "Okafor", "Nkosi", "Asante", "Eze", "Moyo",
  "Adeyemi", "Ogunlesi", "Sarpong", "Boateng", "Okonkwo", "Mbedzi", "Kamara",
  "Abara", "Diop", "Nwachukwu", "Tshabalala", "Quansah", "Adegoke", "Keita",
  "Nwosu", "Agyapong", "Osei", "Balogun", "Okeke", "Acquah", "Nnamani", "Sesay",
];

const departments = [
  "Engineering", "Design", "Marketing", "Sales", "Product", "Data Science",
  "Security", "Support", "Legal", "Finance", "HR", "Operations",
];

const skills = [
  "JavaScript", "TypeScript", "Python", "React", "Vue.js", "Node.js", "Rust",
  "Go", "SQL", "MongoDB", "Docker", "Kubernetes", "AWS", "Figma", "UI Design",
  "UX Research", "Content Strategy", "SEO", "Data Analysis", "Machine Learning",
  "DevOps", "Terraform", "GraphQL", "Redis", "PostgreSQL",
];

const productNames = [
  "Wireframe Kit", "Icon Bundle", "UI Component Library", "Dashboard Template",
  "Landing Page Pack", "Email Template Set", "Design System Pro",
  "Analytics Dashboard", "Chat Widget", "Form Builder Pro",
];

const categories = [
  "Software", "Design Assets", "Templates", "Components", "Tools",
];

const brands = [
  "Acme Corp", "TechFlow", "DesignLab", "CodeCraft", "PixelPerfect",
  "DataVault", "CloudNine", "StreamLine", "NexGen", "BaseLayer",
];

const articleTopics = [
  "Getting Started with TypeScript", "Design Systems at Scale", "Understanding BM25 Scoring",
  "Building Search Interfaces", "Zero-Dependency Libraries", "Full-Text Search Best Practices",
  "Performance Optimization Tips", "Modern Frontend Architecture", "API Design Patterns",
  "Database Indexing Strategies", "State Management in React", "CSS Grid Deep Dive",
  "Node.js Streams Explained", "Authentication Patterns", "Microservices vs Monolith",
  "Search Relevance Tuning", "Accessibility in Web Apps", "Testing Strategies",
  "CI/CD Pipeline Setup", "Web Performance Metrics",
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) { return [...arr].sort(() => Math.random() - 0.5).slice(0, n); }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sentence(words) {
  return Array.from({ length: randInt(5, 20) }, () => pick(words)).join(" ");
}

const BATCH = 500;

const client = new MongoClient(MONGO_URI);

try {
  await client.connect();
  console.log("Connected to MongoDB");

  const db = client.db();
  const collection = db.collection("documents");

  await collection.deleteMany({});
  console.log("Cleared existing documents\n");

  const generators = [
    { label: "Users", count: 5000, fn: (i) => {
      const fn = pick(firstNames), ln = pick(lastNames);
      return { id: `user_${i + 1}`, type: "user",
        name: `${fn} ${ln}`,
        email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@example.com`,
        department: pick(departments),
        skills: pickN(skills, randInt(1, 5)),
        bio: sentence(skills) };
    }},
    { label: "Products", count: 3000, fn: (i) => {
      const base = pick(productNames);
      return { id: `prod_${i + 1}`, type: "product",
        name: `${base} v${randInt(1, 5)}`,
        category: pick(categories), brand: pick(brands),
        price: randInt(1000, 500000),
        description: sentence([...productNames, ...categories, "design", "code", "build", "ship", "scale"]),
        tags: pickN([...categories, ...productNames], randInt(1, 4)) };
    }},
    { label: "Articles", count: 2000, fn: (i) => {
      const topic = pick(articleTopics);
      return { id: `article_${i + 1}`, type: "article",
        title: topic, author: `${pick(firstNames)} ${pick(lastNames)}`,
        body: sentence([...articleTopics, "search", "index", "query", "token", "score", "rank", "filter", "facet", "sort"]),
        tags: pickN([...articleTopics, ...skills], randInt(1, 4)),
        wordCount: randInt(200, 3000) };
    }},
  ];

  for (const { label, count, fn } of generators) {
    process.stdout.write(`${label} (${count})`);
    let batch = [];
    for (let i = 0; i < count; i++) {
      batch.push(fn(i));
      if (batch.length === BATCH) {
        await collection.insertMany(batch);
        batch.length = 0;
        process.stdout.write(".");
      }
    }
    if (batch.length) await collection.insertMany(batch);
    console.log(" done");
  }

  const total = await collection.countDocuments();
  console.log(`\nDone! ${total} documents stored in MongoDB`);
} finally {
  await client.close();
}
