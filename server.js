require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const connectDB = require("./config/db");
const User = require("./models/User");
const Resource = require("./models/Resource");
const verifyToken = require("./middleware/authMiddleware");
const aiRoutes = require("./routes/aiRoutes");
const { SemanticSearch, answerQuestion, classifyText, extractKeywords, summarizeText } = require("./utils/aiModels");
const { sendPasswordResetEmail } = require("./utils/email");
const { extractPdfMetadata } = require("./utils/pdfText");
const {
  UPLOAD_ROOT,
  buildStoredFileName,
  categorizeFile,
  resolveUploadPath,
  titleFromOriginalName,
  toStoredUploadPath,
  uploadDestination
} = require("./utils/fileCategorizer");

const app = express();
const PORT = Number.parseInt(process.env.PORT, 10) || 5000;
const semanticSearch = new SemanticSearch();
const allowedOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

function corsOptions(req, callback) {
  const origin = req.header("Origin");

  if (!origin || !allowedOrigins.length) {
    callback(null, { origin: true });
    return;
  }

  callback(null, {
    origin: allowedOrigins.includes(origin.replace(/\/+$/, ""))
  });
}

// MIDDLEWARE
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SERVE FRONTEND
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_ROOT));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "student-resource-finder",
    environment: process.env.NODE_ENV || "development"
  });
});

// ================= MULTER =================
const storage = multer.diskStorage({
  destination: uploadDestination,
  filename: (req, file, cb) => cb(null, buildStoredFileName(file))
});
const upload = multer({
  storage,
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_MB || 100) * 1024 * 1024
  }
});
const resourceUpload = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "pdf", maxCount: 1 },
  { name: "resourceFile", maxCount: 1 },
  { name: "resource", maxCount: 1 }
]);

function getUploadedResourceFile(req) {
  return (
    req.file ||
    req.files?.file?.[0] ||
    req.files?.pdf?.[0] ||
    req.files?.resourceFile?.[0] ||
    req.files?.resource?.[0] ||
    null
  );
}

function handleResourceUpload(req, res, next) {
  resourceUpload(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? `File is too large. Maximum size is ${process.env.MAX_UPLOAD_MB || 100}MB.`
          : error.code === "LIMIT_UNEXPECTED_FILE"
            ? "Unexpected file field. Use the resource file upload input."
            : error.message;

      return res.status(400).json({ message });
    }

    console.error("Upload middleware failed:", error);
    return res.status(500).json({ message: "Upload failed" });
  });
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRole(value) {
  return ["student", "teacher", "admin"].includes(value) ? value : "student";
}

function configuredAdminEmails() {
  return String(process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
}

async function roleForRegistration(email, requestedRole) {
  const userCount = await User.countDocuments();
  if (userCount === 0) return "admin";
  if (configuredAdminEmails().includes(email)) return "admin";
  
  // Allow explicit admin registration (for admin-register.html)
  if (requestedRole === "admin") return "admin";
  
  return ["student", "teacher"].includes(requestedRole) ? requestedRole : "student";
}

function publicUserState(user) {
  return {
    name: user.name,
    email: user.email,
    role: normalizeRole(user.role),
    lastLoginAt: user.lastLoginAt,
    bookmarks: (user.bookmarks || []).map((bookmark) => ({
      id: bookmark.id,
      title: bookmark.title,
      subject: bookmark.subject,
      source: bookmark.source,
      link: bookmark.link,
      createdAt: bookmark.createdAt
    })),
    searchHistory: (user.searchHistory || []).map((entry) => entry.query).filter(Boolean)
  };
}

function publicUserSummary(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: normalizeRole(user.role),
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt
  };
}

function requireRoles(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      const role = normalizeRole(user.role);
      if (!allowedRoles.includes(role)) {
        return res.status(403).json({ message: "You do not have permission to use this action" });
      }

      req.currentUser = user;
      next();
    } catch (error) {
      res.status(500).json({ message: "Unable to verify permissions" });
    }
  };
}

