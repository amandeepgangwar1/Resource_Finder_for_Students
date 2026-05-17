const axios = require("axios");
const natural = require("natural");

const HF_API_KEY = process.env.HF_API_KEY || process.env.HF_TOKEN || "";
const HF_API_BASE =
  process.env.HF_API_BASE || "https://router.huggingface.co/hf-inference/models";
const HF_TIMEOUT_MS = Number(process.env.HF_TIMEOUT_MS || 12000);

const SUBJECT_LABELS = [
  "Mathematics",
  "Science",
  "History",
  "Literature",
  "Programming",
  "Geography",
  "Economics",
  "Art"
];

const HF_MODELS = {
  classification: "facebook/bart-large-mnli",
  summarization: "facebook/bart-large-cnn",
  questionAnswering: "deepset/roberta-base-squad2",
  moderation: "unitary/toxic-bert",
  sentiment: "distilbert/distilbert-base-uncased-finetuned-sst-2-english",
  entities: "dslim/bert-base-NER"
};

const AI_MODEL_CATALOG = [
  {
    id: "semantic-search",
    name: "Semantic Search",
    endpoint: "POST /api/ai/semantic-search",
    provider: "Local Natural.js",
    model: "TF-IDF + cosine/token similarity",
    free: true,
    requiresApiKey: false
  },
  {
    id: "classification",
    name: "Auto-Classification",
    endpoint: "POST /api/ai/classify",
    provider: "Hugging Face HF Inference",
    model: HF_MODELS.classification,
    free: true,
    requiresApiKey: true,
    fallback: "Local subject keyword classifier"
  },
  {
    id: "summarization",
    name: "Summarization",
    endpoint: "POST /api/ai/summarize",
    provider: "Hugging Face HF Inference",
    model: HF_MODELS.summarization,
    free: true,
    requiresApiKey: true,
    fallback: "Local sentence extraction"
  },
  {
    id: "question-answering",
    name: "Question Answering",
    endpoint: "POST /api/ai/qa",
    provider: "Hugging Face HF Inference",
    model: HF_MODELS.questionAnswering,
    free: true,
    requiresApiKey: true,
    fallback: "Local sentence scorer"
  },
  {
    id: "duplicate-detection",
    name: "Duplicate Detection",
    endpoint: "GET /api/ai/duplicates",
    provider: "Local algorithm",
    model: "Levenshtein + token overlap",
    free: true,
    requiresApiKey: false
  },
  {
    id: "recommendations",
    name: "Recommendations",
    endpoint: "GET /api/ai/recommendations",
    provider: "Local algorithm",
    model: "Subject, keyword, rating, and view scoring",
    free: true,
    requiresApiKey: false
  },
  {
    id: "moderation",
    name: "Content Moderation",
    endpoint: "POST /api/ai/moderate",
    provider: "Hugging Face HF Inference",
    model: HF_MODELS.moderation,
    free: true,
    requiresApiKey: true,
    fallback: "Local unsafe-word screening"
  },
  {
    id: "sentiment",
    name: "Sentiment Analysis",
    endpoint: "POST /api/ai/sentiment",
    provider: "Hugging Face HF Inference",
    model: HF_MODELS.sentiment,
    free: true,
    requiresApiKey: true,
    fallback: "Local lexicon scorer"
  },
  {
    id: "entities",
    name: "Entity Extraction",
    endpoint: "POST /api/ai/entities",
    provider: "Hugging Face HF Inference",
    model: HF_MODELS.entities,
    free: true,
    requiresApiKey: true,
    fallback: "Local capitalized phrase extractor"
  },
  {
    id: "keywords",
    name: "Keyword Extraction",
    endpoint: "POST /api/ai/keywords",
    provider: "Local Natural.js",
    model: "Token frequency + stopword filtering",
    free: true,
    requiresApiKey: false
  }
];

