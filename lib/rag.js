import fs from "node:fs";
import path from "node:path";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "loan",
  "me",
  "my",
  "of",
  "on",
  "or",
  "please",
  "the",
  "to",
  "want",
  "what",
  "which",
  "with",
]);

let cachedKnowledge = null;

function getKnowledgePath() {
  return path.join(process.cwd(), "data", "loan_knowledge.json");
}

function tokenize(text) {
  return `${text || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9.%]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token));
}

function loadKnowledge() {
  if (cachedKnowledge) {
    return cachedKnowledge;
  }

  const knowledgePath = getKnowledgePath();
  const raw = fs.readFileSync(knowledgePath, "utf8");
  const rows = JSON.parse(raw);

  cachedKnowledge = rows.map((item) => ({
    ...item,
    tokens: tokenize(item.text),
  }));

  return cachedKnowledge;
}

export function getKnowledgeStatus() {
  try {
    const knowledge = loadKnowledge();
    return {
      ok: knowledge.length > 0,
      records: knowledge.length,
    };
  } catch {
    return {
      ok: false,
      records: 0,
    };
  }
}

export function retrieveRelevantKnowledge(query, history = "") {
  const knowledge = loadKnowledge();
  const queryTokens = tokenize(`${query} ${history}`);

  if (!queryTokens.length) {
    return knowledge.slice(0, 5);
  }

  const queryTokenSet = new Set(queryTokens);

  return knowledge
    .map((item) => {
      let score = 0;

      for (const token of item.tokens) {
        if (queryTokenSet.has(token)) {
          score += token.length > 3 ? 2 : 1;
        }
      }

      if (item.text.toLowerCase().includes("loan type: lap") && query.toLowerCase().includes("lap")) {
        score += 4;
      }

      return {
        ...item,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}
