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
const {
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
  isEmailConfigured
} = require("./utils/email");
const { createRateLimiter } = require("./middleware/rateLimiter");
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

// SECURITY HEADERS
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// RATE LIMITERS FOR SENSITIVE ENDPOINTS
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many authentication attempts. Please try again after 15 minutes."
});

const passwordResetLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many password reset requests. Please check your inbox or try again in 15 minutes."
});

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
    id: user._id,
    name: user.name,
    email: user.email,
    role: normalizeRole(user.role),
    bio: user.bio || "",
    institution: user.institution || "",
    fieldOfStudy: user.fieldOfStudy || "",
    avatarColor: user.avatarColor || "#2563eb",
    isEmailVerified: Boolean(user.isEmailVerified),
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
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

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return typeof email === "string" && re.test(email.trim());
}

function validatePassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    return {
      valid: false,
      message: "Password must be at least 8 characters long."
    };
  }
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  if (!hasUpper || !hasLower || !hasNumber) {
    return {
      valid: false,
      message: "Password must include at least one uppercase letter, one lowercase letter, and one number."
    };
  }
  return { valid: true };
}

function createPasswordResetToken() {
  return crypto.randomBytes(24).toString("hex");
}

function hashPasswordResetToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function createEmailVerificationToken() {
  return crypto.randomBytes(24).toString("hex");
}

function createSixDigitOtp() {
  return crypto.randomInt(100000, 999999).toString();
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
app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const requestedRole = normalizeRole(req.body.role);

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ message: "Name, email, and password are required." });
    }

    const trimmedName = String(name).trim();
    if (trimmedName.length < 2 || trimmedName.length > 70) {
      return res.status(400).json({ message: "Full name must be between 2 and 70 characters." });
    }

    if (!validateEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Please provide a valid email address." });
    }

    const pwdCheck = validatePassword(password);
    if (!pwdCheck.valid) {
      return res.status(400).json({ message: pwdCheck.message });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: "An account with this email address already exists. Please log in." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const role = await roleForRegistration(normalizedEmail, requestedRole);

    const verificationToken = createEmailVerificationToken();
    const verificationOtp = createSixDigitOtp();
    const verificationTokenHash = hashPasswordResetToken(verificationToken);
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const newUser = await User.create({
      name: trimmedName,
      email: normalizedEmail,
      password: hashedPassword,
      role,
      isEmailVerified: false,
      emailVerificationTokenHash: verificationTokenHash,
      emailVerificationOtp: verificationOtp,
      emailVerificationExpiresAt: verificationExpiresAt
    });

    const appBaseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const verificationUrl = `${appBaseUrl.replace(/\/+$/, "")}/login.html?verifyToken=${encodeURIComponent(
      verificationToken
    )}`;

    // Send verification email asynchronously
    sendEmailVerificationEmail({
      to: normalizedEmail,
      name: trimmedName,
      verificationUrl,
      otp: verificationOtp
    }).catch((err) => console.error("Error sending verification email:", err.message));

    const token = jwt.sign(
      { id: newUser._id, role: normalizeRole(newUser.role) },
      process.env.JWT_SECRET || "SECRET_KEY",
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    const response = {
      message: "Registration successful! A verification link has been sent to your email.",
      token,
      user: publicUserState(newUser),
      role
    };

    if (process.env.NODE_ENV !== "production") {
      response.devVerificationUrl = verificationUrl;
      response.devOtp = verificationOtp;
    }

    res.status(201).json(response);
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Registration failed. Please check your data and try again." });
  }
});

// ================= LOGIN =================
app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    user.lastLoginAt = new Date();
    user.loginHistory = [
      {
        loggedInAt: user.lastLoginAt,
        ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || req.ip,
        userAgent: req.get("user-agent") || ""
      },
      ...(user.loginHistory || [])
    ].slice(0, 20);
    await user.save();

    const isRemembered = rememberMe !== false;
    const tokenExpires = isRemembered
      ? (process.env.JWT_EXPIRES_IN || "7d")
      : "24h";

    const token = jwt.sign(
      { id: user._id, role: normalizeRole(user.role) },
      process.env.JWT_SECRET || "SECRET_KEY",
      { expiresIn: tokenExpires }
    );

    res.json({ token, user: publicUserState(user) });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Login failed. Please try again." });
  }
});