const SUBJECT_KEYWORDS = {
  Mathematics: [
    "algebra",
    "calculus",
    "equation",
    "geometry",
    "linear",
    "matrix",
    "number",
    "probability",
    "statistics",
    "theorem",
    "trigonometry"
  ],
  Science: [
    "atom",
    "biology",
    "chemical",
    "chemistry",
    "experiment",
    "molecule",
    "physics",
    "reaction",
    "science",
    "theory"
  ],
  History: [
    "ancient",
    "century",
    "civilization",
    "dynasty",
    "empire",
    "history",
    "revolution",
    "war"
  ],
  Literature: [
    "author",
    "character",
    "literature",
    "novel",
    "poem",
    "poetry",
    "plot",
    "story",
    "writing"
  ],
  Programming: [
    "algorithm",
    "api",
    "code",
    "computer",
    "css",
    "database",
    "function",
    "html",
    "javascript",
    "node",
    "programming",
    "python",
    "software"
  ],
  Geography: [
    "climate",
    "continent",
    "country",
    "geography",
    "latitude",
    "location",
    "map",
    "region",
    "river"
  ],
  Economics: [
    "currency",
    "demand",
    "economics",
    "finance",
    "market",
    "price",
    "supply",
    "trade"
  ],
  Art: [
    "art",
    "artist",
    "gallery",
    "museum",
    "music",
    "painting",
    "sculpture",
    "visual"
  ]
};

const STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "because",
  "been",
  "before",
  "being",
  "between",
  "but",
  "can",
  "could",
  "did",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "how",
  "into",
  "its",
  "learn",
  "more",
  "not",
  "of",
  "on",
  "or",
  "our",
  "resource",
  "resources",
  "should",
  "than",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "this",
  "through",
  "to",
  "tutorial",
  "using",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "you",
  "your"
]);

const POSITIVE_WORDS = new Set([
  "accurate",
  "amazing",
  "best",
  "clear",
  "easy",
  "excellent",
  "good",
  "great",
  "helpful",
  "improved",
  "love",
  "perfect",
  "positive",
  "recommend",
  "useful",
  "valuable"
]);

const NEGATIVE_WORDS = new Set([
  "bad",
  "broken",
  "confusing",
  "difficult",
  "error",
  "hate",
  "incorrect",
  "negative",
  "poor",
  "problem",
  "slow",
  "terrible",
  "unclear",
  "useless",
  "wrong"
]);

const UNSAFE_WORDS = new Set([
  "abuse",
  "attack",
  "explicit",
  "harass",
  "hate",
  "kill",
  "nsfw",
  "racist",
  "sex",
  "spam",
  "threat",
  "toxic",
  "violence"
]);

const tokenizer = new natural.WordTokenizer();

const hasConfiguredHuggingFaceKey = () =>
  Boolean(HF_API_KEY) &&
  !["hf_defaultkey", "hf_your_token_here", "your_hugging_face_token"].includes(
    HF_API_KEY
  );

const getAIProviderStatus = () => ({
  huggingFaceConfigured: hasConfiguredHuggingFaceKey(),
  huggingFaceBaseUrl: HF_API_BASE,
  localFallbacksEnabled: true
});

const normalizeText = (value = "") =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (text) =>
  tokenizer
    .tokenize(normalizeText(text))
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));

const unique = (items) => [...new Set(items)];

const jaccardSimilarity = (leftTokens, rightTokens) => {
  const left = new Set(leftTokens);
  const right = new Set(rightTokens);
  if (!left.size && !right.size) return 1;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
};

const callHuggingFace = async (model, payload) => {
  if (!hasConfiguredHuggingFaceKey()) {
    throw new Error("HF_API_KEY is not configured");
  }

  const response = await axios.post(`${HF_API_BASE}/${model}`, payload, {
    headers: {
      Authorization: `Bearer ${HF_API_KEY}`,
      "Content-Type": "application/json"
    },
    timeout: HF_TIMEOUT_MS
  });

  if (response.data && response.data.error) {
    throw new Error(response.data.error);
  }

  return response.data;
};

class SemanticSearch {
  async searchSimilar(query, documents) {
    try {
      const safeDocuments = documents.map((doc) => String(doc || ""));
      const queryTokens = tokenize(query);
      const tfidf = new natural.TfIdf();

      safeDocuments.forEach((doc) => tfidf.addDocument(doc));

      const scores = safeDocuments.map((doc, index) => {
        const docTokens = tokenize(doc);
        const tfidfScore = queryTokens.reduce(
          (score, token) => score + tfidf.tfidf(token, index),
          0
        );
        const overlap = jaccardSimilarity(queryTokens, docTokens);
        const similarity = Math.min(
          1,
          overlap * 0.65 + Math.min(tfidfScore / 10, 1) * 0.35
        );

        return { index, similarity, doc };
      });

      return scores.sort((a, b) => b.similarity - a.similarity);
    } catch (error) {
      console.error("Semantic search error:", error.message);
      return [];
    }
  }
}

