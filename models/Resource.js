const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    userName: String,
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      default: ""
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const ResourceSchema = new mongoose.Schema({
  title: String,
  subject: String,
  pdf: String,
  file: String,
  filePath: String,
  originalName: String,
  mimeType: String,
  fileSize: Number,
  fileHash: {
    type: String,
    default: null,
    index: true
  },
  fileCategory: {
    type: String,
    default: "PDF"
  },
  storageFolder: String,
  pageCount: {
    type: Number,
    default: null
  },
  extractedText: {
    type: String,
    default: ""
  },
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
  downloadCount: {
    type: Number,
    default: 0
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  ratingCount: {
    type: Number,
    default: 0
  },
  reviews: {
    type: [ReviewSchema],
    default: []
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Resource", ResourceSchema);
