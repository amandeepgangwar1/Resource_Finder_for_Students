const mongoose = require("mongoose");

const ResourceSchema = new mongoose.Schema({
  title: String,
  subject: String,
  pdf: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Resource", ResourceSchema);