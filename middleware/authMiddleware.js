const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
  const authHeader = req.header("Authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : authHeader;

  if (!token) {
    return res.status(401).json({ message: "No token, access denied" });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET || "SECRET_KEY");
    req.user = verified;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired login session" });
  }
};
