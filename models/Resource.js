const mongoose = require("mongoose");

const ResourceSchema = new mongoose.Schema({
  title: String,
  subject: String,
  pdf: String,
  file: String,
  filePath: String,
  originalName: String,
  mimeType: String,
  fileSize: Number,
  fileCategory: {
    type: String,
    default: "PDF"
  },
  storageFolder: String,
  // AI-generated fields
  classification: {
    type: String,
    default: null
  },
  classificationConfidence: {
    type: Number,
    default: 0
  },
  summary: {
    type: String,
    default: null
  },
  keywords: [String],
  sentiment: {
    type: String,
    default: "NEUTRAL"
  },
  sentimentScore: {
    type: Number,
    default: 0.5
  },
  entities: [String],
  isFlagged: {
    type: Boolean,
    default: false
  },
  flagReason: {
    type: String,
    default: null
  },
  views: {
    type: Number,
    default: 0
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Resource", ResourceSchema);
