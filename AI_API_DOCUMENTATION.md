# AI API Documentation - Student Resource Finder

This project includes 10 free AI features. Some run fully locally, and the hosted AI features use Hugging Face HF Inference when `HF_API_KEY` is configured. If the key is missing or the hosted API is unavailable, the server falls back to local logic so the endpoints still work.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Add a Hugging Face token to `.env`:

```env
HF_API_KEY=hf_your_token_here
```

3. Start the app:

```bash
npm run dev
```

The app runs on `http://localhost:5000` by default.

## Free Model Catalog

Use this endpoint to list every integrated model/API and provider status:

```http
GET /api/ai/models
```

| Feature | Endpoint | Provider | Model |
|---|---|---|---|
| Semantic Search | `POST /api/ai/semantic-search` | Local Natural.js | TF-IDF + cosine/token similarity |
| Auto-Classification | `POST /api/ai/classify` | Hugging Face + local fallback | `facebook/bart-large-mnli` |
| Summarization | `POST /api/ai/summarize` | Hugging Face + local fallback | `facebook/bart-large-cnn` |
| Question Answering | `POST /api/ai/qa` | Hugging Face + local fallback | `deepset/roberta-base-squad2` |
| Duplicate Detection | `GET /api/ai/duplicates` | Local algorithm | Levenshtein + token overlap |
| Recommendations | `GET /api/ai/recommendations` | Local algorithm | Subject, keyword, rating, and view scoring |
| Content Moderation | `POST /api/ai/moderate` | Hugging Face + local fallback | `unitary/toxic-bert` |
| Sentiment Analysis | `POST /api/ai/sentiment` | Hugging Face + local fallback | `distilbert/distilbert-base-uncased-finetuned-sst-2-english` |
| Entity Extraction | `POST /api/ai/entities` | Hugging Face + local fallback | `dslim/bert-base-NER` |
| Keyword Extraction | `POST /api/ai/keywords` | Local Natural.js | Token frequency + stopword filtering |

Note: Hugging Face currently provides monthly free credits for Inference Providers. Local endpoints are always free because they run in this Node app.

## API Examples

### 1. Semantic Search

```http
POST /api/ai/semantic-search
Content-Type: application/json

{
  "query": "linear algebra tutorial"
}
```

### 2. Auto-Classification

```http
POST /api/ai/classify
Content-Type: application/json

{
  "title": "Python Programming Fundamentals"
}
```

Response:

```json
{
  "success": true,
  "suggested_category": "Programming",
  "confidence": 0.8,
  "provider": "local-fallback",
  "model": "subject-keyword-classifier"
}
```

### 3. Summarization

```http
POST /api/ai/summarize
Content-Type: application/json

{
  "text": "Long document text...",
  "maxLength": 160
}
```

### 4. Question Answering

```http
POST /api/ai/qa
Content-Type: application/json

{
  "question": "What is machine learning?",
  "context": "Machine learning is a subset of artificial intelligence..."
}
```

### 5. Duplicate Detection

```http
GET /api/ai/duplicates
Authorization: <jwt-token>
```

### 6. Recommendations

```http
GET /api/ai/recommendations
Authorization: <jwt-token>
```

Optional history query:

```http
GET /api/ai/recommendations?history=[{"subject":"Programming","keywords":["python"]}]
Authorization: <jwt-token>
```

### 7. Content Moderation

```http
POST /api/ai/moderate
Content-Type: application/json

{
  "text": "Resource content to check"
}
```

### 8. Sentiment Analysis

```http
POST /api/ai/sentiment
Content-Type: application/json

{
  "text": "This tutorial is clear and very helpful."
}
```

### 9. Entity Extraction

```http
POST /api/ai/entities
Content-Type: application/json

{
  "text": "Albert Einstein worked at Princeton University."
}
```

### 10. Keyword Extraction

```http
POST /api/ai/keywords
Content-Type: application/json

{
  "text": "Python programming tutorial for machine learning beginners"
}
```

## Environment Variables

```env
MONGODB_URI=mongodb://localhost:27017/resource-finder
JWT_SECRET=your_jwt_secret_key_here
HF_API_KEY=hf_your_token_here
HF_TIMEOUT_MS=12000
PORT=5000
NODE_ENV=development
```

## Notes

- `POST /api/ai/classify`, `POST /api/ai/moderate`, `POST /api/ai/sentiment`, `POST /api/ai/entities`, `POST /api/ai/keywords`, `POST /api/ai/summarize`, and `POST /api/ai/qa` can be tested without login.
- `GET /api/ai/duplicates`, `GET /api/ai/recommendations`, and `GET /api/ai/insights` require a JWT because they use stored user/resource data.
- Hosted Hugging Face calls require internet access and a real token. Local fallbacks keep the API functional during development.
