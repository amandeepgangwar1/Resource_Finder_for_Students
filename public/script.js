const API_BASE =
  typeof window !== "undefined" && typeof window.resourceFinderApiBase === "function"
    ? window.resourceFinderApiBase()
    : "/api";
let token = localStorage.getItem("token");

const state = {
  adminResources: [],
  dashboardResources: [],
  duplicateDeletionCandidates: [],
  userBookmarks: [],
  searchHistory: []
};

const WEB_SOURCE_FILTERS = {
  "open-library": "Open Library",
  youtube: "YouTube",
  coursera: "Coursera",
  core: "CORE"
};

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = byId(id);
  if (element) element.textContent = value;
}

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function encodeUploadPath(value) {
  return String(value || "")
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function resourceLink(resource) {
  if (resource.link) return resource.link;
  const filePath = resource.filePath || resource.file || resource.pdf;
  if (filePath) {
    const uploadBase =
      typeof window !== "undefined" && typeof window.resourceFinderUploadBase === "function"
        ? window.resourceFinderUploadBase()
        : "/uploads";
    return `${uploadBase}/${encodeUploadPath(filePath)}`;
  }
  return "#";
}

function localSourceFor(resource) {
  const category = resource.fileCategory || "File";
  return `Local ${category}`;
}

function resourceKey(item) {
  return String(item.id || item._id || item.link || resourceLink(item) || item.title);
}

function sourceIconFor(source) {
  const icons = {
    "Local PDF": "PDF",
    "Local Document": "DOC",
    "Local Spreadsheet": "XLS",
    "Local Presentation": "PPT",
    "Local Image": "IMG",
    "Local Video": "VID",
    "Local Audio": "AUD",
    "Local Archive": "ZIP",
    "Local Code": "DEV",
    "Local Other": "FILE",
    "Open Library": "BK",
    YouTube: "VID",
    Coursera: "CLS",
    edX: "EDX",
    "MIT OpenCourseWare": "MIT",
    CORE: "DOC",
    "Khan Academy": "KA",
    GeeksforGeeks: "GFG",
    "Internet Archive": "IA"
  };

  return icons[source] || "SRC";
}

function sourceClassFor(source) {
  return String(source || "resource")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeSourceFilter(source) {
  return WEB_SOURCE_FILTERS[sourceClassFor(source)] || "";
}

function renderAuthControls() {
  document.querySelectorAll(".auth-logged-in").forEach((element) => {
    element.hidden = !token;
  });
  document.querySelectorAll(".auth-logged-out").forEach((element) => {
    element.hidden = Boolean(token);
  });
}

function clearAuthSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("bookmarks");
  localStorage.removeItem("searchHistory");
  token = null;
  state.userBookmarks = [];
  state.searchHistory = [];
  renderAuthControls();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (
      response.status === 401 ||
      data.message === "Invalid token" ||
      data.message === "Invalid or expired login session"
    ) {
      clearAuthSession();
      throw new Error("Your login session expired. Please log in again.");
    }

    throw new Error(data.message || `Request failed with ${response.status}`);
  }

  return data;
}

function showStatus(message, type = "info") {
  const target =
    byId("statusMessage") ||
    byId("adminMessage") ||
    byId("dashboardMessage");

  if (!target) return;

  target.textContent = message;
  target.className = `status-message ${type}`;
}

function normalizeBookmarkItem(item) {
  return {
    id: item.id || item._id || item.link || `${Date.now()}-${Math.random()}`,
    title: item.title || "Untitled resource",
    subject: item.subject || "General",
    source: item.source || item.type || "Saved resource",
    link: item.link || resourceLink(item),
    createdAt: item.createdAt || new Date().toISOString()
  };
}

function readLocalBookmarks() {
  try {
    const raw = JSON.parse(localStorage.getItem("bookmarks") || "[]");
    if (!Array.isArray(raw)) return [];

    return raw
      .filter((item) => item && (item.title || item.link))
      .map(normalizeBookmarkItem);
  } catch (error) {
    return [];
  }
}

function mergeBookmarks(primary = [], secondary = []) {
  const seen = new Set();
  const merged = [];

  [...primary, ...secondary].forEach((item) => {
    const bookmark = normalizeBookmarkItem(item);
    const key = resourceKey(bookmark);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(bookmark);
  });

  return merged.slice(0, 100);
}

function readLocalSearchHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem("searchHistory") || "[]");
    if (!Array.isArray(raw)) return [];

    return raw
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  } catch (error) {
    return [];
  }
}

