# AI Integration Summary

The project now exposes 10 AI features through REST APIs. Local features are free by design. Hosted features use Hugging Face HF Inference when a real `HF_API_KEY` is configured and fall back to local logic when the token is missing or the hosted request fails.

## What Was Added

- Normalized AI utility layer in `utils/aiModels.js`
- AI model discovery endpoint: `GET /api/ai/models`
- Public test endpoints for text-only AI features
- Local fallbacks for classification, summarization, Q&A, moderation, sentiment, and entity extraction
- `.env` loading through `dotenv`
- `MONGODB_URI`, `JWT_SECRET`, and `PORT` support
- Updated documentation in `AI_API_DOCUMENTATION.md` and `QUICK_START.md`

## 10 Free AI Features

| Feature | Endpoint | Provider |
|---|---|---|
| Semantic Search | `POST /api/ai/semantic-search` | Local Natural.js |
| Auto-Classification | `POST /api/ai/classify` | Hugging Face + local fallback |
| Summarization | `POST /api/ai/summarize` | Hugging Face + local fallback |
| Question Answering | `POST /api/ai/qa` | Hugging Face + local fallback |
| Duplicate Detection | `GET /api/ai/duplicates` | Local similarity |
| Recommendations | `GET /api/ai/recommendations` | Local scoring |
| Content Moderation | `POST /api/ai/moderate` | Hugging Face + local fallback |
| Sentiment Analysis | `POST /api/ai/sentiment` | Hugging Face + local fallback |
| Entity Extraction | `POST /api/ai/entities` | Hugging Face + local fallback |
| Keyword Extraction | `POST /api/ai/keywords` | Local Natural.js |

## Hosted Models

- `facebook/bart-large-mnli` for zero-shot classification
- `facebook/bart-large-cnn` for summarization
- `deepset/roberta-base-squad2` for question answering
- `unitary/toxic-bert` for moderation
- `distilbert/distilbert-base-uncased-finetuned-sst-2-english` for sentiment
- `dslim/bert-base-NER` for named entities

## Verification

Run:

```bash
npm run dev
curl http://localhost:5000/api/ai/models
```

Then test individual endpoints from `QUICK_START.md`.
