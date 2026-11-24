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

const UserSchema = new mongoose.Schema(
  {
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
      trim: true,
      index: true
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
    bio: {
      type: String,
      default: "",
      maxlength: 300,
      trim: true
    },
    institution: {
      type: String,
      default: "",
      maxlength: 120,
      trim: true
    },
    fieldOfStudy: {
      type: String,
      default: "",
      maxlength: 120,
      trim: true
    },
    avatarColor: {
      type: String,
      default: "#2563eb"
    },
    isEmailVerified: {
      type: Boolean,
      default: false
    },
    emailVerificationTokenHash: {
      type: String,
      default: null
    },
    emailVerificationOtp: {
      type: String,
      default: null
    },
    emailVerificationExpiresAt: {
      type: Date,
      default: null
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
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
