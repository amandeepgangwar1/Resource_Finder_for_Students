# 🚀 Student Resource Finder

<p align="center">
  <b>A full-stack platform to search, upload, and manage study resources for students</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Frontend-HTML%20CSS%20JS-blue?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Backend-Node.js-green?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Database-MongoDB-brightgreen?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Auth-JWT-orange?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Status-Active-success?style=for-the-badge" />
</p>

---

## 📌 Overview

**Student Resource Finder** is a full-stack web application that allows students to:

- 📚 Find study resources  
- 📤 Upload PDF notes  
- 🔍 Search by subject  
- 🔐 Use secure authentication  

---

## ✨ Features

✔️ User Authentication (JWT)  
✔️ Secure Password Hashing (bcrypt)  
✔️ Upload PDF Resources  
✔️ Search by Subject  
✔️ MongoDB Storage  
✔️ Clean UI  

---

## 🖼️ Demo Screenshots

### 🏠 Home Page
<p align="center">
  <img src="home.png" width="100%" />
</p>

### 🔐 Login Page
![Login](https://images.unsplash.com/photo-1555949963-aa79dcee981c)

### 📝 Register Page
![Register](https://images.unsplash.com/photo-1603791440384-56cd371ee9a7)

### 📊 Dashboard
![Dashboard](https://images.unsplash.com/photo-1551288049-bebda4e38f71)

### 📂 Upload Section
![Upload](https://images.unsplash.com/photo-1526378722484-bd91ca387e72)

---

## 🧠 How It Works

1. Register account  
2. Login and receive JWT  
3. Upload PDF resources  
4. Search resources easily  

---

## 🛠️ Tech Stack

### 🎨 Frontend
- HTML
- CSS
- JavaScript

### ⚙️ Backend
- Node.js
- Express.js

### 🗄️ Database
- MongoDB
- Mongoose

### 🔐 Tools
- JWT
- bcryptjs
- Multer
- CORS

---

## 📁 Project Structure

```bash
Resource_Finder_for_Students/
│── server.js
│── db.js
│── User.js
│── Resource.js
│── authMiddleware.js
│── package.json
│
├── frontend/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── dashboard.html
│   ├── admin.html
│   ├── script.js
│   └── style.css
│
└── uploads/