function mergeSearchHistory(primary = [], secondary = []) {
  const seen = new Set();
  const merged = [];

  [...primary, ...secondary].forEach((item) => {
    const query = String(item || "").trim();
    const key = query.toLowerCase();
    if (!query || seen.has(key)) return;
    seen.add(key);
    merged.push(query);
  });

  return merged.slice(0, 20);
}

function initializeLocalUserState() {
  state.userBookmarks = readLocalBookmarks();
  state.searchHistory = readLocalSearchHistory();
}

function getBookmarks() {
  return state.userBookmarks;
}

function saveBookmarks(bookmarks, options = {}) {
  state.userBookmarks = mergeBookmarks(bookmarks);
  localStorage.setItem("bookmarks", JSON.stringify(state.userBookmarks));

  if (options.sync !== false) {
    syncBookmarksToDatabase();
  }
}

function getSearchHistory() {
  return state.searchHistory;
}

function saveSearchHistory(history, options = {}) {
  state.searchHistory = mergeSearchHistory(history);
  localStorage.setItem("searchHistory", JSON.stringify(state.searchHistory));

  if (options.sync !== false) {
    syncSearchHistoryToDatabase(state.searchHistory[0]);
  }
}

async function syncBookmarksToDatabase() {
  if (!token) return;

  try {
    const data = await fetchJson(`${API_BASE}/user/bookmarks`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: token
      },
      body: JSON.stringify({ bookmarks: state.userBookmarks })
    });

    state.userBookmarks = mergeBookmarks(data.bookmarks || state.userBookmarks);
    localStorage.setItem("bookmarks", JSON.stringify(state.userBookmarks));
    syncSaveButtons();
  } catch (error) {
    showStatus(error.message || "Saved resources could not sync.", "error");
  }
}

