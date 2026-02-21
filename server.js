const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");

const connectDB = require("./config/db");
const User = require("./models/User");
const Resource = require("./models/Resource");
const verifyToken = require("./middleware/authMiddleware");

const app = express();

// CONNECT DATABASE
connectDB();

// MIDDLEWARE
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SERVE FRONTEND
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static("uploads"));

// ================= MULTER =================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

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

    const token = jwt.sign({ id: user._id }, "SECRET_KEY");

    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: "Login failed" });
  }
});

// ================= SEARCH & GET =================
app.get("/api/resources", async (req, res) => {
  try {
    const search = req.query.search;
    let filter = {};

    if (search && search.trim() !== "") {
      filter.subject = { $regex: search, $options: "i" };
    }

    const resources = await Resource.find(filter);
    res.json(resources);
  } catch (error) {
    res.status(500).json({ message: "Error fetching resources" });
  }
});

// ================= UPLOAD =================
app.post("/api/resources", verifyToken, upload.single("pdf"), async (req, res) => {
  try {
    const { title, subject } = req.body;

    if (!req.file)
      return res.status(400).json({ message: "PDF required" });

    await Resource.create({
      title,
      subject,
      pdf: req.file.filename
    });

    res.json({ message: "Uploaded successfully" });
  } catch (error) {
    res.status(500).json({ message: "Upload failed" });
  }
});

// ================= START SERVER =================
app.listen(5000, () =>
  console.log("Server running on http://localhost:5000")
);