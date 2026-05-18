# Deployment Guide

Use this setup:

- MongoDB Atlas: database
- Render: Express backend and API
- Vercel: static frontend

## 1. Push The Project To GitHub

Render and Vercel both deploy most easily from GitHub.

Make sure `.env` is not committed. This project already ignores it.

## 2. Create MongoDB Atlas Database

1. Go to `https://cloud.mongodb.com`.
2. Create a free Atlas cluster.
3. Open **Database Access** and create a database user.
4. Open **Network Access** and add an IP access rule.
   - For quick deployment testing, use `0.0.0.0/0`.
   - For stronger security, restrict this later.
5. Open **Database > Connect > Drivers**.
6. Copy the Node.js connection string.
7. Replace `<password>` with your database user's password.
8. Add a database name at the end, for example:

```txt
mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/resource-finder?retryWrites=true&w=majority
```

This value becomes `MONGODB_URI` on Render.

## 3. Deploy Backend On Render

1. Go to `https://render.com`.
2. Click **New +**.
3. Choose **Web Service**.
4. Connect your GitHub repository.
5. Use these settings:

```txt
Runtime: Node
Build Command: npm ci
Start Command: npm start
Health Check Path: /api/health
```

6. Add environment variables:

```txt
NODE_ENV=production
MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_long_random_secret
HF_API_KEY=your_hugging_face_token_optional
MAX_UPLOAD_MB=25
```

7. Deploy.
8. Copy your Render URL. It will look like:

```txt
https://student-resource-finder-api.onrender.com
```

Test:

```txt
https://student-resource-finder-api.onrender.com/api/health
```

## 4. Deploy Frontend On Vercel

1. Go to `https://vercel.com`.
2. Click **Add New > Project**.
3. Import the same GitHub repository.
4. Keep framework preset as **Other** if Vercel does not detect one.
5. Add this environment variable:

```txt
FRONTEND_API_ORIGIN=https://your-render-service.onrender.com
```

Do not add `/api` at the end.

6. Deploy.

The included `vercel.json` runs:

```txt
npm run build:vercel
```

That command copies `public` to `dist` and writes `config.js` so the Vercel frontend calls your Render backend.

## 5. After Deployment

Open the Vercel URL and test:

1. Register a new account.
2. Log in.
3. Search resources.
4. Upload a small file.
5. Open Dashboard.

## Important Upload Note

This app stores uploaded files on the backend server's filesystem. On free Render instances, local files can be temporary across deploys/restarts. For a serious production app, move uploads to Cloudinary, S3, or another object storage service and keep MongoDB Atlas only for metadata.

## Official References

- Render web services: `https://render.com/docs/web-services`
- Render health checks: `https://render.com/docs/health-checks`
- Vercel project configuration: `https://vercel.com/docs/project-configuration`
- MongoDB Atlas connection strings: `https://www.mongodb.com/docs/manual/reference/connection-string/`