async function syncSearchHistoryToDatabase(query) {
  if (!token || !query) return;

  try {
    const data = await fetchJson(`${API_BASE}/user/search-history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token
      },
      body: JSON.stringify({ query })
    });

    state.searchHistory = mergeSearchHistory(data.searchHistory || state.searchHistory);
    localStorage.setItem("searchHistory", JSON.stringify(state.searchHistory));
  } catch (error) {
    showStatus(error.message || "Search history could not sync.", "error");
  }
}

async function loadUserStateFromDatabase() {
  if (!token) return;

  const localBookmarks = getBookmarks();
  const localHistory = getSearchHistory();

  try {
    const data = await fetchJson(`${API_BASE}/user/state`, {
      headers: { Authorization: token }
    });
    const mergedBookmarks = mergeBookmarks(localBookmarks, data.bookmarks || []);
    const mergedHistory = mergeSearchHistory(localHistory, data.searchHistory || []);

    saveBookmarks(mergedBookmarks, { sync: false });
    saveSearchHistory(mergedHistory, { sync: false });

    await fetchJson(`${API_BASE}/user/state`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: token
      },
      body: JSON.stringify({
        bookmarks: state.userBookmarks,
        searchHistory: state.searchHistory
      })
    });
  } catch (error) {
    showStatus(error.message || "Unable to load saved account data.", "error");
  }
}

function isBookmarked(item) {
  const key = resourceKey(item);
  return getBookmarks().some((bookmark) => resourceKey(bookmark) === key);
}

function toBookmark(item) {
  return {
    id: resourceKey(item),
    title: item.title || "Untitled resource",
    subject: item.subject || "General",
    source: item.source || "Saved resource",
    link: resourceLink(item),
    createdAt: new Date().toISOString()
  };
}

function toggleBookmark(item) {
  const bookmark = toBookmark(item);
  const bookmarks = getBookmarks();
  const key = resourceKey(bookmark);
  const nextBookmarks = bookmarks.filter((saved) => resourceKey(saved) !== key);

  if (nextBookmarks.length === bookmarks.length) {
    nextBookmarks.unshift(bookmark);
    showStatus("Resource saved to your dashboard.", "success");
  } else {
    showStatus("Resource removed from your dashboard.", "info");
  }

  saveBookmarks(nextBookmarks);
  syncSaveButtons();

  if (byId("savedList")) {
    renderDashboard();
  }
}

function syncSaveButtons() {
  document.querySelectorAll("[data-save-key]").forEach((button) => {
    const key = button.dataset.saveKey;
    const saved = getBookmarks().some((bookmark) => resourceKey(bookmark) === key);
    button.textContent = saved ? "Saved" : "Save";
    button.classList.toggle("is-saved", saved);
    button.setAttribute("aria-pressed", saved ? "true" : "false");
  });
}

function createActionLink(label, href) {
  const link = document.createElement("a");
  link.href = href;
  link.textContent = label;
  link.className = "button secondary";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function createButton(label, className = "button") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  return button;
}

function createResourceCard(item, options = {}) {
  const listItem = document.createElement("li");
  listItem.className = "resource-item";

  const header = document.createElement("div");
  header.className = "resource-head";

  const titleWrap = document.createElement("div");
  titleWrap.className = "resource-title";

  const icon = document.createElement("span");
  icon.className = "source-icon";
  icon.classList.add(`source-${sourceClassFor(item.source)}`);
  icon.textContent = item.icon || sourceIconFor(item.source);
  icon.setAttribute("aria-hidden", "true");

  const title = document.createElement("h3");
  title.textContent = item.title || "Untitled resource";

  titleWrap.append(icon, title);

  const source = document.createElement("span");
  source.className = "badge";
  source.textContent = item.source || "Resource";

  header.append(titleWrap, source);

  const meta = document.createElement("p");
  meta.className = "resource-meta";
  const subject = item.subject || "General";
  const category = item.fileCategory ? ` | ${item.fileCategory}` : "";
  const created = item.createdAt ? ` | Added ${formatDate(item.createdAt)}` : "";
  meta.textContent = `${subject}${category}${created}`;

  const actions = document.createElement("div");
  actions.className = "actions";

  const link = resourceLink(item);
  if (link && link !== "#") {
    actions.appendChild(createActionLink(options.openLabel || "Open", link));
  }

  if (options.allowSave) {
    const saveButton = createButton("Save", "button");
    saveButton.dataset.saveKey = resourceKey(item);
    saveButton.addEventListener("click", () => toggleBookmark(item));
    actions.appendChild(saveButton);
  }

  if (options.allowRemoveSaved) {
    const removeButton = createButton("Remove", "button danger");
    removeButton.addEventListener("click", () => {
      const key = resourceKey(item);
      saveBookmarks(getBookmarks().filter((saved) => resourceKey(saved) !== key));
      renderDashboard();
      showStatus("Saved resource removed.", "info");
    });
    actions.appendChild(removeButton);
  }

  if (options.allowAdmin) {
    const editButton = createButton("Edit", "button");
    editButton.addEventListener("click", () => startAdminEdit(item._id));

    const deleteButton = createButton("Delete", "button danger");
    deleteButton.addEventListener("click", () => deleteAdminResource(item._id));

    actions.append(editButton, deleteButton);
  }

  listItem.append(header, meta, actions);
  return listItem;
}

function renderResourceList(list, items, emptyMessage, options = {}) {
  if (!list) return;
  list.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = emptyMessage;
    list.appendChild(empty);
    return;
  }

  items.forEach((item) => list.appendChild(createResourceCard(item, options)));
  syncSaveButtons();
}

function setLibraryOpen(isOpen) {
  const panel = byId("libraryPanel");
  const list = byId("localResults");
  const toggle = byId("libraryToggle");

  if (!panel || !list || !toggle) return;

  panel.classList.toggle("is-open", isOpen);
  list.hidden = !isOpen;
  toggle.textContent = isOpen ? "Close Library" : "Open Library";
  toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function setupLibraryPanel() {
  const toggle = byId("libraryToggle");
  if (!toggle) return;

  toggle.addEventListener("click", () => {
    const isOpen = toggle.getAttribute("aria-expanded") !== "true";
    setLibraryOpen(isOpen);
  });

  setLibraryOpen(false);
}

async function loadResources(search = "") {
  const list = byId("localResults");
  if (!list) return [];

  list.innerHTML = '<li class="empty-state">Loading local resources...</li>';

  try {
    const resources = await fetchJson(
      `${API_BASE}/resources?search=${encodeURIComponent(search)}`
    );
    const normalized = resources.map((resource) => ({
      ...resource,
      source: localSourceFor(resource),
      link: resourceLink(resource)
    }));

    setText("localCount", normalized.length);
    renderResourceList(
      list,
      normalized,
      search ? "No local files match this search." : "No local files have been uploaded yet.",
      { allowSave: true, openLabel: "Open File" }
    );

    return normalized;
  } catch (error) {
    list.innerHTML = '<li class="empty-state error">Unable to load local resources.</li>';
    return [];
  }
}

function buildWebResults(query, books = [], sourceFilter = "") {
  const encoded = encodeURIComponent(query);
  const selectedSource = normalizeSourceFilter(sourceFilter);
  const results = [];

  books.slice(0, 5).forEach((book) => {
    if (!book.title || !book.key) return;
    results.push({
      title: book.title,
      subject: book.author_name ? `Author: ${book.author_name[0]}` : "Open Library book",
      source: "Open Library",
      icon: "BK",
      link: `https://openlibrary.org${book.key}`
    });
  });

  if (!results.some((item) => item.source === "Open Library")) {
    results.push({
      title: `${query} books`,
      subject: "Open Library search",
      source: "Open Library",
      icon: "BK",
      link: `https://openlibrary.org/search?q=${encoded}`
    });
  }

  results.push(
    {
      title: `${query} video lessons`,
      subject: "Tutorials, lectures, and walkthroughs",
      source: "YouTube",
      icon: "VID",
      link: `https://www.youtube.com/results?search_query=${encoded}+tutorial`
    },
    {
      title: `${query} guided courses`,
      subject: "Structured courses and certificates",
      source: "Coursera",
      icon: "CLS",
      link: `https://www.coursera.org/search?query=${encoded}`
    },
    {
      title: `${query} free online courses`,
      subject: "University-style open courses",
      source: "edX",
      icon: "EDX",
      link: `https://www.edx.org/search?q=${encoded}`
    },
    {
      title: `${query} open courseware`,
      subject: "Lecture notes, assignments, and readings",
      source: "MIT OpenCourseWare",
      icon: "MIT",
      link: `https://ocw.mit.edu/search/?q=${encoded}`
    },
    {
      title: `${query} research papers`,
      subject: "Open access academic papers",
      source: "CORE",
      icon: "DOC",
      link: `https://core.ac.uk/search?q=${encoded}`
    },
    {
      title: `${query} practice and lessons`,
      subject: "Concept explanations and exercises",
      source: "Khan Academy",
      icon: "KA",
      link: `https://www.khanacademy.org/search?page_search_query=${encoded}`
    },
    {
      title: `${query} tutorials and examples`,
      subject: "Programming articles and examples",
      source: "GeeksforGeeks",
      icon: "GFG",
      link: `https://www.geeksforgeeks.org/?s=${encoded}`
    },
    {
      title: `${query} archived books and media`,
      subject: "Public archive search",
      source: "Internet Archive",
      icon: "IA",
      link: `https://archive.org/search?query=${encoded}`
    }
  );

  if (selectedSource) {
    return results.filter((item) => item.source === selectedSource);
  }

  return results;
}