// ================= EMAIL VERIFICATION =================
app.post("/api/auth/verify-email", async (req, res) => {
  try {
    const token = String(req.body.token || "").trim();
    const email = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || "").trim();

    let user = null;

    if (token) {
      const tokenHash = hashPasswordResetToken(token);
      user = await User.findOne({
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: { $gt: new Date() }
      });
    } else if (email && otp) {
      user = await User.findOne({
        email,
        emailVerificationOtp: otp,
        emailVerificationExpiresAt: { $gt: new Date() }
      });
    } else {
      return res.status(400).json({ message: "Verification token or email and OTP code are required." });
    }

    if (!user) {
      return res.status(400).json({ message: "Verification link or code is invalid or has expired." });
    }

    user.isEmailVerified = true;
    user.emailVerificationTokenHash = null;
    user.emailVerificationOtp = null;
    user.emailVerificationExpiresAt = null;
    await user.save();

    res.json({
      message: "Email verified successfully!",
      user: publicUserState(user)
    });
  } catch (error) {
    console.error("Email verification error:", error);
    res.status(500).json({ message: "Email verification failed." });
  }
});

app.get("/api/auth/verify-email", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) {
      return res.status(400).send("Verification token required");
    }

    const tokenHash = hashPasswordResetToken(token);
    const user = await User.findOne({
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpiresAt: { $gt: new Date() }
    });

    if (!user) {
      if (req.accepts("html")) {
        return res.redirect("/login.html?verified=expired");
      }
      return res.status(400).json({ message: "Verification link is invalid or expired." });
    }

    user.isEmailVerified = true;
    user.emailVerificationTokenHash = null;
    user.emailVerificationOtp = null;
    user.emailVerificationExpiresAt = null;
    await user.save();

    if (req.accepts("html")) {
      return res.redirect("/login.html?verified=success");
    }
    res.json({ message: "Email verified successfully!" });
  } catch (error) {
    res.status(500).json({ message: "Verification failed." });
  }
});

app.post("/api/auth/resend-verification", authLimiter, async (req, res) => {
  try {
    const authHeader = req.header("Authorization") || "";
    let email = normalizeEmail(req.body.email);

    if (!email && authHeader) {
      try {
        const rawToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
        const decoded = jwt.verify(rawToken, process.env.JWT_SECRET || "SECRET_KEY");
        const foundUser = await User.findById(decoded.id);
        if (foundUser) email = foundUser.email;
      } catch (e) {
        // Fall back to body email
      }
    }

    if (!email) {
      return res.status(400).json({ message: "Email address is required." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ message: "If an account exists, a new verification link has been sent." });
    }

    if (user.isEmailVerified) {
      return res.json({ message: "Your email address is already verified." });
    }

    const verificationToken = createEmailVerificationToken();
    const verificationOtp = createSixDigitOtp();
    user.emailVerificationTokenHash = hashPasswordResetToken(verificationToken);
    user.emailVerificationOtp = verificationOtp;
    user.emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    const appBaseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
    const verificationUrl = `${appBaseUrl.replace(/\/+$/, "")}/login.html?verifyToken=${encodeURIComponent(
      verificationToken
    )}`;

    await sendEmailVerificationEmail({
      to: email,
      name: user.name,
      verificationUrl,
      otp: verificationOtp
    });

    const response = {
      message: "If an account exists, a new verification link has been sent."
    };

    if (process.env.NODE_ENV !== "production") {
      response.devVerificationUrl = verificationUrl;
      response.devOtp = verificationOtp;
    }

    res.json(response);
  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({ message: "Failed to resend verification email." });
  }
});

// ================= FORGOT & RESET PASSWORD =================
app.post("/api/auth/forgot-password", passwordResetLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const genericMessage =
      "If an account exists for this email, password recovery instructions have been sent.";

    if (!email || !validateEmail(email)) {
      return res.status(400).json({ message: "A valid email address is required." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ message: genericMessage });
    }

    const resetToken = createPasswordResetToken();
    const resetOtp = createSixDigitOtp();
    user.passwordResetTokenHash = hashPasswordResetToken(resetToken);
    user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins
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
      resetUrl,
      otp: resetOtp
    });

    const response = {
      message: emailResult.sent
        ? "If an account exists for this email, password recovery instructions have been sent."
        : genericMessage,
      emailSent: emailResult.sent,
      expiresInMinutes: 30
    };

    if (!emailResult.sent && process.env.NODE_ENV !== "production") {
      response.devResetUrl = resetUrl;
      response.devOtp = resetOtp;
    }

    res.json(response);
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Password reset request failed." });
  }
});

app.post("/api/auth/reset-password", passwordResetLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const token = String(req.body.token || "").trim();
    const otp = String(req.body.otp || "").trim();
    const password = String(req.body.password || "");

    if (!email || (!token && !otp) || !password) {
      return res.status(400).json({ message: "Email, reset token or code, and new password are required." });
    }

    const pwdCheck = validatePassword(password);
    if (!pwdCheck.valid) {
      return res.status(400).json({ message: pwdCheck.message });
    }

    let user = null;
    if (token) {
      user = await User.findOne({
        email,
        passwordResetTokenHash: hashPasswordResetToken(token),
        passwordResetExpiresAt: { $gt: new Date() }
      });
    }

    if (!user) {
      return res.status(400).json({ message: "Reset token is invalid or has expired." });
    }

    user.password = await bcrypt.hash(password, 10);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    await user.save();

    res.json({ message: "Password updated successfully. You can now log in with your new password." });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Password reset failed. Please try again." });
  }
});

