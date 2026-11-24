let nodemailer = null;

try {
  nodemailer = require("nodemailer");
} catch (error) {
  nodemailer = null;
}

function isEmailConfigured() {
  return Boolean(
    nodemailer &&
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
}

function buildTransport() {
  if (!isEmailConfigured()) return null;

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

async function sendPasswordResetEmail({ to, name, resetUrl, otp }) {
  const transport = buildTransport();
  if (!transport) return { sent: false, reason: "email-not-configured" };

  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject: "Reset your Student Resource Finder password",
      text: [
        `Hello ${name || "there"},`,
        "",
        "You requested to reset your password. Use the link below (valid for 30 minutes):",
        resetUrl,
        otp ? `\nOr use this 6-digit verification code: ${otp}` : "",
        "",
        "If you did not make this request, you can safely ignore this email.",
        "",
        "— Student Resource Finder Team"
      ].join("\n"),
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-top: 0;">Password Reset Request</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.5;">Hello ${name || "there"},</p>
          <p style="color: #475569; font-size: 15px; line-height: 1.5;">We received a request to reset your Student Resource Finder password. Click the button below to choose a new password. This link is valid for 30 minutes.</p>
          <div style="margin: 24px 0;">
            <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; display: inline-block;">Reset Password</a>
          </div>
          ${otp ? `<p style="color: #475569; font-size: 14px;">Or enter code: <strong>${otp}</strong></p>` : ""}
          <p style="color: #94a3b8; font-size: 13px; line-height: 1.4; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">If you didn't request a password reset, you can safely ignore this email.</p>
        </div>
      `
    });
    return { sent: true };
  } catch (error) {
    console.error("Failed to send password reset email:", error.message);
    return { sent: false, reason: error.message };
  }
}

async function sendEmailVerificationEmail({ to, name, verificationUrl, otp }) {
  const transport = buildTransport();
  if (!transport) return { sent: false, reason: "email-not-configured" };

  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject: "Verify your email address - Student Resource Finder",
      text: [
        `Hello ${name || "there"},`,
        "",
        "Welcome to Student Resource Finder! Please verify your email address using this link (valid for 24 hours):",
        verificationUrl,
        otp ? `\nOr enter this verification code: ${otp}` : "",
        "",
        "If you did not create an account, you can ignore this email.",
        "",
        "— Student Resource Finder Team"
      ].join("\n"),
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-top: 0;">Verify Your Email</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.5;">Hello ${name || "there"},</p>
          <p style="color: #475569; font-size: 15px; line-height: 1.5;">Thank you for registering on Student Resource Finder. Please click the button below to verify your email address:</p>
          <div style="margin: 24px 0;">
            <a href="${verificationUrl}" style="background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; display: inline-block;">Verify Email Address</a>
          </div>
          ${otp ? `<p style="color: #475569; font-size: 14px;">Or enter verification code: <strong>${otp}</strong></p>` : ""}
          <p style="color: #94a3b8; font-size: 13px; line-height: 1.4; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px;">This link will expire in 24 hours. If you did not create an account, you can ignore this email.</p>
        </div>
      `
    });
    return { sent: true };
  } catch (error) {
    console.error("Failed to send verification email:", error.message);
    return { sent: false, reason: error.message };
  }
}

module.exports = {
  isEmailConfigured,
  isPasswordEmailConfigured: isEmailConfigured,
  sendPasswordResetEmail,
  sendEmailVerificationEmail
};