const fallbackClassification = (text) => {
  const textTokens = tokenize(text);
  const scoresBySubject = Object.entries(SUBJECT_KEYWORDS).map(
    ([subject, words]) => {
      const score = words.filter((word) => textTokens.includes(word)).length;
      return { subject, score };
    }
  );

  scoresBySubject.sort((a, b) => b.score - a.score);
  const best = scoresBySubject[0];
  const totalMatches = scoresBySubject.reduce((sum, item) => sum + item.score, 0);

  if (!totalMatches) {
    return {
      labels: scoresBySubject.map((item) => item.subject),
      scores: scoresBySubject.map(() => 0),
      classification: null,
      confidence: 0,
      provider: "local-fallback",
      model: "subject-keyword-classifier"
    };
  }

  const confidence = best.score
    ? Math.min(0.95, 0.55 + best.score / Math.max(totalMatches, 4))
    : 0.35;

  return {
    labels: scoresBySubject.map((item) => item.subject),
    scores: scoresBySubject.map((item) =>
      item.subject === best.subject ? confidence : 0
    ),
    classification: best.subject,
    confidence,
    provider: "local-fallback",
    model: "subject-keyword-classifier"
  };
};

const classifyText = async (text, labels = SUBJECT_LABELS) => {
  try {
    const data = await callHuggingFace(HF_MODELS.classification, {
      inputs: text,
      parameters: {
        candidate_labels: labels
      }
    });

    return {
      labels: data.labels || [],
      scores: data.scores || [],
      classification: data.labels ? data.labels[0] : null,
      confidence: data.scores ? data.scores[0] : 0,
      provider: "huggingface",
      model: HF_MODELS.classification
    };
  } catch (error) {
    console.error("Classification fallback:", error.message);
    return fallbackClassification(text);
  }
};

const fallbackSummarize = (text, maxLength = 100) => {
  const sentences = String(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (!sentences.length) return "";

  const keywords = extractKeywords(text, 8).keywords;
  const ranked = sentences.map((sentence, index) => {
    const lowerSentence = normalizeText(sentence);
    const keywordHits = keywords.filter((keyword) =>
      lowerSentence.includes(keyword.toLowerCase())
    ).length;
    return {
      sentence,
      index,
      score: keywordHits + (index === 0 ? 0.5 : 0)
    };
  });

  const summary = ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(3, Math.ceil(sentences.length / 3)))
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence)
    .join(" ");

  return summary.length > maxLength
    ? `${summary.slice(0, Math.max(0, maxLength - 3)).trim()}...`
    : summary;
};

const summarizeText = async (text, options = {}) => {
  const maxLength = Number(options.maxLength || 160);
  const truncatedText = String(text).slice(0, 2048);

  try {
    const data = await callHuggingFace(HF_MODELS.summarization, {
      inputs: truncatedText,
      parameters: {
        max_length: Math.min(Math.max(maxLength, 30), 220),
        min_length: Math.min(30, Math.max(10, Math.floor(maxLength / 3))),
        do_sample: false
      }
    });

    const summary = Array.isArray(data)
      ? data[0]?.summary_text
      : data.summary_text;

    return {
      summary: summary || fallbackSummarize(text, maxLength),
      provider: "huggingface",
      model: HF_MODELS.summarization
    };
  } catch (error) {
    console.error("Summarization fallback:", error.message);
    return {
      summary: fallbackSummarize(text, maxLength),
      provider: "local-fallback",
      model: "sentence-extraction"
    };
  }
};

const fallbackAnswerQuestion = (question, context) => {
  const questionTokens = tokenize(question);
  const sentences = String(context)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const best = sentences
    .map((sentence) => {
      const sentenceTokens = tokenize(sentence);
      return {
        sentence,
        score: jaccardSimilarity(questionTokens, sentenceTokens)
      };
    })
    .sort((a, b) => b.score - a.score)[0];

  return {
    answer: best && best.score > 0 ? best.sentence : "No clear answer found.",
    score: best ? Number(best.score.toFixed(3)) : 0,
    provider: "local-fallback",
    model: "sentence-similarity"
  };
};