async function searchResource() {
  const input = byId("searchInput");
  const webList = byId("results");
  const query = input ? input.value.trim() : "";
  const sourceFilter = getInitialSourceFilter();

  if (!query) {
    showStatus("Enter a topic to search.", "error");
    return;
  }

  if (!webList) {
    const params = new URLSearchParams({ q: query });
    if (sourceFilter) params.set("source", sourceClassFor(sourceFilter));
    window.location.href = `results.html?${params.toString()}`;
    return;
  }

  // Save search to history
  saveSearchToHistory(query);

  if (webList) {
    webList.innerHTML = '<li class="empty-state">Searching web resources...</li>';
  }

  if (sourceFilter) {
    showStatus(`Searching ${sourceFilter} results...`, "info");
  } else {
    showStatus("Searching local library and web sources...", "info");
    setLibraryOpen(true);
    loadResources(query);
  }

  const needsOpenLibrary = !sourceFilter || sourceFilter === "Open Library";
  let books = [];
  let openLibraryUnavailable = false;

  if (needsOpenLibrary) {
    try {
      const bookData = await fetchJson(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}`
      );
      books = bookData.docs || [];
    } catch (error) {
      openLibraryUnavailable = true;
    }
  }

  const webResults = buildWebResults(query, books, sourceFilter);
  const emptyMessage = sourceFilter
    ? `No ${sourceFilter} results found for "${query}".`
    : "No web results found.";

  renderResourceList(webList, webResults, emptyMessage, {
    allowSave: true,
    openLabel: "Open"
  });

  if (openLibraryUnavailable && sourceFilter === "Open Library") {
    showStatus("Open Library is unavailable, but a direct search link is ready.", "info");
  } else if (openLibraryUnavailable) {
    showStatus("Open Library is unavailable, but quick links are ready.", "info");
  } else if (sourceFilter) {
    showStatus(`Showing ${sourceFilter} results for "${query}".`, "success");
  } else {
    showStatus("Search complete.", "success");
  }
}

function setupUploadForm() {
  const uploadForm = byId("uploadForm");
  if (!uploadForm) return;

  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!token) {
      showStatus("Log in before uploading files.", "error");
      return;
    }

    const submitButton = uploadForm.querySelector("button[type='submit']");
    if (submitButton) submitButton.disabled = true;

    try {
      const data = await fetchJson(`${API_BASE}/resources`, {
        method: "POST",
        headers: { Authorization: token },
        body: new FormData(uploadForm)
      });

      uploadForm.reset();
      await loadResources();
      showStatus(data.message || "File uploaded.", "success");
    } catch (error) {
      showStatus(error.message || "Upload failed.", "error");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

function saveSearchToHistory(query) {
  if (!query.trim()) return;
  const history = getSearchHistory();
  const trimmedQuery = query.trim();
  
  // Remove duplicate if exists
  const filtered = history.filter((q) => q.toLowerCase() !== trimmedQuery.toLowerCase());
  
  // Add to beginning (newest first) and keep only last 20 searches
  filtered.unshift(trimmedQuery);
  saveSearchHistory(filtered.slice(0, 20));
}

function renderSearchHistory() {
  const resultsList = byId("results");
  if (!resultsList) return;

  const history = getSearchHistory();
  const sourceFilter = getInitialSourceFilter();
  if (!history.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = sourceFilter
      ? `Search a topic first to show ${sourceFilter} results from your history.`
      : "Search a topic to see books, videos, courses, papers, and tutorials.";
    resultsList.innerHTML = "";
    resultsList.appendChild(empty);
    showStatus(empty.textContent, "info");
    return;
  }

  resultsList.innerHTML = "";
  
  // Show search history heading
  const heading = document.createElement("li");
  heading.className = "history-heading";
  const headingText = document.createElement("strong");
  headingText.textContent = sourceFilter
    ? `Recent Searches for ${sourceFilter}`
    : "Your Recent Searches";
  heading.appendChild(headingText);
  resultsList.appendChild(heading);

  history.forEach((query) => {
    const li = document.createElement("li");
    li.className = "history-item";
    
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-button";
    button.textContent = query;
    button.addEventListener("click", () => {
      byId("searchInput").value = query;
      searchResource();
    });
    
    li.appendChild(button);
    resultsList.appendChild(li);
  });

  showStatus(
    sourceFilter
      ? `Click any search to show ${sourceFilter} results.`
      : "Click any search to run it again.",
    "info"
  );
}

function getInitialSourceFilter() {
  return normalizeSourceFilter(new URLSearchParams(window.location.search).get("source"));
}

function getInitialSearchQuery() {
  const params = new URLSearchParams(window.location.search);
  const query = params.get("q") || "";
  if (query.trim()) return query;

  return getInitialSourceFilter() ? getSearchHistory()[0] || "" : "";
}

function initResourcePages() {
  const searchInput = byId("searchInput");

  if (searchInput) {
    const initialQuery = getInitialSearchQuery();
    if (initialQuery && !searchInput.value) {
      searchInput.value = initialQuery;
    }

    byId("searchButton")?.addEventListener("click", searchResource);
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") searchResource();
    });

    document.querySelectorAll("[data-topic]").forEach((button) => {
      button.addEventListener("click", () => {
        searchInput.value = button.dataset.topic;
        searchResource();
      });
    });

    if (initialQuery && byId("results")) {
      searchResource();
    } else if (byId("results")) {
      // Show search history or empty state if no initial query
      renderSearchHistory();
    }
  }

  setupUploadForm();
  setupLibraryPanel();

  if (byId("localResults")) {
    loadResources(getInitialSearchQuery());
  }
}

function sortBookmarks(bookmarks) {
  const sort = byId("savedSort")?.value || "newest";
  const sorted = [...bookmarks];

  if (sort === "title") {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sort === "source") {
    sorted.sort((a, b) => a.source.localeCompare(b.source));
  } else {
    sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  return sorted;
}

function filteredBookmarks() {
  const query = byId("savedSearch")?.value.trim().toLowerCase() || "";
  const bookmarks = getBookmarks();

  const filtered = bookmarks.filter((bookmark) => {
    const content = `${bookmark.title} ${bookmark.subject} ${bookmark.source}`.toLowerCase();
    return content.includes(query);
  });

  return sortBookmarks(filtered);
}

function renderRecommendations(bookmarks) {
  const list = byId("recommendationList");
  if (!list) return;

  const savedKeys = new Set(bookmarks.map((bookmark) => resourceKey(bookmark)));
  const subjects = new Set(
    bookmarks.map((bookmark) => bookmark.subject.toLowerCase()).filter(Boolean)
  );

  const recommendations = state.dashboardResources
    .filter((resource) => !savedKeys.has(resourceKey(resource)))
    .filter((resource) => {
      if (!subjects.size) return true;
      return subjects.has((resource.subject || "").toLowerCase());
    })
    .slice(0, 5)
    .map((resource) => ({ ...resource, source: localSourceFor(resource), link: resourceLink(resource) }));

  renderResourceList(
    list,
    recommendations,
    "Save resources to get matching local recommendations.",
    { allowSave: true, openLabel: "Open File" }
  );
}

function renderDashboard() {
  const bookmarks = getBookmarks();
  const visibleBookmarks = filteredBookmarks();
  const uniqueSources = new Set(bookmarks.map((bookmark) => bookmark.source));
  const latest = bookmarks[0]?.createdAt ? formatDate(bookmarks[0].createdAt) : "None yet";

  setText("savedCount", bookmarks.length);
  setText("sourceCount", uniqueSources.size);
  setText("localLibraryCount", state.dashboardResources.length);
  setText("recentSavedDate", latest);

  renderResourceList(
    byId("savedList"),
    visibleBookmarks,
    "No saved resources match your filters.",
    { allowRemoveSaved: true, openLabel: "Open" }
  );
  renderRecommendations(bookmarks);
}

async function initDashboard() {
  if (!byId("savedList")) return;

  byId("savedSearch")?.addEventListener("input", renderDashboard);
  byId("savedSort")?.addEventListener("change", renderDashboard);

  byId("clearBookmarks")?.addEventListener("click", () => {
    if (!getBookmarks().length) return;
    if (!confirm("Remove all saved resources from this browser?")) return;
    saveBookmarks([]);
    renderDashboard();
    showStatus("Saved resources cleared.", "info");
  });

  byId("exportBookmarks")?.addEventListener("click", () => {
    const bookmarks = getBookmarks();
    const blob = new Blob([JSON.stringify(bookmarks, null, 2)], {
      type: "application/json"
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "saved-resources.json";
    link.click();
    URL.revokeObjectURL(link.href);
  });

  try {
    state.dashboardResources = await fetchJson(`${API_BASE}/resources`);
  } catch (error) {
    state.dashboardResources = [];
  }

  renderDashboard();
}

function renderAdminStats(stats) {
  setText("adminResourceCount", stats.totalResources || 0);
  setText("adminUserCount", stats.totalUsers || 0);
  setText("adminFlaggedCount", stats.flaggedResources || 0);
  setText("adminSubjectCount", (stats.topSubjects || []).length);

  const topSubjects = byId("topSubjects");
  if (!topSubjects) return;

  topSubjects.innerHTML = "";
  if (!stats.topSubjects || !stats.topSubjects.length) {
    topSubjects.innerHTML = '<li class="empty-state">No subject data yet.</li>';
    return;
  }

  stats.topSubjects.forEach((item) => {
    const li = document.createElement("li");
    li.className = "compact-row";
    const subject = document.createElement("span");
    subject.textContent = item.subject;
    const count = document.createElement("strong");
    count.textContent = item.count;
    li.append(subject, count);
    topSubjects.appendChild(li);
  });
}

function populateSubjectFilter(resources) {
  const select = byId("adminSubjectFilter");
  if (!select) return;

  const current = select.value;
  const subjects = [...new Set(resources.map((resource) => resource.subject).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  select.innerHTML = '<option value="">All subjects</option>';
  subjects.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    select.appendChild(option);
  });
  select.value = current;
}

function renderAdminResources() {
  const query = byId("adminSearch")?.value.trim().toLowerCase() || "";
  const subject = byId("adminSubjectFilter")?.value || "";

  const resources = state.adminResources
    .filter((resource) => {
      const content = `${resource.title} ${resource.subject}`.toLowerCase();
      return content.includes(query);
    })
    .filter((resource) => !subject || resource.subject === subject)
    .map((resource) => ({ ...resource, source: localSourceFor(resource), link: resourceLink(resource) }));

  renderResourceList(
    byId("adminResourceList"),
    resources,
    "No resources match the current admin filters.",
    { allowAdmin: true, openLabel: "Open File" }
  );
}

async function loadAdmin() {
  if (!byId("adminResourceList")) return;

  if (!token) {
    showStatus("Log in to use admin controls.", "error");
    document.querySelectorAll("[data-admin-control]").forEach((element) => {
      element.disabled = true;
    });
    renderResourceList(byId("adminResourceList"), [], "Admin controls require login.");
    return;
  }

  showStatus("Loading admin data...", "info");

  try {
    const [stats, resources] = await Promise.all([
      fetchJson(`${API_BASE}/admin/stats`, {
        headers: { Authorization: token }
      }),
      fetchJson(`${API_BASE}/resources`)
    ]);

    state.adminResources = resources;
    renderAdminStats(stats);
    populateSubjectFilter(resources);
    renderAdminResources();
    showStatus("Admin data ready.", "success");
  } catch (error) {
    showStatus(error.message || "Unable to load admin data.", "error");
  }
}

function startAdminEdit(id) {
  const resource = state.adminResources.find((item) => item._id === id);
  const panel = byId("adminEditor");
  if (!resource || !panel) return;

  byId("editResourceId").value = resource._id;
  byId("editTitle").value = resource.title || "";
  byId("editSubject").value = resource.subject || "";
  panel.hidden = false;
  byId("editTitle").focus();
}

async function saveAdminEdit(event) {
  event.preventDefault();

  const id = byId("editResourceId").value;
  const title = byId("editTitle").value.trim();
  const subject = byId("editSubject").value.trim();

  if (!title || !subject) {
    showStatus("Title and subject are required.", "error");
    return;
  }

  try {
    await fetchJson(`${API_BASE}/resources/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: token
      },
      body: JSON.stringify({ title, subject })
    });

    byId("adminEditor").hidden = true;
    await loadAdmin();
    showStatus("Resource updated.", "success");
  } catch (error) {
    showStatus(error.message || "Update failed.", "error");
  }
}