function parsePositiveInteger(value, fallback, max = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseMinimumRating(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(5, Math.max(0, parsed));
}

function normalizeTextForCompare(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlapScore(left, right) {
  const leftTokens = new Set(normalizeTextForCompare(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeTextForCompare(right).split(" ").filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
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

function buildResourceFilter(query = {}, options = {}) {
  const { includeTextSearch = true } = options;
  const filter = {};
  const rawSearch = Array.isArray(query.search) ? query.search[0] : query.search;
  const search = String(rawSearch || "").trim();
  const subject = String(query.subject || "").trim();
  const fileType = String(query.fileType || query.type || "").trim();
  const source = String(query.source || "").trim().toLowerCase();
  const minRating = parseMinimumRating(query.minRating);
  const dateFrom = query.dateFrom ? new Date(query.dateFrom) : null;
  const dateTo = query.dateTo ? new Date(query.dateTo) : null;

  if (includeTextSearch && search) {
    const escapedSearch = escapeRegex(search);
    filter.$or = [
      { title: { $regex: escapedSearch, $options: "i" } },
      { subject: { $regex: escapedSearch, $options: "i" } },
      { originalName: { $regex: escapedSearch, $options: "i" } },
      { fileCategory: { $regex: escapedSearch, $options: "i" } },
      { classification: { $regex: escapedSearch, $options: "i" } },
      { keywords: { $regex: escapedSearch, $options: "i" } },
      { summary: { $regex: escapedSearch, $options: "i" } }
    ];
  }

  if (subject) {
    filter.subject = { $regex: `^${escapeRegex(subject)}$`, $options: "i" };
  }

  if (fileType) {
    filter.fileCategory = { $regex: `^${escapeRegex(fileType)}$`, $options: "i" };
  }

  if (source && source !== "all" && source !== "local") {
    filter.fileCategory = { $regex: `^${escapeRegex(source.replace(/^local-/, ""))}$`, $options: "i" };
  }

  if (minRating !== null) {
    filter.rating = { $gte: minRating };
  }

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom && !Number.isNaN(dateFrom.getTime())) filter.createdAt.$gte = dateFrom;
    if (dateTo && !Number.isNaN(dateTo.getTime())) {
      dateTo.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = dateTo;
    }
  }

  return { filter, search };
}

function sortResources(resources, sort = "newest") {
  const sorted = [...resources];

  if (sort === "rating") {
    sorted.sort((left, right) => Number(right.rating || 0) - Number(left.rating || 0));
  } else if (sort === "views") {
    sorted.sort((left, right) => Number(right.views || 0) - Number(left.views || 0));
  } else if (sort === "title") {
    sorted.sort((left, right) => String(left.title || "").localeCompare(String(right.title || "")));
  } else {
    sorted.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  }

  return sorted;
}

function normalizeBookmark(bookmark = {}) {
  const id = String(bookmark.id || bookmark.link || bookmark.title || "").trim();
  const title = String(bookmark.title || "Untitled resource").trim();
  const createdAt = new Date(bookmark.createdAt);

  if (!id && !title) return null;

  return {
    id: id || title,
    title,
    subject: String(bookmark.subject || "General").trim(),
    source: String(bookmark.source || "Saved resource").trim(),
    link: String(bookmark.link || "#").trim(),
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt
  };
}

function normalizeBookmarks(bookmarks = []) {
  const unique = new Map();

  bookmarks.forEach((bookmark) => {
    const normalized = normalizeBookmark(bookmark);
    if (!normalized) return;
    unique.set(normalized.id, normalized);
  });

  return [...unique.values()].slice(0, 100);
}

function normalizeSearchHistory(history = []) {
  const unique = [];
  const seen = new Set();

  history.forEach((entry) => {
    const query = String(typeof entry === "string" ? entry : entry?.query || "")
      .trim()
      .slice(0, 120);
    const key = query.toLowerCase();

    if (!query || seen.has(key)) return;
    seen.add(key);
    unique.push({ query, searchedAt: new Date() });
  });

  return unique.slice(0, 20);
}

function createPasswordResetToken() {
  return crypto.randomBytes(24).toString("hex");
}

function hashPasswordResetToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

async function resolveResourceSubject({ title, subject, file, category }) {
  const suppliedSubject = String(subject || "").trim();
  const classificationInput = [
    title,
    titleFromOriginalName(file.originalname),
    category.label,
    file.mimetype
  ]
    .filter(Boolean)
    .join(" ");

  const classification = await classifyText(classificationInput);
  const classificationConfidence = Number(classification.confidence || 0);
  const autoSubject =
    classification.classification && classificationConfidence >= 0.6
      ? classification.classification
      : null;

  return {
    subject:
      suppliedSubject ||
      autoSubject ||
      "General",
    classification: {
      ...classification,
      classification: autoSubject,
      confidence: autoSubject ? classificationConfidence : 0
    }
  };
}

// ================= REGISTER =================
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const requestedRole = normalizeRole(req.body.role);

    if (!name || !normalizedEmail || !password)
      return res.status(400).json({ message: "All fields required" });

    if (String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser)
      return res.status(400).json({ message: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const role = await roleForRegistration(normalizedEmail, requestedRole);

    await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role
    });

    res.json({ message: "Registration successful", role });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Registration failed" });
  }
});

