import { MongoClient } from "mongodb";
import { faker } from "@faker-js/faker";

const MONGO_URI = process.env.DATABASE_URL ||
  "mongodb://chinedusimeon2020_db_user:fOcCesg7dqCzMr4O@ac-9sedajb-shard-00-00.eadicdq.mongodb.net:27017,ac-9sedajb-shard-00-01.eadicdq.mongodb.net:27017,ac-9sedajb-shard-00-02.eadicdq.mongodb.net:27017/search-engine?ssl=true&replicaSet=atlas-to1hqi-shard-0&authSource=admin&appName=search-engine";

faker.seed(42);

const BATCH = 500;
const TOTAL = 100_000;

const USERS_COUNT = Math.round(TOTAL * 0.4);   // 40,000
const PRODUCTS_COUNT = Math.round(TOTAL * 0.35); // 35,000
const ARTICLES_COUNT = TOTAL - USERS_COUNT - PRODUCTS_COUNT; // 25,000

const DEPARTMENTS = [
  "Engineering", "Design", "Marketing", "Sales", "Product",
  "Data Science", "Security", "Support", "Legal", "Finance", "HR", "Operations",
];

const CATEGORIES = [
  "Software", "Design Assets", "Templates", "Components", "Tools",
  "API", "SaaS", "Mobile App", "Plugin", "Theme",
];

const ALLOWED_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "proton.me", "icloud.com"];

function generateUser(i) {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const domain = faker.helpers.arrayElement(ALLOWED_DOMAINS);
  const skillCount = faker.number.int({ min: 1, max: 8 });
  const bioLen = faker.number.int({ min: 10, max: 50 });

  return {
    id: `user_${i + 1}`,
    type: "user",
    name: `${firstName} ${lastName}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${i}@${domain}`,
    department: faker.helpers.arrayElement(DEPARTMENTS),
    skills: faker.helpers.multiple(() => faker.person.jobArea(), { count: skillCount }),
    bio: faker.lorem.sentences(bioLen),
    joinDate: faker.date.past({ years: 5 }).toISOString(),
    salary: faker.number.int({ min: 30000, max: 200000 }),
    remote: faker.datatype.boolean(),
  };
}

function generateProduct(i) {
  const wordCount = faker.number.int({ min: 3, max: 8 });
  const reviewCount = faker.number.int({ min: 0, max: 500 });

  return {
    id: `prod_${i + 1}`,
    type: "product",
    name: faker.commerce.productName(),
    category: faker.helpers.arrayElement(CATEGORIES),
    brand: faker.company.name(),
    price: faker.number.int({ min: 500, max: 500000 }),
    description: faker.lorem.sentences(wordCount),
    tags: faker.helpers.multiple(
      () => faker.commerce.department(),
      { count: faker.number.int({ min: 1, max: 6 }) }
    ),
    inStock: faker.datatype.boolean(0.85),
    rating: faker.number.float({ min: 1, max: 5, fractionDigits: 1 }),
    releaseDate: faker.date.past({ years: 3 }).toISOString(),
    reviews: reviewCount,
    colors: faker.helpers.multiple(
      () => faker.color.human(),
      { count: faker.number.int({ min: 1, max: 4 }) }
    ),
  };
}

function generateArticle(i) {
  const paragraphCount = faker.number.int({ min: 2, max: 10 });

  return {
    id: `article_${i + 1}`,
    type: "article",
    title: faker.lorem.sentence({ min: 4, max: 12 }).replace(/\.$/, ""),
    author: faker.person.fullName(),
    body: faker.lorem.paragraphs(paragraphCount, "\n\n"),
    tags: faker.helpers.multiple(
      () => faker.book.genre(),
      { count: faker.number.int({ min: 1, max: 5 }) }
    ),
    wordCount: faker.number.int({ min: 200, max: 5000 }),
    publishedAt: faker.date.past({ years: 2 }).toISOString(),
    readTime: faker.number.int({ min: 2, max: 25 }),
    views: faker.number.int({ min: 0, max: 100000 }),
    category: faker.helpers.arrayElement(["Tech", "Business", "Science", "Design", "Tutorial"]),
  };
}

const generators = [
  { label: "Users",    count: USERS_COUNT,    fn: generateUser },
  { label: "Products", count: PRODUCTS_COUNT,  fn: generateProduct },
  { label: "Articles", count: ARTICLES_COUNT,  fn: generateArticle },
];

const client = new MongoClient(MONGO_URI);

try {
  await client.connect();
  console.log("Connected to MongoDB\n");

  const db = client.db();
  const collection = db.collection("documents");

  await collection.deleteMany({});
  console.log("Cleared existing documents\n");

  for (const { label, count, fn } of generators) {
    process.stdout.write(`${label} (${count.toLocaleString()})`);
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
  console.log(`\nDone! ${total.toLocaleString()} documents stored in MongoDB`);
} finally {
  await client.close();
}