const answerQuestion = async (question, context) => {
  try {
    const data = await callHuggingFace(HF_MODELS.questionAnswering, {
      inputs: {
        question,
        context: String(context).slice(0, 2048)
      }
    });

    return {
      answer: data.answer || "No answer found.",
      score: data.score || 0,
      provider: "huggingface",
      model: HF_MODELS.questionAnswering
    };
  } catch (error) {
    console.error("Question answering fallback:", error.message);
    return fallbackAnswerQuestion(question, context);
  }
};

const getEditDistance = (s1, s2) => {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
};

const stringSimilarity = (str1, str2) => {
  const left = normalizeText(str1);
  const right = normalizeText(str2);
  const longer = left.length > right.length ? left : right;
  const shorter = left.length > right.length ? right : left;

  if (longer.length === 0) return 1;

  const editDistance = getEditDistance(longer, shorter);
  const editSimilarity = (longer.length - editDistance) / longer.length;
  const tokenSimilarity = jaccardSimilarity(tokenize(left), tokenize(right));

  return Number((editSimilarity * 0.55 + tokenSimilarity * 0.45).toFixed(4));
};

const resourceText = (resource) =>
  [
    resource.title,
    resource.subject,
    resource.summary,
    Array.isArray(resource.keywords) ? resource.keywords.join(" ") : ""
  ]
    .filter(Boolean)
    .join(" ");

const detectDuplicates = async (documents, threshold = 0.72) => {
  const duplicates = [];

  for (let i = 0; i < documents.length; i++) {
    for (let j = i + 1; j < documents.length; j++) {
      const similarity = stringSimilarity(
        resourceText(documents[i]),
        resourceText(documents[j])
      );

      if (similarity >= threshold) {
        duplicates.push({
          doc1: documents[i],
          doc2: documents[j],
          similarity
        });
      }
    }
  }

  return duplicates.sort((a, b) => b.similarity - a.similarity);
};

