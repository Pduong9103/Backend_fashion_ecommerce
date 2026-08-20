// services/agents/ragService.js
const fs = require('fs');
const path = require('path');
const openai = require('../../utils/openai');

const knowledgeDir = path.join(__dirname, '..', '..', 'data', 'knowledge');

// In-memory document chunks & embeddings cache
let documentsCache = [];
let isInitialized = false;

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function loadAllKnowledgeDocs() {
  const docs = [];
  try {
    const files = fs.readdirSync(knowledgeDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = fs.readFileSync(path.join(knowledgeDir, file), 'utf8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          docs.push(...parsed);
        }
      }
    }
  } catch (err) {
    console.error('[RAG] Error loading knowledge files:', err.message);
  }
  return docs;
}

async function getEmbedding(text) {
  try {
    if (!process.env.OPENAI_API_KEY) return null;
    const response = await openai.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.replace(/\n/g, ' ')
    });
    return response.data[0].embedding;
  } catch (error) {
    console.warn('[RAG] OpenAI Embedding API failed, falling back to keyword similarity:', error.message);
    return null;
  }
}

async function initRAGStore() {
  if (isInitialized && documentsCache.length > 0) return;
  const rawDocs = loadAllKnowledgeDocs();
  documentsCache = [];

  for (const doc of rawDocs) {
    const fullText = `${doc.title}: ${doc.content}`;
    const embedding = await getEmbedding(fullText);
    documentsCache.push({
      ...doc,
      fullText,
      embedding
    });
  }
  isInitialized = true;
  console.log(`[RAG Store] Initialized with ${documentsCache.length} knowledge chunks.`);
}

// Semantic Search over Knowledge Base
async function searchKnowledgeBase(query, topK = 3) {
  await initRAGStore();
  if (documentsCache.length === 0) return [];

  const queryEmbedding = await getEmbedding(query);

  if (queryEmbedding) {
    // Vector search with Cosine Similarity
    const scored = documentsCache.map(doc => ({
      doc,
      score: doc.embedding ? cosineSimilarity(queryEmbedding, doc.embedding) : 0
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(s => s.doc);
  } else {
    // Keyword Fallback
    const qWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const scored = documentsCache.map(doc => {
      const text = doc.fullText.toLowerCase();
      let matchCount = 0;
      for (const w of qWords) {
        if (text.includes(w)) matchCount += 1;
      }
      return { doc, score: matchCount };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(s => s.doc);
  }
}

module.exports = {
  initRAGStore,
  searchKnowledgeBase
};