// ================= LOGIN =================
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    const user = await User.findOne({ email: normalizedEmail });
    if (!user)
      return res.status(400).json({ message: "User not found" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(400).json({ message: "Wrong password" });

    user.lastLoginAt = new Date();
    user.loginHistory = [
      {
        loggedInAt: user.lastLoginAt,
        ip: req.ip,
        userAgent: req.get("user-agent") || ""
      },
      ...(user.loginHistory || [])
    ].slice(0, 20);
    await user.save();

    const token = jwt.sign(
      { id: user._id, role: normalizeRole(user.role) },
      process.env.JWT_SECRET || "SECRET_KEY",
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.json({ token, user: publicUserState(user) });
  } catch (error) {
    res.status(500).json({ message: "Login failed" });
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const genericMessage =
      "If an account exists for this email, a password reset link has been generated.";

    if (!email) {
      return res.status(400).json({ message: "Email required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ message: genericMessage });
    }

    const resetToken = createPasswordResetToken();
    user.passwordResetTokenHash = hashPasswordResetToken(resetToken);
    user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();

    const appBaseUrl =
      process.env.APP_BASE_URL ||
      `${req.protocol}://${req.get("host")}`;
    const resetUrl = `${appBaseUrl.replace(/\/+$/, "")}/reset-password.html?email=${encodeURIComponent(
      email
    )}&token=${encodeURIComponent(resetToken)}`;
    const emailResult = await sendPasswordResetEmail({
      to: email,
      name: user.name,
      resetUrl
    });

    const response = {
      message: emailResult.sent
        ? "If an account exists for this email, a password reset link has been emailed."
        : genericMessage,
      emailSent: emailResult.sent,
      expiresInMinutes: 30
    };

    if (!emailResult.sent && process.env.NODE_ENV !== "production") {
      response.devResetUrl = resetUrl;
    }

    res.json(response);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Password reset request failed" });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const token = String(req.body.token || "").trim();
    const password = String(req.body.password || "");

    if (!email || !token || !password) {
      return res.status(400).json({ message: "Email, token, and new password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const user = await User.findOne({
      email,
      passwordResetTokenHash: hashPasswordResetToken(token),
      passwordResetExpiresAt: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: "Reset link is invalid or expired" });
    }

    user.password = await bcrypt.hash(password, 10);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Password reset failed" });
  }
});

app.get("/api/user/state", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(publicUserState(user));
  } catch (error) {
    res.status(500).json({ message: "Unable to load user data" });
  }
});