async function deleteAdminResource(id) {
  const resource = state.adminResources.find((item) => item._id === id);
  if (!resource) return;

  if (!confirm(`Delete "${resource.title}"? This also removes its uploaded file.`)) return;

  try {
    await fetchJson(`${API_BASE}/resources/${id}`, {
      method: "DELETE",
      headers: { Authorization: token }
    });
    await loadAdmin();
    showStatus("Resource deleted.", "success");
  } catch (error) {
    showStatus(error.message || "Delete failed.", "error");
  }
}

function resourceTimestamp(resource) {
  const time = new Date(resource?.createdAt).getTime();
  return Number.isFinite(time) ? time : null;
}

function chooseDuplicateDeleteCandidate(duplicate) {
  const first = duplicate.doc1 || {};
  const second = duplicate.doc2 || {};

  if (!first._id) return second._id ? second : null;
  if (!second._id) return first;

  const firstTime = resourceTimestamp(first);
  const secondTime = resourceTimestamp(second);

  if (firstTime !== null && secondTime !== null) {
    return firstTime > secondTime ? first : second;
  }

  return second;
}

function getDuplicateDeletionCandidates(duplicates) {
  const candidates = new Map();

  duplicates.forEach((duplicate) => {
    const candidate = chooseDuplicateDeleteCandidate(duplicate);
    if (candidate?._id && !candidates.has(candidate._id)) {
      candidates.set(candidate._id, candidate);
    }
  });

  return [...candidates.values()];
}

