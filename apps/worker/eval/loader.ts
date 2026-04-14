import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

export interface EvalFixture {
  id: string;
  query: string;
  expected_keywords: string[];
  context: string;
}

export function loadFixtures(dir: string): EvalFixture[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  return files.map((f) => {
    const raw = readFileSync(join(dir, f), "utf-8");
    const { data, content } = matter(raw);
    if (typeof data.query !== "string") {
      throw new Error(`fixture ${f}: missing required 'query'`);
    }
    if (!Array.isArray(data.expected_keywords)) {
      throw new Error(`fixture ${f}: missing required 'expected_keywords'`);
    }
    const id = typeof data.id === "string" ? data.id : f.replace(/\.md$/, "");
    return {
      id,
      query: data.query,
      expected_keywords: data.expected_keywords.map(String),
      context: content,
    };
  });
}
