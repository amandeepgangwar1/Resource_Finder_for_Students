const mongoose = require("mongoose");

const BookmarkSchema = new mongoose.Schema(
  {
    id: String,
    title: String,
    subject: String,
    source: String,
    link: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const SearchHistorySchema = new mongoose.Schema(
  {
    query: String,
    searchedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const LoginHistorySchema = new mongoose.Schema(
  {
    loggedInAt: {
      type: Date,
      default: Date.now
    },
    ip: String,
    userAgent: String
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ["student", "teacher", "admin"],
    default: "student"
  },
  bookmarks: {
    type: [BookmarkSchema],
    default: []
  },
  searchHistory: {
    type: [SearchHistorySchema],
    default: []
  },
  lastLoginAt: Date,
  loginHistory: {
    type: [LoginHistorySchema],
    default: []
  },
  passwordResetTokenHash: {
    type: String,
    default: null
  },
  passwordResetExpiresAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);