// ================= USER ACCOUNT & PROFILE =================
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

    const uploadedCount = await Resource.countDocuments({ uploadedBy: user._id });

    res.json({
      ...publicUserState(user),
      uploadedCount
    });
  } catch (error) {
    res.status(500).json({ message: "Unable to load profile" });
  }
});

app.put("/api/user/profile", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { name, email, bio, institution, fieldOfStudy, avatarColor } = req.body;

    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (trimmedName.length < 2 || trimmedName.length > 70) {
        return res.status(400).json({ message: "Name must be between 2 and 70 characters." });
      }
      user.name = trimmedName;
    }

    if (bio !== undefined) {
      user.bio = String(bio).trim().slice(0, 300);
    }

    if (institution !== undefined) {
      user.institution = String(institution).trim().slice(0, 120);
    }

    if (fieldOfStudy !== undefined) {
      user.fieldOfStudy = String(fieldOfStudy).trim().slice(0, 120);
    }

    if (avatarColor !== undefined && /^#[0-9a-fA-F]{6}$/.test(avatarColor)) {
      user.avatarColor = avatarColor;
    }

    // Handle email change if requested
    if (email !== undefined) {
      const normalizedEmail = normalizeEmail(email);
      if (normalizedEmail !== user.email) {
        if (!validateEmail(normalizedEmail)) {
          return res.status(400).json({ message: "Please provide a valid email address." });
        }

        const duplicate = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
        if (duplicate) {
          return res.status(409).json({ message: "That email address is already in use by another account." });
        }

        user.email = normalizedEmail;
        user.isEmailVerified = false;

        const verificationToken = createEmailVerificationToken();
        const verificationOtp = createSixDigitOtp();
        user.emailVerificationTokenHash = hashPasswordResetToken(verificationToken);
        user.emailVerificationOtp = verificationOtp;
        user.emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const appBaseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
        const verificationUrl = `${appBaseUrl.replace(/\/+$/, "")}/login.html?verifyToken=${encodeURIComponent(
          verificationToken
        )}`;

        sendEmailVerificationEmail({
          to: normalizedEmail,
          name: user.name,
          verificationUrl,
          otp: verificationOtp
        }).catch((err) => console.error("Error sending verification email for email change:", err.message));
      }
    }

    await user.save();
    res.json(publicUserState(user));
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ message: "Unable to update profile." });
  }
});

// CHANGE PASSWORD
app.post("/api/user/change-password", verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required." });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    const pwdCheck = validatePassword(newPassword);
    if (!pwdCheck.valid) {
      return res.status(400).json({ message: pwdCheck.message });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ message: "New password cannot be the same as your current password." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: "Password changed successfully." });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ message: "Failed to change password." });
  }
});

// DELETE ACCOUNT
app.delete("/api/user/account", verifyToken, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ message: "Account password is required to confirm deletion." });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ message: "Incorrect password. Cannot delete account." });
    }

    // Disassociate user's uploaded resources so community resources aren't lost
    await Resource.updateMany({ uploadedBy: user._id }, { $set: { uploadedBy: null } });

    await User.findByIdAndDelete(user._id);

    res.json({ message: "Your account and personal data have been permanently deleted." });
  } catch (error) {
    console.error("Delete account error:", error);
    res.status(500).json({ message: "Failed to delete account." });
  }
});

// GET USER'S UPLOADED RESOURCES
app.get("/api/user/resources", verifyToken, async (req, res) => {
  try {
    const resources = await Resource.find({ uploadedBy: req.user.id }).sort({ createdAt: -1 });
    res.json(resources);
  } catch (error) {
    res.status(500).json({ message: "Unable to load your uploaded resources." });
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

// ================= 404 & ERROR HANDLING =================
// 404 for undefined API routes
app.all("/api/*", (req, res) => {
  res.status(404).json({ message: "API endpoint not found" });
});

// 404 for undefined frontend routes
app.use((req, res) => {
  if (req.accepts("html")) {
    const errorPagePath = path.join(__dirname, "public", "404.html");
    if (fs.existsSync(errorPagePath)) {
      return res.status(404).sendFile(errorPagePath);
    }
  }
  res.status(404).json({ message: "Page or resource not found" });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  const status = err.status || 500;
  const isProd = process.env.NODE_ENV === "production";
  const message =
    isProd && status === 500
      ? "An unexpected internal server error occurred. Please try again later."
      : err.message || "Internal server error";

  res.status(status).json({ message });
});

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

if (require.main === module) {
  startServer();
}

module.exports = app;
