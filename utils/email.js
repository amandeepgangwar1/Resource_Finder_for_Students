let nodemailer = null;

try {
  nodemailer = require("nodemailer");
} catch (error) {
  nodemailer = null;
}

function isPasswordEmailConfigured() {
  return Boolean(
    nodemailer &&
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
}

function buildTransport() {
  if (!isPasswordEmailConfigured()) return null;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const transport = buildTransport();
  if (!transport) return { sent: false, reason: "email-not-configured" };

  await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject: "Reset your Student Resource Finder password",
    text: [
      `Hello ${name || "there"},`,
      "",
      "Use this link to reset your password. It expires in 30 minutes:",
      resetUrl,
      "",
      "If you did not request this, you can ignore this email."
    ].join("\n")
  });

  return { sent: true };
}

module.exports = {
  isPasswordEmailConfigured,
  sendPasswordResetEmail
};