app.get("/api/user/profile", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(publicUserState(user));
  } catch (error) {
    res.status(500).json({ message: "Unable to load profile" });
  }
});

app.put("/api/user/profile", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Name required" });

    user.name = name;
    await user.save();

    res.json(publicUserState(user));
  } catch (error) {
    res.status(500).json({ message: "Unable to update profile" });
  }
});

app.put("/api/user/state", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.bookmarks = normalizeBookmarks(req.body.bookmarks);
    user.searchHistory = normalizeSearchHistory(req.body.searchHistory);
    await user.save();

    res.json(publicUserState(user));
  } catch (error) {
    res.status(500).json({ message: "Unable to save user data" });
  }
});

app.post("/api/user/search-history", verifyToken, async (req, res) => {
  try {
    const query = String(req.body.query || "").trim().slice(0, 120);
    if (!query) return res.status(400).json({ message: "Search query required" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.searchHistory = normalizeSearchHistory([
      query,
      ...(user.searchHistory || []).map((entry) => entry.query)
    ]);
    await user.save();

    res.json({ searchHistory: publicUserState(user).searchHistory });
  } catch (error) {
    res.status(500).json({ message: "Unable to save search history" });
  }
});

app.put("/api/user/bookmarks", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.bookmarks = normalizeBookmarks(req.body.bookmarks);
    await user.save();

    res.json({ bookmarks: publicUserState(user).bookmarks });
  } catch (error) {
    res.status(500).json({ message: "Unable to save bookmarks" });
  }
});

