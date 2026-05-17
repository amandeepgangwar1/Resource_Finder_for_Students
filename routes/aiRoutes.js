const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const router = express.Router();
const Resource = require("../models/Resource");
const User = require("../models/User");
const verifyToken = require("../middleware/authMiddleware");
const { resolveUploadPath } = require("../utils/fileCategorizer");
const {
  AI_MODEL_CATALOG,
  SemanticSearch,
  classifyText,
  summarizeText,
  answerQuestion,
  detectDuplicates,
  getRecommendations,
  moderateContent,
  analyzeSentiment,
  extractEntities,
  extractKeywords,
  getAIProviderStatus
} = require("../utils/aiModels");

const semanticSearch = new SemanticSearch();

function toResourceObject(resource) {
  return resource.toObject ? resource.toObject() : resource;
}

function duplicatePairKey(left, right) {
  return [String(left?._id || ""), String(right?._id || "")]
    .sort()
    .join(":");
}

async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function detectFileDuplicates(resources) {
  const filesByHash = new Map();

  for (const resource of resources) {
    const storedPath = resource.filePath || resource.file || resource.pdf;
    if (!storedPath) continue;

    try {
      const filePath = resolveUploadPath(storedPath);
      if (!fs.existsSync(filePath)) continue;

      const stats = fs.statSync(filePath);
      const hash = await hashFile(filePath);
      const key = `${hash}:${stats.size}`;
      const matches = filesByHash.get(key) || [];
      matches.push(resource);
      filesByHash.set(key, matches);
    } catch (error) {
      console.error("Duplicate file check skipped:", error.message);
    }
  }

  const duplicates = [];
  for (const matches of filesByHash.values()) {
    if (matches.length < 2) continue;

    const sorted = [...matches].sort(
      (left, right) => new Date(left.createdAt) - new Date(right.createdAt)
    );
    const original = sorted[0];

    sorted.slice(1).forEach((duplicate) => {
      duplicates.push({
        doc1: original,
        doc2: duplicate,
        similarity: 1,
        reason: "Same uploaded file content"
      });
    });
  }

  return duplicates;
}

function mergeDuplicateResults(duplicateGroups) {
  const merged = [];
  const seenPairs = new Set();

  duplicateGroups.flat().forEach((duplicate) => {
    const doc1 = duplicate.doc1;
    const doc2 = duplicate.doc2;
    if (!doc1?._id || !doc2?._id) return;

    const key = duplicatePairKey(doc1, doc2);
    if (seenPairs.has(key)) return;

    seenPairs.add(key);
    merged.push({
      doc1: toResourceObject(doc1),
      doc2: toResourceObject(doc2),
      similarity: duplicate.similarity || 0,
      reason: duplicate.reason || "Similar title, subject, or keywords"
    });
  });

  return merged.sort((left, right) => right.similarity - left.similarity);
}

// ===================== AI MODEL CATALOG =====================
router.get("/api/ai/models", (req, res) => {
  res.json({
    success: true,
    providerStatus: getAIProviderStatus(),
    models: AI_MODEL_CATALOG
  });
});

// ===================== 1. SEMANTIC SEARCH =====================
router.post("/api/ai/semantic-search", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ message: "Query required" });
    }

    const resources = await Resource.find();
    const documents = resources.map((r) =>
      [
        r.title,
        r.subject,
        r.summary,
        Array.isArray(r.keywords) ? r.keywords.join(" ") : ""
      ]
        .filter(Boolean)
        .join(" ")
    );

    const results = await semanticSearch.searchSimilar(query, documents);
    const topResults = results
      .slice(0, 10)
      .map((r) => ({
        ...resources[r.index].toObject(),
        relevanceScore: (r.similarity * 100).toFixed(2)
      }));

    res.json({ success: true, results: topResults });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Semantic search failed" });
  }
});

