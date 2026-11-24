# 🎓 Student Resource Finder

A production-ready, full-stack academic resource hub where students and educators can upload, discover, search, and manage study materials, lecture notes, syllabus guides, and past exams.

---

## ✨ Features & Capabilities

### 🔐 1. Complete Authentication System
- **Registration & Login**: Secure credential handling with `bcryptjs` (salt rounds: 10) and JWT token generation.
- **Password Strength Validation**: Enforces strong passwords (minimum 8 characters, requiring uppercase letters, lowercase letters, numbers, and special characters).
- **Email Verification**: Dual verification workflow supporting both direct one-click email verification links and 6-digit verification OTP codes.
- **Password Recovery**: Self-serve password reset with secure time-limited cryptographic tokens, OTP fallback, and reset password screen.
- **Session Persistence**: "Remember Me" toggle allowing users to persist sessions across browser sessions (7 days) or scope sessions to active sessions (24 hours).
- **Security & Route Protection**: Client-side auth guards and backend `verifyToken` middleware protecting personal resources and dashboard features.
- **Password Visibility Toggles**: Interactive show/hide password buttons across all authentication and profile forms.

### 👤 2. User Profile & Account Management
- **Profile Customization**: Users can edit their display name, academic institution, field of study, and bio.
- **Email Management**: Changing an account email address automatically triggers re-verification to prevent unauthorized address takeover.
- **Change Password**: In-app password updates with real-time verification of current credentials.
- **Uploaded Documents**: Personal library dashboard displaying all documents uploaded by the user with one-click view and delete controls.
- **Permanent Account Deletion**: Self-service account deletion with mandatory password confirmation to safeguard user data.

### 📚 3. Academic Resource Engine
- **Multi-Category File Upload**: Upload PDF notes, lecture slides, syllabus documents, assignments, and exam prep materials with automatic MIME-type validation.
- **Search & Filter**: Real-time filtering by subject, academic branch, file type, rating, and semester.
- **Interactive Document Viewer**: In-browser PDF and document viewer with zoom controls, page navigation, and download options.
- **Community Bookmarks & Ratings**: 5-star rating system with verified review counts and personal bookmarks collection.

### 🛡️ 4. Security & Architecture
- **Automatic Database Resilience**: Connects to primary MongoDB Atlas in cloud deployments, with automatic self-healing fallback to local MongoDB in local environments.
- **HTTP Security Headers**: Implements `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and `X-XSS-Protection`.
- **Sliding-Window Rate Limiting**: In-memory rate limiting across authentication (`/api/auth/login`, `/api/auth/register`) and password reset endpoints to protect against brute-force attacks.
- **Custom 404 & Centralized Error Handling**: Branded, user-friendly 404 error page and standardized JSON error responses across all API routes.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB & Mongoose ORM
- **Authentication**: JSON Web Tokens (JWT), bcryptjs
- **File Handling**: Multer, PDF parser
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Testing**: Automated integration test suite (`tests/test-suite.js`)

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- [MongoDB](https://www.mongodb.com/) (Local instance or MongoDB Atlas cluster)

### 2. Installation
```bash
# Clone the repository
git clone <repository-url>
cd "Resource Finder Project"

# Install dependencies
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory (refer to `.env.example`):
```env
# MongoDB connection (Atlas or local)
MONGODB_URI=mongodb://localhost:27017/studentDB

# Security
JWT_SECRET=your_secure_random_jwt_secret_key_here
PORT=5000
NODE_ENV=development

# Optional: SMTP Configuration for real email delivery
# When omitted, verification links and OTPs are safely output in local API responses
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM="Student Resource Finder" <noreply@studentresourcefinder.com>

# Public app URL
APP_BASE_URL=http://localhost:5000
```

### 4. Running the Application
```bash
# Start backend server
npm start

# Or run with auto-reload (development)
npm run dev
```
Open `http://localhost:5000` in your web browser.

---

## 🧪 Automated Testing

The project includes an end-to-end integration test suite covering database resilience, user registration, weak password rejections, duplicate conflict prevention, email verification, login flows, profile updates, password changes, account deletion, security headers, and 404 handling:

```bash
npm test
```

