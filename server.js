require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const connectDB = require("./config/db");
const User = require("./models/User");
const Resource = require("./models/Resource");
const verifyToken = require("./middleware/authMiddleware");
const aiRoutes = require("./routes/aiRoutes");
const { classifyText, extractKeywords } = require("./utils/aiModels");
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

// MIDDLEWARE
app.use(cors());
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
    console.log("Register Body:", req.body);

    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: "All fields required" });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      name,
      email,
      password: hashedPassword
    });

    res.json({ message: "Registration successful" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Registration failed" });
  }
});

// ================= LOGIN =================
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "User not found" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(400).json({ message: "Wrong password" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "SECRET_KEY");

    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: "Login failed" });
  }
});

// ================= SEARCH & GET =================
app.get("/api/resources", async (req, res) => {
  try {
    const rawSearch = Array.isArray(req.query.search)
      ? req.query.search[0]
      : req.query.search;
    const search = String(rawSearch || "").trim();
    let filter = {};

    if (search) {
      const escapedSearch = escapeRegex(search);
      filter = {
        $or: [
          { title: { $regex: escapedSearch, $options: "i" } },
          { subject: { $regex: escapedSearch, $options: "i" } },
          { originalName: { $regex: escapedSearch, $options: "i" } },
          { fileCategory: { $regex: escapedSearch, $options: "i" } },
          { classification: { $regex: escapedSearch, $options: "i" } }
        ]
      };
    }

    const resources = await Resource.find(filter).sort({ createdAt: -1 });
    res.json(resources);
  } catch (error) {
    res.status(500).json({ message: "Error fetching resources" });
  }
});

// ================= UPLOAD =================
app.post(
  "/api/resources",
  verifyToken,
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
      const subjectResult = await resolveResourceSubject({
        title: resourceTitle,
        subject,
        file: uploadedFile,
        category
      });
      const keywordResult = extractKeywords(
        `${resourceTitle} ${subjectResult.subject} ${uploadedFile.originalname}`,
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
        fileCategory: category.label,
        storageFolder: category.folder,
        classification: subjectResult.classification?.classification || null,
        classificationConfidence: subjectResult.classification?.confidence || 0,
        keywords: keywordResult.keywords || []
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

// ================= UPDATE RESOURCE =================
app.put("/api/resources/:id", verifyToken, async (req, res) => {
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
app.delete("/api/resources/:id", verifyToken, async (req, res) => {
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

// ================= ADMIN STATS =================
app.get("/api/admin/stats", verifyToken, async (req, res) => {
  try {
    const [resources, users] = await Promise.all([
      Resource.find().sort({ createdAt: -1 }),
      User.countDocuments()
    ]);

    const subjectCounts = resources.reduce((counts, resource) => {
      const subject = resource.subject || "Uncategorized";
      counts[subject] = (counts[subject] || 0) + 1;
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
      topSubjects
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching admin stats" });
  }
});

// ================= AI ROUTES =================
app.use(aiRoutes);

// ================= START SERVER =================
function printStartupLinks(port) {
  const baseUrl = `http://localhost:${port}`;

  console.log("");
  console.log("Student Resource Finder is running");
  console.log(`Home:      ${baseUrl}`);
  console.log(`Dashboard: ${baseUrl}/dashboard.html`);
  console.log(`Admin:     ${baseUrl}/admin.html`);
  console.log(`Login:     ${baseUrl}/login.html`);
  console.log(`AI Demo:   ${baseUrl}/ai-demo.html`);
  console.log(`API:       ${baseUrl}/api/resources`);
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
