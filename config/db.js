const mongoose = require("mongoose");
const dns = require("dns");

try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {
  // Ignore if unable to override DNS servers
}

const LOCAL_FALLBACK_URI = "mongodb://127.0.0.1:27017/studentDB";

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const primaryUri = (process.env.MONGODB_URI || "").trim();
  const isProduction = process.env.NODE_ENV === "production";

  if (!primaryUri && isProduction) {
    throw new Error("MONGODB_URI environment variable is required in production");
  }

  const targetUri = primaryUri || LOCAL_FALLBACK_URI;

  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB connection disconnected");
  });

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection runtime error:", err.message);
  });

  try {
    const conn = await mongoose.connect(targetUri, {
      serverSelectionTimeoutMS: 5000
    });
    console.log(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (primaryError) {
    console.error(`Database connection to primary URI failed: ${primaryError.message}`);

    // If primary failed and it's not production, attempt fallback to local MongoDB
    if (!isProduction && targetUri !== LOCAL_FALLBACK_URI) {
      console.log(`Attempting fallback to local MongoDB: ${LOCAL_FALLBACK_URI}`);
      try {
        const fallbackConn = await mongoose.connect(LOCAL_FALLBACK_URI, {
          serverSelectionTimeoutMS: 4000
        });
        console.log(`MongoDB Connected (Local Fallback): ${fallbackConn.connection.host}/${fallbackConn.connection.name}`);
        return fallbackConn;
      } catch (fallbackError) {
        console.error(`Local MongoDB fallback failed: ${fallbackError.message}`);
      }
    }

    if (isProduction) {
      throw primaryError;
    } else {
      console.warn("Warning: Running without active database connection. Server will stay alive while DB reconnects.");
    }
  }
};

module.exports = connectDB;
