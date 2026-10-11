const mongoose = require("mongoose");
const dns = require("dns");

try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {
  // Ignore if unable to override DNS servers
}

function getMongoUri() {
  const uri = process.env.MONGODB_URI || "";
  const trimmedUri = uri.trim();

  if (trimmedUri) return trimmedUri;

  if (process.env.NODE_ENV === "production") {
    throw new Error("MONGODB_URI is required in production");
  }

  return "mongodb://127.0.0.1:27017/studentDB";
}

const connectDB = async () => {
  try {
    const uri = getMongoUri();
    const connection = await mongoose.connect(uri);
    console.log(
      `MongoDB Connected: ${connection.connection.host}/${connection.connection.name}`
    );
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