const getRecommendations = (userHistory = [], allResources = []) => {
  try {
    const historyIds = new Set(userHistory.map((resource) => String(resource._id)));
    const historySubjects = new Set(
      userHistory.map((resource) => resource.subject).filter(Boolean)
    );
    const historyKeywords = new Set(
      userHistory.flatMap((resource) =>
        Array.isArray(resource.keywords) ? resource.keywords : tokenize(resourceText(resource))
      )
    );

    return [...allResources]
      .filter((resource) => !historyIds.has(String(resource._id)))
      .map((resource) => {
        const resourceKeywords = Array.isArray(resource.keywords)
          ? resource.keywords
          : tokenize(resourceText(resource));
        const subjectScore = historySubjects.has(resource.subject) ? 3 : 0;
        const keywordScore =
          resourceKeywords.filter((keyword) => historyKeywords.has(keyword)).length * 0.5;
        const ratingScore = Number(resource.rating || 0) * 0.4;
        const viewScore = Math.min(Number(resource.views || 0) / 100, 1);

        return {
          resource,
          score: subjectScore + keywordScore + ratingScore + viewScore
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((item) => ({
        ...item.resource.toObject?.() || item.resource,
        recommendationScore: Number(item.score.toFixed(2))
      }));
  } catch (error) {
    console.error("Recommendation error:", error.message);
    return [];
  }
};

const normalizeModeration = (data) => {
  const labels = Array.isArray(data?.[0]) ? data[0] : data;
  const toxicScore = Array.isArray(labels)
    ? labels
        .filter((item) => /toxic|insult|obscene|threat|hate/i.test(item.label))
        .reduce((max, item) => Math.max(max, Number(item.score || 0)), 0)
    : 0;

  return {
    label: toxicScore >= 0.5 ? "UNSAFE" : "SAFE",
    score: toxicScore >= 0.5 ? toxicScore : 1 - toxicScore,
    isSafe: toxicScore < 0.5
  };
};

const fallbackModeration = (text) => {
  const tokens = tokenize(text);
  const matches = tokens.filter((token) => UNSAFE_WORDS.has(token));
  const isSafe = matches.length === 0;

  return {
    label: isSafe ? "SAFE" : "UNSAFE",
    score: isSafe ? 0.95 : Math.min(0.95, 0.6 + matches.length * 0.1),
    isSafe,
    matches,
    provider: "local-fallback",
    model: "unsafe-word-screening"
  };
};

const moderateContent = async (text) => {
  try {
    const data = await callHuggingFace(HF_MODELS.moderation, {
      inputs: text
    });

    return {
      ...normalizeModeration(data),
      provider: "huggingface",
      model: HF_MODELS.moderation
    };
  } catch (error) {
    console.error("Moderation fallback:", error.message);
    return fallbackModeration(text);
  }
};

const fallbackSentiment = (text) => {
  const tokens = tokenize(text);
  const positive = tokens.filter((token) => POSITIVE_WORDS.has(token)).length;
  const negative = tokens.filter((token) => NEGATIVE_WORDS.has(token)).length;
  const net = positive - negative;

  if (net > 0) {
    return {
      label: "POSITIVE",
      score: Math.min(0.95, 0.55 + net * 0.12),
      provider: "local-fallback",
      model: "lexicon-sentiment"
    };
  }

  if (net < 0) {
    return {
      label: "NEGATIVE",
      score: Math.min(0.95, 0.55 + Math.abs(net) * 0.12),
      provider: "local-fallback",
      model: "lexicon-sentiment"
    };
  }

  return {
    label: "NEUTRAL",
    score: 0.5,
    provider: "local-fallback",
    model: "lexicon-sentiment"
  };
};

const analyzeSentiment = async (text) => {
  try {
    const data = await callHuggingFace(HF_MODELS.sentiment, {
      inputs: text
    });
    const first = Array.isArray(data) && Array.isArray(data[0]) ? data[0][0] : data[0];

    return {
      label: first?.label || "NEUTRAL",
      score: first?.score || 0.5,
      provider: "huggingface",
      model: HF_MODELS.sentiment
    };
  } catch (error) {
    console.error("Sentiment fallback:", error.message);
    return fallbackSentiment(text);
  }
};

const normalizeEntities = (data) => {
  const entities = [];
  const source = Array.isArray(data) ? data : [];

  for (const item of source) {
    const entityType = String(item.entity_group || item.entity || "MISC").replace(
      /^B-|^I-/,
      ""
    );
    const word = String(item.word || "").replace(/^##/, "").trim();
    if (!word) continue;

    const previous = entities[entities.length - 1];
    if (previous && previous.entity === entityType && item.word?.startsWith("##")) {
      previous.word += word;
      previous.score = Math.max(previous.score, Number(item.score || 0));
    } else {
      entities.push({
        word,
        entity: entityType,
        score: Number(item.score || 0)
      });
    }
  }

  return entities;
};

const fallbackEntities = (text) => {
  const matches = String(text).match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  return unique(matches).slice(0, 12).map((word) => ({
    word,
    entity: "MISC",
    score: 0.5
  }));
};

const extractEntities = async (text) => {
  try {
    const data = await callHuggingFace(HF_MODELS.entities, {
      inputs: text
    });

    return {
      entities: normalizeEntities(data),
      provider: "huggingface",
      model: HF_MODELS.entities
    };
  } catch (error) {
    console.error("Entity extraction fallback:", error.message);
    return {
      entities: fallbackEntities(text),
      provider: "local-fallback",
      model: "capitalized-phrase-extractor"
    };
  }
};

const extractKeywords = (text, limit = 10) => {
  try {
    const tokens = tokenize(text);
    const frequency = tokens.reduce((counts, token) => {
      counts[token] = (counts[token] || 0) + 1;
      return counts;
    }, {});

    const keywords = Object.entries(frequency)
      .sort(([, leftCount], [, rightCount]) => rightCount - leftCount)
      .map(([token]) => token)
      .slice(0, limit);

    return {
      keywords,
      provider: "local",
      model: "token-frequency"
    };
  } catch (error) {
    console.error("Keyword extraction error:", error.message);
    return {
      keywords: [],
      provider: "local",
      model: "token-frequency"
    };
  }
};

module.exports = {
  AI_MODEL_CATALOG,
  SemanticSearch,
  analyzeSentiment,
  answerQuestion,
  classifyText,
  detectDuplicates,
  extractEntities,
  extractKeywords,
  getAIProviderStatus,
  getRecommendations,
  moderateContent,
  summarizeText
};
