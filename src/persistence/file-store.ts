// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — File Store (Node.js only)
// ─────────────────────────────────────────────────────────────────────────────

import { serialize, deserialize } from "./serializer";
import { LiteSearch } from "../engine";
import type { AnyDocument, LiteSearchConfig } from "../types/index";

async function getFs(): Promise<typeof import("fs/promises") | null> {
  try {
    return await import("fs/promises");
  } catch {
    return null;
  }
}

export async function saveToFile(
  engine: LiteSearch<AnyDocument>,
  filePath: string
): Promise<void> {
  const fs = await getFs();
  if (!fs) {
    throw new Error("File persistence requires Node.js");
  }
  const json = serialize(engine);
  await fs.writeFile(filePath, json, "utf-8");
}

export async function loadFromFile<T extends AnyDocument = AnyDocument>(
  filePath: string,
  config: LiteSearchConfig<T>
): Promise<LiteSearch<T>> {
  const fs = await getFs();
  if (!fs) {
    throw new Error("File persistence requires Node.js");
  }
  const content = await fs.readFile(filePath, "utf-8");
  return deserialize(content, config);
}