Expected output:
```
==========================================
🧪 STARTING COMPREHENSIVE TEST SUITE
==========================================
1. Testing Database Connection & Resilience...
  ✓ PASS: Database connection established with resilience
2. Testing Health Endpoint...
  ✓ PASS: GET /api/health returns ok: true
3. Testing User Registration...
  ✓ PASS: Rejects weak password (< 8 chars, lacking criteria)
  ✓ PASS: Accepts strong credentials & creates account
  ✓ PASS: Rejects duplicate account registration (409 Conflict)
4. Testing Email Verification...
  ✓ PASS: Verifies email via 6-digit OTP code
5. Testing User Login...
  ✓ PASS: Rejects wrong password with 401 Unauthorized
  ✓ PASS: Logs in successfully and returns JWT token
6. Testing Profile Management...
  ✓ PASS: Loads current user profile
  ✓ PASS: Updates profile details (name, institution, field, bio)
7. Testing Password Change...
  ✓ PASS: Changes password successfully when current password is valid
  ✓ PASS: Can log in with newly updated password
8. Testing Forgot & Reset Password Flow...
  ✓ PASS: Accepts forgot password request and issues token/OTP
9. Testing Account Deletion Flow...
  ✓ PASS: Prevents account deletion with incorrect password confirmation
  ✓ PASS: Deletes account with correct password confirmation
  ✓ PASS: Deleted account cannot log in
10. Testing 404 & Security...
  ✓ PASS: Returns clean 404 JSON for unknown API routes
  ✓ PASS: Enforces security headers (X-Content-Type-Options, X-Frame-Options)
==========================================
🏁 TEST RESULTS: 18 PASSED, 0 FAILED
==========================================
```

---

## 🌐 Production Deployment

### Backend (Render / Railway / VPS)
1. Set `NODE_ENV=production`.
2. Configure `MONGODB_URI` with your production MongoDB Atlas connection string.
3. Set a strong `JWT_SECRET`.
4. Configure SMTP settings (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`) for email delivery.
5. Set `CORS_ORIGIN` to your frontend production domain (e.g. `https://your-domain.vercel.app`).
6. Start command: `node server.js` or `npm start`.

### Frontend Static Build (Vercel / Netlify / Cloudflare Pages)
```bash
npm run build
```
The production bundle will be generated in `dist/` with relative API routing configured.
Set `FRONTEND_API_ORIGIN` in your deployment environment if hosting frontend and backend on separate origins.

---

## 📁 Project Structure

```
├── config/
│   └── db.js                 # Resilient database connection with auto-fallback
├── middleware/
│   ├── authMiddleware.js     # JWT token verification and role guards
│   └── rateLimiter.js        # Sliding-window rate limiter for sensitive routes
├── models/
│   ├── Resource.js           # Academic resource schema & indexes
│   └── User.js               # User account schema with auth & verification fields
├── public/                   # Frontend assets & views
│   ├── 404.html              # Custom branded 404 error page
│   ├── admin-login.html      # Admin portal authentication
│   ├── admin.html            # Admin management dashboard
│   ├── dashboard.html        # Student dashboard
│   ├── forgot-password.html  # Password recovery portal
│   ├── index.html            # Homepage / landing page
│   ├── library.html          # Resource browsing & filter library
│   ├── login.html            # User login page with "Remember Me"
│   ├── profile.html          # Profile settings, password change, account deletion
│   ├── register.html         # User registration with password strength meter
│   ├── reset-password.html   # Password reset screen
│   ├── results.html          # Search results view
│   ├── script.js             # Client-side routing, auth helpers, profile logic
│   ├── style.css             # Unified responsive design system
│   ├── upload.html           # Document upload portal
│   └── viewer.html           # In-browser document viewer
├── routes/
│   └── aiRoutes.js           # AI assistance & smart search routes
├── scripts/
│   └── build-vercel.js       # Production static build compiler
├── tests/
│   └── test-suite.js         # Automated end-to-end integration test suite
├── utils/
│   ├── aiModels.js           # Semantic analysis utilities
│   ├── email.js              # Verification & reset email templates (Nodemailer)
│   ├── fileCategorizer.js    # File storage & categorization
│   └── pdfText.js            # PDF metadata extraction
├── .env.example              # Environment variables template
├── package.json              # Dependencies and scripts
└── server.js                 # Express server & API endpoints
```

---

## 📄 License
This project is licensed under the ISC License.
