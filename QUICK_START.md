# Quick Start - AI Features

## 1. Configure

Create or update `.env`:

```env
MONGODB_URI=mongodb://localhost:27017/resource-finder
JWT_SECRET=your_jwt_secret_key_here
HF_API_KEY=hf_your_token_here
PORT=5000
NODE_ENV=development
```

`HF_API_KEY` is optional for local development. Without it, the app uses local fallbacks.

## 2. Run

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5000
```

## 3. List All AI Models

```bash
curl http://localhost:5000/api/ai/models
```

## 4. Test Free APIs

```bash
curl -X POST http://localhost:5000/api/ai/classify \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Python programming tutorial\"}"
```

```bash
curl -X POST http://localhost:5000/api/ai/summarize \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"Machine learning is a field of artificial intelligence that helps computers learn from data. It is used in search, recommendations, fraud detection, and automation.\",\"maxLength\":120}"
```

```bash
curl -X POST http://localhost:5000/api/ai/qa \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"What does machine learning help computers do?\",\"context\":\"Machine learning helps computers learn from data and improve predictions.\"}"
```

```bash
curl -X POST http://localhost:5000/api/ai/keywords \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"Python programming tutorial for machine learning beginners\"}"
```

## Included AI Features

| # | Feature | Endpoint | Free implementation |
|---|---|---|---|
| 1 | Semantic Search | `/api/ai/semantic-search` | Local TF-IDF |
| 2 | Auto-Classification | `/api/ai/classify` | Hugging Face + local fallback |
| 3 | Summarization | `/api/ai/summarize` | Hugging Face + local fallback |
| 4 | Question Answering | `/api/ai/qa` | Hugging Face + local fallback |
| 5 | Duplicate Detection | `/api/ai/duplicates` | Local similarity |
| 6 | Recommendations | `/api/ai/recommendations` | Local scoring |
| 7 | Content Moderation | `/api/ai/moderate` | Hugging Face + local fallback |
| 8 | Sentiment Analysis | `/api/ai/sentiment` | Hugging Face + local fallback |
| 9 | Entity Extraction | `/api/ai/entities` | Hugging Face + local fallback |
| 10 | Keyword Extraction | `/api/ai/keywords` | Local token frequency |