// ================= SEARCH & GET =================
app.get("/api/resources", async (req, res) => {
  try {
    const wantsPaged =
      req.query.format === "page" || req.query.page || req.query.limit;
    const page = parsePositiveInteger(req.query.page, 1, 100000);
    const limit = parsePositiveInteger(req.query.limit, wantsPaged ? 12 : 100, 100);
    const sort = String(req.query.sort || "newest");
    const semantic = String(req.query.semantic || "").toLowerCase() === "true";
    const { filter, search } = buildResourceFilter(req.query, {
      includeTextSearch: !semantic
    });

    let resources;
    let total;

    if (semantic && search) {
      const candidates = await Resource.find(filter);
      const documents = candidates.map((resource) =>
        [
          resource.title,
          resource.subject,
          resource.summary,
          resource.extractedText,
          Array.isArray(resource.keywords) ? resource.keywords.join(" ") : ""
        ]
          .filter(Boolean)
          .join(" ")
      );
      const ranked = await semanticSearch.searchSimilar(search, documents);
      const ordered = ranked
        .filter((item) => item.similarity > 0)
        .map((item) => ({
          ...candidates[item.index].toObject(),
          relevanceScore: Number((item.similarity * 100).toFixed(2))
        }));

      const fallback = ordered.length ? ordered : sortResources(candidates, sort);
      total = fallback.length;
      resources = fallback.slice((page - 1) * limit, page * limit);
    } else if (wantsPaged) {
      total = await Resource.countDocuments(filter);
      resources = await Resource.find(filter)
        .sort(
          sort === "rating"
            ? { rating: -1, createdAt: -1 }
            : sort === "views"
              ? { views: -1, createdAt: -1 }
              : sort === "title"
                ? { title: 1 }
                : { createdAt: -1 }
        )
        .skip((page - 1) * limit)
        .limit(limit);
    } else {
      resources = await Resource.find(filter).sort({ createdAt: -1 });
      total = resources.length;
    }

    if (!wantsPaged) {
      res.json(resources);
      return;
    }

    res.json({
      resources,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching resources" });
  }
});

app.get("/api/resources/filters", async (req, res) => {
  try {
    const [subjects, fileTypes] = await Promise.all([
      Resource.distinct("subject"),
      Resource.distinct("fileCategory")
    ]);

    res.json({
      subjects: subjects.filter(Boolean).sort((a, b) => a.localeCompare(b)),
      fileTypes: fileTypes.filter(Boolean).sort((a, b) => a.localeCompare(b))
    });
  } catch (error) {
    res.status(500).json({ message: "Unable to load filters" });
  }
});

app.post("/api/resources/check-duplicate", verifyToken, async (req, res) => {
  try {
    const fileHash = String(req.body.fileHash || "").trim();
    const title = String(req.body.title || "").trim();
    const subject = String(req.body.subject || "").trim();
    const originalName = String(req.body.originalName || "").trim();
    const matches = [];

    if (fileHash) {
      const exactMatches = await Resource.find({ fileHash }).limit(5);
      exactMatches.forEach((resource) => {
        matches.push({
          resource,
          similarity: 1,
          reason: "Same file content"
        });
      });
    }

    const text = [title, subject, originalName].filter(Boolean).join(" ");
    if (text) {
      const resources = await Resource.find().sort({ createdAt: -1 }).limit(200);
      resources.forEach((resource) => {
        const score = tokenOverlapScore(
          text,
          [resource.title, resource.subject, resource.originalName, resource.summary]
            .filter(Boolean)
            .join(" ")
        );

        if (score >= 0.72 && !matches.some((match) => String(match.resource._id) === String(resource._id))) {
          matches.push({
            resource,
            similarity: Number(score.toFixed(2)),
            reason: "Similar title, subject, or file name"
          });
        }
      });
    }

    res.json({
      duplicate: matches.length > 0,
      matches: matches.slice(0, 5)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Duplicate check failed" });
  }
});

// ================= UPLOAD =================
app.post(
  "/api/resources",
  verifyToken,
  requireRoles("student", "teacher", "admin"),
  handleResourceUpload,
  async (req, res) => {
    try {
      const { title, subject } = req.body;
      const uploadedFile = getUploadedResourceFile(req);

      if (!uploadedFile)
        return res.status(400).json({ message: "File required" });

      const category = uploadedFile.resourceCategory || categorizeFile(uploadedFile);
      const resourceTitle =
        String(title || "").trim() || titleFromOriginalName(uploadedFile.originalname);
      const storedPath = toStoredUploadPath(uploadedFile);
      const absoluteFilePath = uploadedFile.path || path.join(uploadedFile.destination, uploadedFile.filename);
      const fileHash = await hashFile(absoluteFilePath);
      const pdfMetadata = await extractPdfMetadata(absoluteFilePath, uploadedFile.mimetype);
      const subjectResult = await resolveResourceSubject({
        title: resourceTitle,
        subject,
        file: uploadedFile,
        category
      });
      const summaryResult = pdfMetadata.text
        ? await summarizeText(pdfMetadata.text, { maxLength: 220 })
        : { summary: null };
      const keywordResult = extractKeywords(
        `${resourceTitle} ${subjectResult.subject} ${uploadedFile.originalname} ${pdfMetadata.text.slice(0, 3000)}`,
        8
      );

      const resource = await Resource.create({
        title: resourceTitle,
        subject: subjectResult.subject,
        pdf: storedPath,
        file: storedPath,
        filePath: storedPath,
        originalName: uploadedFile.originalname,
        mimeType: uploadedFile.mimetype,
        fileSize: uploadedFile.size,
        fileHash,
        fileCategory: category.label,
        storageFolder: category.folder,
        pageCount: pdfMetadata.pageCount,
        extractedText: pdfMetadata.text,
        summary: summaryResult.summary || null,
        classification: subjectResult.classification?.classification || null,
        classificationConfidence: subjectResult.classification?.confidence || 0,
        keywords: keywordResult.keywords || [],
        uploadedBy: req.user.id
      });

      res.json({
        message: `Uploaded successfully as ${category.label}`,
        resource
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Upload failed" });
    }
  }
);

// ================= RESOURCE SUB-ROUTES (specific paths before generic :id) =================

app.post("/api/resources/:id/view", async (req, res) => {
  try {
    const resource = await Resource.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    );

    if (!resource) return res.status(404).json({ message: "Resource not found" });
    res.json({ views: resource.views });
  } catch (error) {
    res.status(500).json({ message: "Unable to record view" });
  }
});

app.get("/api/resources/:id/file", async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ message: "Resource not found" });

    const storedPath = resource.filePath || resource.file || resource.pdf;
    if (!storedPath) return res.status(404).json({ message: "File not found" });

    // Normalize the stored path (remove "uploads/" prefix if present)
    const normalizedPath = String(storedPath)
      .replace(/^\/?uploads[\\/]+/i, "")
      .replace(/\\/g, "/");

    let filePath;
    try {
      filePath = resolveUploadPath(normalizedPath);
    } catch (error) {
      // If path resolution fails, try direct path construction
      filePath = path.join(UPLOAD_ROOT, normalizedPath);
    }

    if (!fs.existsSync(filePath)) {
      // Try alternative path if first attempt fails
      const altPath = path.join(UPLOAD_ROOT, path.basename(normalizedPath));
      if (!fs.existsSync(altPath)) {
        return res.status(404).json({ message: "File not found" });
      }
      filePath = altPath;
    }

    const fileName = String(resource.originalName || resource.title || path.basename(filePath)).replace(/"/g, "");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    if (resource.mimeType) res.type(resource.mimeType);
    res.sendFile(filePath);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({ message: "Resource not found" });
    }
    res.status(500).json({ message: "Unable to open file" });
  }
});

app.get("/api/resources/:id/download", async (req, res) => {
  try {
    const resource = await Resource.findByIdAndUpdate(
      req.params.id,
      { $inc: { downloadCount: 1 } },
      { new: true }
    );

    if (!resource) return res.status(404).json({ message: "Resource not found" });

    const storedPath = resource.filePath || resource.file || resource.pdf;
    if (!storedPath) return res.status(404).json({ message: "File not found" });

    // Normalize the stored path (remove "uploads/" prefix if present)
    const normalizedPath = String(storedPath)
      .replace(/^\/?uploads[\\/]+/i, "")
      .replace(/\\/g, "/");

    let filePath;
    try {
      filePath = resolveUploadPath(normalizedPath);
    } catch (error) {
      // If path resolution fails, try direct path construction
      filePath = path.join(UPLOAD_ROOT, normalizedPath);
    }

    if (!fs.existsSync(filePath)) {
      // Try alternative path if first attempt fails
      const altPath = path.join(UPLOAD_ROOT, path.basename(normalizedPath));
      if (!fs.existsSync(altPath)) {
        return res.status(404).json({ message: "File not found" });
      }
      filePath = altPath;
    }

    res.download(filePath, resource.originalName || resource.title || "resource");
  } catch (error) {
    res.status(500).json({ message: "Download failed" });
  }
});

app.post("/api/resources/:id/reviews", verifyToken, async (req, res) => {
  try {
    const rating = Number(req.body.rating);
    const comment = String(req.body.comment || "").trim().slice(0, 800);

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const [resource, user] = await Promise.all([
      Resource.findById(req.params.id),
      User.findById(req.user.id)
    ]);

    if (!resource) return res.status(404).json({ message: "Resource not found" });
    if (!user) return res.status(404).json({ message: "User not found" });

    resource.reviews = (resource.reviews || []).filter(
      (review) => String(review.user) !== String(user._id)
    );
    resource.reviews.unshift({
      user: user._id,
      userName: user.name,
      rating,
      comment,
      createdAt: new Date()
    });

    const ratingTotal = resource.reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
    resource.ratingCount = resource.reviews.length;
    resource.rating = resource.ratingCount
      ? Number((ratingTotal / resource.ratingCount).toFixed(2))
      : 0;
    await resource.save();

    res.json({ message: "Review saved", resource });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Review failed" });
  }
});

app.post("/api/resources/:id/ask", verifyToken, async (req, res) => {
  try {
    const question = String(req.body.question || "").trim();
    if (!question) return res.status(400).json({ message: "Question required" });

    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ message: "Resource not found" });

    const context = [
      resource.title,
      resource.subject,
      resource.summary,
      resource.extractedText
    ]
      .filter(Boolean)
      .join("\n\n");

    if (!context.trim()) {
      return res.status(400).json({
        message: "This resource does not have extracted text for question answering"
      });
    }

    const answer = await answerQuestion(question, context);
    res.json({ success: true, ...answer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Question answering failed" });
  }
});

// ================= UPDATE RESOURCE =================
app.put("/api/resources/:id", verifyToken, requireRoles("admin"), async (req, res) => {
  try {
    const { title, subject } = req.body;

    if (!title || !subject) {
      return res.status(400).json({ message: "Title and subject are required" });
    }

    const resource = await Resource.findByIdAndUpdate(
      req.params.id,
      {
        title: title.trim(),
        subject: subject.trim()
      },
      { new: true, runValidators: true }
    );

    if (!resource) {
      return res.status(404).json({ message: "Resource not found" });
    }

    res.json({ message: "Updated successfully", resource });
  } catch (error) {
    res.status(500).json({ message: "Update failed" });
  }
});

// ================= DELETE RESOURCE =================
app.delete("/api/resources/:id", verifyToken, requireRoles("admin"), async (req, res) => {
  try {
    const resource = await Resource.findByIdAndDelete(req.params.id);

    if (!resource) {
      return res.status(404).json({ message: "Resource not found" });
    }

    const storedPath = resource.filePath || resource.file || resource.pdf;
    if (storedPath) {
      let filePath;
      try {
        filePath = resolveUploadPath(storedPath);
      } catch (error) {
        console.error("Invalid upload cleanup path:", error.message);
        filePath = null;
      }

      if (filePath) {
        fs.unlink(filePath, (error) => {
          if (error && error.code !== "ENOENT") {
            console.error("File cleanup failed:", error.message);
          }
        });
      }
    }

    res.json({ message: "Deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Delete failed" });
  }
});

// ================= GET RESOURCE BY ID (generic catch-all - MUST BE LAST) =================
app.get("/api/resources/:id", async (req, res) => {
  try {
    const shouldTrackView = String(req.query.view || "").toLowerCase() === "true";
    const resource = shouldTrackView
      ? await Resource.findByIdAndUpdate(
          req.params.id,
          { $inc: { views: 1 } },
          { new: true }
        )
      : await Resource.findById(req.params.id);

    if (!resource) return res.status(404).json({ message: "Resource not found" });

    res.json(resource);
  } catch (error) {
    res.status(500).json({ message: "Unable to load resource" });
  }
});

// ================= ADMIN STATS =================
app.get("/api/admin/stats", verifyToken, requireRoles("admin"), async (req, res) => {
  try {
    const [resources, users, userDocs] = await Promise.all([
      Resource.find().sort({ createdAt: -1 }),
      User.countDocuments(),
      User.find().sort({ lastLoginAt: -1 })
    ]);

    const subjectCounts = resources.reduce((counts, resource) => {
      const subject = resource.subject || "Uncategorized";
      counts[subject] = (counts[subject] || 0) + 1;
      return counts;
    }, {});
    const fileTypeCounts = resources.reduce((counts, resource) => {
      const type = resource.fileCategory || "Other";
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {});
    const topSearches = {};
    userDocs.forEach((user) => {
      (user.searchHistory || []).forEach((entry) => {
        const query = String(entry.query || "").trim();
        if (query) topSearches[query] = (topSearches[query] || 0) + 1;
      });
    });
    const roleCounts = userDocs.reduce((counts, user) => {
      const role = normalizeRole(user.role);
      counts[role] = (counts[role] || 0) + 1;
      return counts;
    }, {});

    const topSubjects = Object.entries(subjectCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([subject, count]) => ({ subject, count }));

    res.json({
      totalResources: resources.length,
      totalUsers: users,
      flaggedResources: resources.filter((resource) => resource.isFlagged).length,
      recentResources: resources.slice(0, 5),
      topSubjects,
      topFileTypes: Object.entries(fileTypeCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6)
        .map(([type, count]) => ({ type, count })),
      topSearches: Object.entries(topSearches)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6)
        .map(([query, count]) => ({ query, count })),
      mostViewed: [...resources]
        .sort((left, right) => Number(right.views || 0) - Number(left.views || 0))
        .slice(0, 5),
      topRated: [...resources]
        .filter((resource) => Number(resource.ratingCount || 0) > 0)
        .sort((left, right) => Number(right.rating || 0) - Number(left.rating || 0))
        .slice(0, 5),
      roleCounts,
      activeUsers: userDocs.slice(0, 10).map(publicUserSummary)
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching admin stats" });
  }
});

app.get("/api/admin/users", verifyToken, requireRoles("admin"), async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).limit(200);
    res.json(users.map(publicUserSummary));
  } catch (error) {
    res.status(500).json({ message: "Unable to load users" });
  }
});

