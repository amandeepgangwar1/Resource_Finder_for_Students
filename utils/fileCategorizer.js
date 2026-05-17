const fs = require("fs");
const path = require("path");

const UPLOAD_ROOT = path.join(__dirname, "..", "uploads");

const CATEGORY_RULES = [
  {
    key: "pdf",
    label: "PDF",
    folder: "pdfs",
    extensions: [".pdf"],
    mimes: ["application/pdf"],
    mimePrefixes: []
  },
  {
    key: "document",
    label: "Document",
    folder: "documents",
    extensions: [".doc", ".docx", ".txt", ".rtf", ".odt", ".md"],
    mimes: [
      "application/msword",
      "application/rtf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.oasis.opendocument.text"
    ],
    mimePrefixes: ["text/"]
  },
  {
    key: "spreadsheet",
    label: "Spreadsheet",
    folder: "spreadsheets",
    extensions: [".csv", ".ods", ".xls", ".xlsx"],
    mimes: [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.oasis.opendocument.spreadsheet",
      "text/csv"
    ],
    mimePrefixes: []
  },
  {
    key: "presentation",
    label: "Presentation",
    folder: "presentations",
    extensions: [".odp", ".ppt", ".pptx"],
    mimes: [
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.oasis.opendocument.presentation"
    ],
    mimePrefixes: []
  },
  {
    key: "image",
    label: "Image",
    folder: "images",
    extensions: [".avif", ".bmp", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"],
    mimes: [],
    mimePrefixes: ["image/"]
  },
  {
    key: "video",
    label: "Video",
    folder: "videos",
    extensions: [".avi", ".m4v", ".mkv", ".mov", ".mp4", ".mpeg", ".webm", ".wmv"],
    mimes: [],
    mimePrefixes: ["video/"]
  },
  {
    key: "audio",
    label: "Audio",
    folder: "audio",
    extensions: [".aac", ".flac", ".m4a", ".mp3", ".ogg", ".wav", ".wma"],
    mimes: [],
    mimePrefixes: ["audio/"]
  },
  {
    key: "archive",
    label: "Archive",
    folder: "archives",
    extensions: [".7z", ".bz2", ".gz", ".rar", ".tar", ".zip"],
    mimes: [
      "application/gzip",
      "application/vnd.rar",
      "application/x-7z-compressed",
      "application/x-bzip2",
      "application/x-tar",
      "application/zip"
    ],
    mimePrefixes: []
  },
  {
    key: "code",
    label: "Code",
    folder: "code",
    extensions: [
      ".bat",
      ".c",
      ".cpp",
      ".cs",
      ".css",
      ".go",
      ".html",
      ".java",
      ".js",
      ".json",
      ".jsx",
      ".php",
      ".ps1",
      ".py",
      ".rb",
      ".rs",
      ".sh",
      ".sql",
      ".ts",
      ".tsx",
      ".xml",
      ".yaml",
      ".yml"
    ],
    mimes: [
      "application/javascript",
      "application/json",
      "application/sql",
      "application/xml",
      "text/css",
      "text/html",
      "text/javascript",
      "text/xml"
    ],
    mimePrefixes: []
  }
];

const OTHER_CATEGORY = {
  key: "other",
  label: "Other",
  folder: "other"
};

function ensureUploadRoot() {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

function sanitizeFilePart(value, fallback = "file") {
  const clean = String(value || "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return clean || fallback;
}

function categorizeFile(file = {}) {
  const originalName = file.originalname || file.filename || "";
  const extension = path.extname(originalName).toLowerCase();
  const mimeType = String(file.mimetype || "").toLowerCase();

  const category =
    CATEGORY_RULES.find((rule) => rule.extensions.includes(extension)) ||
    CATEGORY_RULES.find((rule) => rule.mimes.includes(mimeType)) ||
    CATEGORY_RULES.find((rule) =>
      rule.mimePrefixes.some((prefix) => mimeType.startsWith(prefix))
    ) ||
    OTHER_CATEGORY;

  return { ...category };
}

function uploadDestination(req, file, cb) {
  try {
    ensureUploadRoot();
    const category = categorizeFile(file);
    file.resourceCategory = category;

    const destination = path.join(UPLOAD_ROOT, category.folder);
    fs.mkdir(destination, { recursive: true }, (error) => cb(error, destination));
  } catch (error) {
    cb(error);
  }
}

function buildStoredFileName(file) {
  const extension = path.extname(file.originalname || "").toLowerCase();
  const stem = sanitizeFilePart(path.basename(file.originalname || "file", extension));
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}-${stem}${extension}`;
}

function toStoredUploadPath(file) {
  const absolutePath = file.path || path.join(file.destination, file.filename);
  return path.relative(UPLOAD_ROOT, absolutePath).split(path.sep).join("/");
}

function resolveUploadPath(relativePath) {
  const uploadRoot = path.resolve(UPLOAD_ROOT);
  const targetPath = path.resolve(UPLOAD_ROOT, String(relativePath || ""));

  if (targetPath !== uploadRoot && !targetPath.startsWith(`${uploadRoot}${path.sep}`)) {
    throw new Error("Invalid upload path");
  }

  return targetPath;
}

function titleFromOriginalName(originalName) {
  const extension = path.extname(originalName || "");
  return (
    String(path.basename(originalName || "Untitled resource", extension))
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Untitled resource"
  );
}

module.exports = {
  UPLOAD_ROOT,
  buildStoredFileName,
  categorizeFile,
  resolveUploadPath,
  titleFromOriginalName,
  toStoredUploadPath,
  uploadDestination
};
