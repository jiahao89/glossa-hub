const { db } = require('../config/db.cjs');

// In-memory cache for glossary terms: projectId -> { timestamp, terms }
const glossaryCache = new Map();
const GLOSSARY_CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

/**
 * Get all glossary terms for a project with in-memory caching
 * Prevents querying the remote database for 2000+ rows on every single translated word
 */
async function getCachedGlossaryTerms(projectId) {
  const now = Date.now();
  const cached = glossaryCache.get(projectId);
  if (cached && (now - cached.timestamp < GLOSSARY_CACHE_TTL_MS)) {
    return cached.terms;
  }

  const glossaryQuery = `
    SELECT t.cn_term, t.en_term, t.fields 
    FROM glossary_terms t
    JOIN glossary_tables tb ON t.table_id = tb.id
    WHERE tb.project_id = $1
  `;
  const terms = await db.query(glossaryQuery, [projectId]);
  glossaryCache.set(projectId, { timestamp: now, terms: terms || [] });
  return terms || [];
}

/**
 * Invalidate glossary cache when terms are added, modified, or deleted
 */
function invalidateGlossaryCache(projectId) {
  if (projectId) {
    glossaryCache.delete(projectId);
  } else {
    glossaryCache.clear();
  }
}

module.exports = {
  getCachedGlossaryTerms,
  invalidateGlossaryCache
};