app.put("/api/admin/users/:id/role", verifyToken, requireRoles("admin"), async (req, res) => {
  try {
    const role = String(req.body.role || "").trim();
    if (!["student", "teacher", "admin"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(publicUserSummary(user));
  } catch (error) {
    res.status(500).json({ message: "Unable to update role" });
  }
});

// ================= AI ROUTES =================
app.use(aiRoutes);

// ================= START SERVER =================
function printStartupLinks(port) {
  const baseUrl = `http://localhost:${port}`;

  console.log("");
  console.log("🚀 Student Resource Finder is running");
  console.log("");
  console.log("📍 Complete User Journey:");
  console.log(`   🏠 Landing → 🔐 Login/Register → 📊 Dashboard → 🔍 Features → 👤 Profile → 🚪 Logout`);
  console.log("");
  console.log(`🌐 Open Website: ${baseUrl}`);
  console.log("");
  console.log("Quick Links:");
  console.log(`  🏠 Landing:  ${baseUrl}`);
  console.log(`  🔐 Login:    ${baseUrl}/login.html`);
  console.log(`  📝 Register: ${baseUrl}/register.html`);
  console.log(`  📊 Dashboard: ${baseUrl}/dashboard.html`);
  console.log(`  👤 Profile:  ${baseUrl}/profile.html`);
  console.log(`  🔍 Search:   ${baseUrl}/search.html`);
  console.log(`  📚 Library:  ${baseUrl}/library.html`);
  console.log(`  📤 Upload:   ${baseUrl}/upload.html`);
  console.log(`  👨‍💼 Admin:    ${baseUrl}/admin.html`);
  console.log(`  🤖 AI Demo:  ${baseUrl}/ai-demo.html`);
  console.log(`  🔌 API:      ${baseUrl}/api/resources`);
  console.log("");
}

function listenOnAvailablePort(port, retriesLeft = 10) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port);

    server.once("listening", () => {
      resolve({ server, port });
    });

    server.once("error", (error) => {
      if (error.code === "EADDRINUSE" && retriesLeft > 0) {
        const nextPort = port + 1;

        console.warn(`Port ${port} is already in use. Trying ${nextPort}...`);
        listenOnAvailablePort(nextPort, retriesLeft - 1).then(resolve, reject);
        return;
      }

      reject(error);
    });
  });
}

async function startServer() {
  try {
    await connectDB();

    const { port } = await listenOnAvailablePort(PORT);
    printStartupLinks(port);
  } catch (error) {
    console.error("Server failed to start:", error.message);
    process.exit(1);
  }
}

startServer();