function renderDuplicateResults(duplicates) {
  const list = byId("duplicateResults");
  if (!list) return;

  list.innerHTML = "";

  if (!duplicates.length) {
    list.innerHTML = '<li class="empty-state">No duplicates detected.</li>';
    return;
  }

  duplicates.forEach((duplicate) => {
    const li = document.createElement("li");
    li.className = "compact-row stacked";
    const score = Math.round((duplicate.similarity || 0) * 100);
    const title = document.createElement("span");
    title.textContent = `${duplicate.doc1?.title || "Resource"} and ${
      duplicate.doc2?.title || "Resource"
    }`;
    const reason = document.createElement("span");
    reason.className = "muted-line";
    reason.textContent = duplicate.reason || "Similar resource details";
    const similarity = document.createElement("strong");
    similarity.textContent = `${score}% similar`;
    li.append(title, reason, similarity);
    list.appendChild(li);
  });
}

function closeDuplicateDialog() {
  const dialog = byId("duplicateDialog");
  if (dialog) dialog.hidden = true;
  state.duplicateDeletionCandidates = [];
}

function openDuplicateDeleteDialog(duplicates) {
  const dialog = byId("duplicateDialog");
  const message = byId("duplicateDialogMessage");
  const list = byId("duplicateDeleteList");
  const yesButton = byId("confirmDuplicateDelete");
  const noButton = byId("cancelDuplicateDelete");
  const candidates = getDuplicateDeletionCandidates(duplicates);

  if (!dialog || !message || !list || !candidates.length) return;

  state.duplicateDeletionCandidates = candidates;
  const duplicateLabel = candidates.length === 1 ? "file" : "files";
  message.textContent = `Found ${duplicates.length} duplicate match${
    duplicates.length === 1 ? "" : "es"
  }. Do you want to delete ${candidates.length} duplicate ${duplicateLabel}?`;

  list.innerHTML = "";
  candidates.forEach((candidate) => {
    const item = document.createElement("li");
    item.className = "compact-row stacked";
    const title = document.createElement("span");
    title.textContent = candidate.title || "Untitled resource";
    const detail = document.createElement("span");
    detail.className = "muted-line";
    detail.textContent = candidate.originalName || candidate.filePath || "Uploaded file";
    item.append(title, detail);
    list.appendChild(item);
  });

  if (yesButton) yesButton.disabled = false;
  if (noButton) noButton.disabled = false;
  dialog.hidden = false;
  noButton?.focus();
}

