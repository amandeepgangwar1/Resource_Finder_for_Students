const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/studentDB";
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