// ===================== 2. AUTO-CLASSIFY RESOURCES =====================
router.post("/api/ai/classify", async (req, res) => {
  try {
    const { title, subject, labels } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Title required" });
    }

    const classification = await classifyText(
      title + " " + (subject || ""),
      Array.isArray(labels) && labels.length ? labels : undefined
    );

    res.json({
      success: true,
      suggested_category: classification.classification || subject,
      confidence: classification.confidence,
      labels: classification.labels,
      scores: classification.scores,
      provider: classification.provider,
      model: classification.model
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Classification failed" });
  }
});

// ===================== 3. SUMMARIZE CONTENT =====================
router.post("/api/ai/summarize", async (req, res) => {
  try {
    const { text, maxLength = 160 } = req.body;

    if (!text) {
      return res.status(400).json({ message: "Text required" });
    }

    const result = await summarizeText(text, { maxLength });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Summarization failed" });
  }
});

// ===================== 4. QUESTION ANSWERING =====================
router.post("/api/ai/qa", async (req, res) => {
  try {
    const { question, context } = req.body;

    if (!question || !context) {
      return res.status(400).json({ message: "Question and context required" });
    }

    const answer = await answerQuestion(question, context);

    res.json({ success: true, ...answer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Question answering failed" });
  }
});

// ===================== 5. DETECT DUPLICATES =====================
router.get("/api/ai/duplicates", verifyToken, async (req, res) => {
  try {
    const resources = await Resource.find();

    if (resources.length < 2) {
      return res.json({ success: true, duplicates: [] });
    }

    const [fileDuplicates, textDuplicates] = await Promise.all([
      detectFileDuplicates(resources),
      detectDuplicates(resources)
    ]);
    const duplicates = mergeDuplicateResults([fileDuplicates, textDuplicates]);

    res.json({
      success: true,
      duplicates,
      totalDuplicates: duplicates.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Duplicate detection failed" });
  }
});

// ===================== 6. GET RECOMMENDATIONS =====================
router.get("/api/ai/recommendations", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    await User.findById(userId);

    let userHistory = [];
    if (req.query.history) {
      try {
        userHistory = JSON.parse(req.query.history);
      } catch (error) {
        return res.status(400).json({ message: "Invalid history JSON" });
      }
    }
    const allResources = await Resource.find();

    const recommendations = getRecommendations(userHistory, allResources);

    res.json({ success: true, recommendations: recommendations });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Recommendations failed" });
  }
});

// ===================== 7. MODERATE CONTENT =====================
router.post("/api/ai/moderate", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ message: "Text required" });
    }

    const moderation = await moderateContent(text);

    res.json({
      success: true,
      is_safe: moderation.isSafe,
      label: moderation.label,
      confidence: moderation.score,
      matches: moderation.matches || [],
      provider: moderation.provider,
      model: moderation.model
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Content moderation failed" });
  }
});

// ===================== 8. SENTIMENT ANALYSIS =====================
router.post("/api/ai/sentiment", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ message: "Text required" });
    }

    const sentiment = await analyzeSentiment(text);

    res.json({
      success: true,
      sentiment: sentiment.label || "NEUTRAL",
      confidence: sentiment.score || 0.5,
      provider: sentiment.provider,
      model: sentiment.model
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Sentiment analysis failed" });
  }
});

// ===================== 9. EXTRACT ENTITIES =====================
router.post("/api/ai/entities", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ message: "Text required" });
    }

    const result = await extractEntities(text);

    res.json({ success: true, ...result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Entity extraction failed" });
  }
});

// ===================== 10. EXTRACT KEYWORDS =====================
router.post("/api/ai/keywords", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ message: "Text required" });
    }

    const result = extractKeywords(text);

    res.json({ success: true, ...result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Keyword extraction failed" });
  }
});

// ===================== 11. AI INSIGHTS DASHBOARD =====================
router.get("/api/ai/insights", verifyToken, async (req, res) => {
  try {
    const resources = await Resource.find();
    const totalResources = resources.length;

    // Get top subjects
    const subjectCount = {};
    resources.forEach((r) => {
      subjectCount[r.subject] = (subjectCount[r.subject] || 0) + 1;
    });

    const topSubjects = Object.entries(subjectCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    res.json({
      success: true,
      insights: {
        totalResources: totalResources,
        topSubjects: Object.fromEntries(topSubjects),
        averageResourcesPerSubject: Object.keys(subjectCount).length
          ? (totalResources / Object.keys(subjectCount).length).toFixed(2)
          : "0.00"
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Insights failed" });
  }
});

module.exports = router;