async function deleteDuplicateCandidates() {
  const candidates = [...state.duplicateDeletionCandidates];
  const yesButton = byId("confirmDuplicateDelete");
  const noButton = byId("cancelDuplicateDelete");
  const message = byId("duplicateDialogMessage");

  if (!candidates.length) {
    closeDuplicateDialog();
    return;
  }

  if (yesButton) yesButton.disabled = true;
  if (noButton) noButton.disabled = true;
  if (message) message.textContent = "Deleting duplicate files...";

  try {
    let deletedCount = 0;

    for (const candidate of candidates) {
      await fetchJson(`${API_BASE}/resources/${candidate._id}`, {
        method: "DELETE",
        headers: { Authorization: token }
      });
      deletedCount += 1;
    }

    closeDuplicateDialog();
    await loadAdmin();
    await runDuplicateScan({ promptForDelete: false });
    showStatus(`Deleted ${deletedCount} duplicate file${deletedCount === 1 ? "" : "s"}.`, "success");
  } catch (error) {
    if (message) message.textContent = error.message || "Duplicate deletion failed.";
    showStatus(error.message || "Duplicate deletion failed.", "error");
    if (yesButton) yesButton.disabled = false;
    if (noButton) noButton.disabled = false;
  }
}

async function runDuplicateScan(options = {}) {
  const { promptForDelete = true } = options;
  const list = byId("duplicateResults");
  if (!list || !token) return;

  list.innerHTML = '<li class="empty-state">Checking for duplicate resources...</li>';

  try {
    const data = await fetchJson(`${API_BASE}/ai/duplicates`, {
      headers: { Authorization: token }
    });

    if (!data.duplicates || !data.duplicates.length) {
      renderDuplicateResults([]);
      return;
    }

    renderDuplicateResults(data.duplicates);
    if (promptForDelete) openDuplicateDeleteDialog(data.duplicates);
  } catch (error) {
    list.innerHTML = '<li class="empty-state error">Duplicate scan failed.</li>';
  }
}

