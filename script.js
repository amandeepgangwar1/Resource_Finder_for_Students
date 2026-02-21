// ================================
// 📌 CONFIG
// ================================
const API_BASE = "http://localhost:5000/api";
const token = localStorage.getItem("token");

// 🔑 PUT YOUR REAL YOUTUBE API KEY HERE
const YOUTUBE_API_KEY = "PASTE_YOUR_YOUTUBE_API_KEY";

// ================================
// 📌 LOAD ALL LOCAL RESOURCES
// ================================
function loadResources(search = "") {
  fetch(`${API_BASE}/resources?search=${search}`)
    .then(res => res.json())
    .then(data => {
      const results = document.getElementById("results");
      results.innerHTML = "";

      if (!data || data.length === 0) {
        results.innerHTML = "<li>No resources found</li>";
        return;
      }

      const header = document.createElement("h3");
      header.innerText = "📂 Uploaded Resources (Local)";
      results.appendChild(header);

      data.forEach(item => {
        const li = document.createElement("li");

        li.innerHTML = `
          <b>${item.title}</b> - ${item.subject}<br>
          <a href="http://localhost:5000/uploads/${item.pdf}" target="_blank">View PDF</a>
          <br>
          ${token ? `
            <button onclick="editResource('${item._id}', '${item.title}', '${item.subject}')">Edit</button>
            <button onclick="deleteResource('${item._id}')">Delete</button>
          ` : ""}
          <hr>
        `;

        results.appendChild(li);
      });
    })
    .catch(err => console.error("Load Error:", err));
}

// ================================
// 🔍 SMART SEARCH (Internet + Local)
// ================================
async function searchResource() {
  const query = document.getElementById("searchInput").value.trim();
  const results = document.getElementById("results");

  if (!query) return;

  results.innerHTML = "<li>Loading resources...</li>";

  try {
    results.innerHTML = "";

    // =========================
    // 📘 OPEN LIBRARY
    // =========================
    const bookRes = await fetch(`https://openlibrary.org/search.json?q=${query}`);
    const bookData = await bookRes.json();

    if (bookData.docs && bookData.docs.length > 0) {
      const header = document.createElement("h3");
      header.innerText = "📘 Textbooks (Open Library)";
      results.appendChild(header);

      bookData.docs.slice(0, 5).forEach(book => {
        const li = document.createElement("li");
        li.innerHTML = `
          <b>${book.title}</b><br>
          Author: ${book.author_name ? book.author_name[0] : "Unknown"}<br>
          <a href="https://openlibrary.org${book.key}" target="_blank">
            Open Book
          </a>
          <hr>
        `;
        results.appendChild(li);
      });
    }

    // =========================
    // 🎥 REAL YOUTUBE API
    // =========================
   // =========================
// 🎥 YOUTUBE (NO API)
// =========================
const ytHeader = document.createElement("h3");
ytHeader.innerText = "🎥 Tutorials (YouTube)";
results.appendChild(ytHeader);

const ytLink = document.createElement("li");
ytLink.innerHTML = `
  <b>Watch Tutorials:</b><br>
  <a href="https://www.youtube.com/results?search_query=${query}+tutorial" target="_blank">
    ${query} Tutorial
  </a><br>
  <a href="https://www.youtube.com/results?search_query=${query}+lecture" target="_blank">
    ${query} Lecture
  </a>
  <hr>
`;
results.appendChild(ytLink);

    // =========================
    // 🎓 COURSERA
    // =========================
    const courseHeader = document.createElement("h3");
    courseHeader.innerText = "🎓 Courses (Coursera)";
    results.appendChild(courseHeader);

    const courseLink = document.createElement("li");
    courseLink.innerHTML = `
      <a href="https://www.coursera.org/search?query=${query}" target="_blank">
        Find "${query}" Courses on Coursera
      </a>
      <hr>
    `;
    results.appendChild(courseLink);

    // =========================
    // 📄 CORE
    // =========================
    const coreHeader = document.createElement("h3");
    coreHeader.innerText = "📄 Research Papers (CORE)";
    results.appendChild(coreHeader);

    const coreLink = document.createElement("li");
    coreLink.innerHTML = `
      <a href="https://core.ac.uk/search?q=${query}" target="_blank">
        Search "${query}" Research Papers on CORE
      </a>
      <hr>
    `;
    results.appendChild(coreLink);

  } catch (error) {
    results.innerHTML = "<li>Error fetching resources</li>";
    console.error(error);
  }
}

// ================================
// 📄 UPLOAD RESOURCE
// ================================
const uploadForm = document.getElementById("uploadForm");

if (uploadForm) {
  uploadForm.addEventListener("submit", function (e) {
    e.preventDefault();

    if (!token) {
      alert("You must login first!");
      return;
    }

    const formData = new FormData(uploadForm);

    fetch(`${API_BASE}/resources`, {
      method: "POST",
      headers: { Authorization: token },
      body: formData
    })
      .then(res => res.json())
      .then(data => {
        alert("Uploaded successfully!");
        uploadForm.reset();
        loadResources();
      })
      .catch(err => console.error("Upload Error:", err));
  });
}

// ================================
// ✏ EDIT RESOURCE
// ================================
function editResource(id, oldTitle, oldSubject) {
  const newTitle = prompt("Edit Title:", oldTitle);
  const newSubject = prompt("Edit Subject:", oldSubject);

  if (!newTitle || !newSubject) return;

  fetch(`${API_BASE}/resources/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: token
    },
    body: JSON.stringify({
      title: newTitle,
      subject: newSubject
    })
  })
    .then(res => res.json())
    .then(data => {
      alert("Updated successfully!");
      loadResources();
    })
    .catch(err => console.error("Edit Error:", err));
}

// ================================
// 🗑 DELETE RESOURCE
// ================================
function deleteResource(id) {
  if (!confirm("Are you sure you want to delete this resource?")) return;

  fetch(`${API_BASE}/resources/${id}`, {
    method: "DELETE",
    headers: { Authorization: token }
  })
    .then(res => res.json())
    .then(data => {
      alert("Deleted successfully!");
      loadResources();
    })
    .catch(err => console.error("Delete Error:", err));
}

// ================================
// 🚀 AUTO LOAD LOCAL RESOURCES
// ================================
document.addEventListener("DOMContentLoaded", function () {
  loadResources();
});