function exportAdminCsv() {
  const rows = [
    ["Title", "Subject", "Category", "File", "Original Name", "Created At"],
    ...state.adminResources.map((resource) => [
      resource.title || "",
      resource.subject || "",
      resource.fileCategory || "",
      resource.filePath || resource.file || resource.pdf || "",
      resource.originalName || "",
      resource.createdAt || ""
    ])
  ];

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "resources.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function initAdmin() {
  if (!byId("adminResourceList")) return;

  byId("refreshAdmin")?.addEventListener("click", loadAdmin);
  byId("adminSearch")?.addEventListener("input", renderAdminResources);
  byId("adminSubjectFilter")?.addEventListener("change", renderAdminResources);
  byId("adminEditForm")?.addEventListener("submit", saveAdminEdit);
  byId("cancelEdit")?.addEventListener("click", () => {
    byId("adminEditor").hidden = true;
  });
  byId("scanDuplicates")?.addEventListener("click", runDuplicateScan);
  byId("confirmDuplicateDelete")?.addEventListener("click", deleteDuplicateCandidates);
  byId("cancelDuplicateDelete")?.addEventListener("click", closeDuplicateDialog);
  byId("duplicateDialog")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeDuplicateDialog();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !byId("duplicateDialog")?.hidden) {
      closeDuplicateDialog();
    }
  });
  byId("exportResources")?.addEventListener("click", exportAdminCsv);

  loadAdmin();
}

function initAuthControls() {
  renderAuthControls();
  document.querySelectorAll("[data-auth-action='logout']").forEach((button) => {
    button.addEventListener("click", () => {
      clearAuthSession();
      window.location.href = "login.html";
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  initializeLocalUserState();
  initAuthControls();
  await loadUserStateFromDatabase();
  initResourcePages();
  initDashboard();
  initAdmin();
});
