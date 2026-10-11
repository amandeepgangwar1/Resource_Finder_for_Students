const API_BASE =
  typeof window !== "undefined" && typeof window.resourceFinderApiBase === "function"
    ? window.resourceFinderApiBase()
    : "/api";
let token = localStorage.getItem("token");

const state = {
  adminResources: [],
  adminUsers: [],
  dashboardRecommendations: [],
  dashboardResources: [],
  duplicateDeletionCandidates: [],
  currentUser: null,
  localPagination: {
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 1
  },
  lastDuplicateCheck: null,
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

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "Unknown size";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function ratingLabel(resource) {
  const rating = Number(resource.rating || 0);
  const count = Number(resource.ratingCount || 0);
  return count ? `${rating.toFixed(1)} stars (${count})` : "No ratings";
}

function encodeUploadPath(value) {
  const normalized = String(value || "").trim().replace(/\\/g, "/");
  const uploadMarker = "/uploads/";
  const markerIndex = normalized.toLowerCase().lastIndexOf(uploadMarker);
  const relativePath =
    markerIndex >= 0
      ? normalized.slice(markerIndex + uploadMarker.length)
      : normalized.replace(/^\/?uploads\//i, "").replace(/^\/+/, "");

  return relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function resourceLink(resource) {
  if (resource?._id) {
    return `${API_BASE}/resources/${encodeURIComponent(resource._id)}/file`;
  }

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

function resourceViewerLink(resource) {
  if (!resource?._id) return resourceLink(resource);
  return `viewer.html?id=${encodeURIComponent(resource._id)}`;
}

function resourceDownloadLink(resource) {
  if (!resource?._id) return resourceLink(resource);
  return `${API_BASE}/resources/${encodeURIComponent(resource._id)}/download`;
}

function localSourceFor(resource) {
  const category = resource.fileCategory || "File";
  return `Local ${category}`;
}

function resourceKey(item) {
  return String(item.id || item._id || item.link || resourceLink(item) || item.title);
}

function getSourceSvg(source) {
  const s = String(source || "").toLowerCase();
  if (s.includes("pdf")) {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="15" x2="15" y2="15"></line></svg>`;
  }
  if (s.includes("youtube") || s.includes("video")) {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
  }
  if (s.includes("open library") || s.includes("book")) {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`;
  }
  if (s.includes("coursera") || s.includes("edx") || s.includes("opencourseware") || s.includes("khan")) {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>`;
  }
  if (s.includes("spreadsheet") || s.includes("excel") || s.includes("csv")) {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>`;
  }
  if (s.includes("code") || s.includes("geeksforgeeks")) {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`;
  }
  if (s.includes("audio")) {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>`;
  }
  if (s.includes("image")) {
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
}

function sourceIconFor(source) {
  return getSourceSvg(source);
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

function normalizeLocalSourceFilter(source) {
  // "Local and web" has empty source - should search both
  if (source === "") return "";
  
  const normalized = sourceClassFor(source);
  if (!normalized || WEB_SOURCE_FILTERS[normalized]) return "";
  return normalized === "local" ? "local" : normalized.replace(/^local-/, "");
}

function renderAuthControls() {
  const isLoggedIn = Boolean(token);

  document.querySelectorAll(".auth-logged-in").forEach((element) => {
    element.hidden = !isLoggedIn;
  });
  document.querySelectorAll(".auth-logged-out").forEach((element) => {
    element.hidden = isLoggedIn;
  });
  document.querySelectorAll("a[href='dashboard.html'], a[href='profile.html']").forEach((element) => {
    element.hidden = !isLoggedIn;
  });
  document.querySelectorAll("a[href='admin.html']").forEach((element) => {
    element.hidden = !isLoggedIn || !state.currentUser || state.currentUser.role !== "admin";
  });
  document.querySelectorAll("[data-role-required]").forEach((element) => {
    const required = element.dataset.roleRequired.split(",").map((role) => role.trim());
    element.hidden = !state.currentUser || !required.includes(state.currentUser.role);
  });
}

function clearAuthSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("bookmarks");
  localStorage.removeItem("searchHistory");
  token = null;
  state.currentUser = null;
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
    byId("dashboardMessage") ||
    byId("profileMessage");

  if (!target) {
    showToast(message, type);
    return;
  }

  target.textContent = message;
  target.className = `status-message ${type}`;
  showToast(message, type);
}

function ensureToastRegion() {
  let region = byId("toastRegion");
  if (region) return region;

  region = document.createElement("div");
  region.id = "toastRegion";
  region.className = "toast-region";
  region.setAttribute("aria-live", "polite");
  document.body.appendChild(region);
  return region;
}

function showToast(message, type = "info") {
  if (!message) return;
  const region = ensureToastRegion();
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  region.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3800);
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
    state.currentUser = data;
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
    renderAuthControls();
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
    const label = button.querySelector(".save-label");
    if (label) {
      label.textContent = saved ? "Saved" : "Save";
    } else {
      button.textContent = saved ? "Saved" : "Save";
    }
    button.classList.toggle("is-saved", saved);
    button.setAttribute("aria-pressed", saved ? "true" : "false");
  });
}

function createActionLink(label, href, options = {}) {
  const link = document.createElement("a");
  link.href = href;
  link.className = "button secondary";
  if (options.newTab !== false) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }

  let iconSvg = "";
  if (label.toLowerCase().includes("download")) {
    iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="15"></line></svg>`;
  } else if (label.toLowerCase().includes("preview") || label.toLowerCase().includes("open")) {
    iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
  }

  link.innerHTML = `${iconSvg}<span>${label}</span>`;
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
  icon.innerHTML = item.icon || sourceIconFor(item.source);
  icon.setAttribute("aria-hidden", "true");

  const title = document.createElement("h3");
  title.textContent = item.title || "Untitled resource";

  titleWrap.append(icon, title);

  const source = document.createElement("span");
  source.className = "badge badge-source";
  source.textContent = item.source || "Resource";

  header.append(titleWrap, source);

  const meta = document.createElement("div");
  meta.className = "resource-meta";

  if (item.subject) {
    const pill = document.createElement("span");
    pill.className = "meta-pill meta-subject";
    pill.textContent = item.subject;
    meta.appendChild(pill);
  }

  if (item.fileCategory) {
    const pill = document.createElement("span");
    pill.className = "meta-pill";
    pill.textContent = item.fileCategory;
    meta.appendChild(pill);
  }

  if (item.fileSize) {
    const pill = document.createElement("span");
    pill.className = "meta-pill";
    pill.textContent = formatBytes(item.fileSize);
    meta.appendChild(pill);
  }

  if (item.pageCount) {
    const pill = document.createElement("span");
    pill.className = "meta-pill";
    pill.textContent = `${item.pageCount} pgs`;
    meta.appendChild(pill);
  }

  if (item.rating || item._id) {
    const pill = document.createElement("span");
    pill.className = "meta-pill meta-rating";
    pill.textContent = ratingLabel(item);
    meta.appendChild(pill);
  }

  if (item.views) {
    const pill = document.createElement("span");
    pill.className = "meta-pill";
    pill.textContent = `${item.views} views`;
    meta.appendChild(pill);
  }

  if (item.createdAt) {
    const pill = document.createElement("span");
    pill.className = "meta-pill";
    pill.textContent = formatDate(item.createdAt);
    meta.appendChild(pill);
  }

  let summary = null;
  if (item.summary) {
    summary = document.createElement("p");
    summary.className = "resource-summary";
    summary.textContent = item.summary;
  }

  const actions = document.createElement("div");
  actions.className = "actions";

  const link = resourceLink(item);
  if (item._id && options.preferViewer !== false) {
    actions.appendChild(createActionLink(options.openLabel || "Preview", resourceViewerLink(item), { newTab: false }));
  } else if (link && link !== "#") {
    actions.appendChild(createActionLink(options.openLabel || "Open", link));
  }

  if (item._id && options.allowDownload !== false) {
    actions.appendChild(createActionLink("Download", resourceDownloadLink(item)));
  }

  if (options.allowSave) {
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "button save-btn";
    saveButton.dataset.saveKey = resourceKey(item);
    saveButton.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      </svg>
      <span class="save-label">Save</span>
    `;
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
    const editButton = createButton("Edit", "button secondary");
    editButton.addEventListener("click", () => startAdminEdit(item._id));

    const deleteButton = createButton("Delete", "button danger");
    deleteButton.addEventListener("click", () => deleteAdminResource(item._id));

    actions.append(editButton, deleteButton);
  }

  listItem.append(header, meta);
  if (summary) listItem.appendChild(summary);
  listItem.appendChild(actions);
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

  list.innerHTML = '<li class="empty-state skeleton">Loading local resources...</li>';

  try {
    const filters = getSearchFilters();
    const params = new URLSearchParams({
      format: "page",
      page: String(state.localPagination.page),
      limit: String(filters.limit),
      search
    });

    if (filters.subject) params.set("subject", filters.subject);
    if (filters.fileType) params.set("fileType", filters.fileType);
    if (filters.localSource) params.set("source", filters.localSource);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.minRating) params.set("minRating", filters.minRating);
    if (filters.sort) params.set("sort", filters.sort);
    if (filters.semantic) params.set("semantic", "true");

    const data = await fetchJson(`${API_BASE}/resources?${params.toString()}`);
    const resources = Array.isArray(data) ? data : data.resources || [];
    const normalized = resources.map((resource) => ({
      ...resource,
      source: localSourceFor(resource),
      link: resourceLink(resource)
    }));

    state.localPagination = {
      page: data.page || 1,
      limit: data.limit || filters.limit,
      total: data.total ?? normalized.length,
      totalPages: data.totalPages || 1
    };

    setText("localCount", state.localPagination.total);
    renderResourceList(
      list,
      normalized,
      search ? "No local files match this search." : "No local files have been uploaded yet.",
      { allowSave: true, openLabel: "Preview" }
    );
    renderPaginationControls();

    return normalized;
  } catch (error) {
    list.innerHTML = '<li class="empty-state error">Unable to load local resources.</li>';
    return [];
  }
}

function getSearchFilters() {
  const selectedSource = byId("sourceFilter")?.value || getInitialSourceFilter();

  return {
    subject: byId("subjectFilter")?.value || "",
    fileType: byId("fileTypeFilter")?.value || "",
    source: selectedSource,
    localSource: normalizeLocalSourceFilter(selectedSource),
    webSource: normalizeSourceFilter(selectedSource),
    dateFrom: byId("dateFromFilter")?.value || "",
    dateTo: byId("dateToFilter")?.value || "",
    minRating: byId("ratingFilter")?.value || "",
    sort: byId("sortFilter")?.value || "newest",
    limit: Number(byId("pageSize")?.value || (byId("paginationControls") ? state.localPagination.limit : 100) || 12),
    semantic: Boolean(byId("semanticToggle")?.checked)
  };
}

function renderPaginationControls() {
  const controls = byId("paginationControls");
  if (!controls) return;

  const { page, totalPages, total } = state.localPagination;
  controls.innerHTML = "";

  if (!total || totalPages <= 1) return;

  const previous = createButton("Previous", "button secondary");
  previous.disabled = page <= 1;
  previous.addEventListener("click", () => {
    state.localPagination.page = Math.max(1, page - 1);
    loadResources(byId("searchInput")?.value.trim() || "");
  });

  const label = document.createElement("span");
  label.className = "pagination-label";
  label.textContent = `Page ${page} of ${totalPages}`;

  const next = createButton("Next", "button secondary");
  next.disabled = page >= totalPages;
  next.addEventListener("click", () => {
    state.localPagination.page = Math.min(totalPages, page + 1);
    loadResources(byId("searchInput")?.value.trim() || "");
  });

  controls.append(previous, label, next);
}

async function loadResourceFilters() {
  if (!byId("subjectFilter") && !byId("fileTypeFilter")) return;

  try {
    const data = await fetchJson(`${API_BASE}/resources/filters`);
    const subjectSelect = byId("subjectFilter");
    const fileTypeSelect = byId("fileTypeFilter");

    (data.subjects || []).forEach((subject) => {
      const option = document.createElement("option");
      option.value = subject;
      option.textContent = subject;
      subjectSelect?.appendChild(option);
    });

    (data.fileTypes || []).forEach((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      fileTypeSelect?.appendChild(option);
    });
  } catch (error) {
    showStatus("Filters could not be loaded.", "error");
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
  const filters = getSearchFilters();
  const sourceFilter = filters.webSource;

  if (!query) {
    showStatus("Enter a topic to search.", "error");
    return;
  }

  if (!webList) {
    const params = new URLSearchParams({ q: query });
    if (filters.source) params.set("source", sourceClassFor(filters.source));
    window.location.href = `results.html?${params.toString()}`;
    return;
  }

  // Save search to history
  saveSearchToHistory(query);

  if (webList) {
    webList.innerHTML = '<li class="empty-state">Searching web resources...</li>';
  }

  const shouldSearchLocal = !filters.source || filters.source === "local" || filters.localSource;
  const shouldSearchWeb = filters.source !== "local" && !filters.localSource;

  if (sourceFilter) {
    showStatus(`Searching ${sourceFilter} results...`, "info");
  } else {
    showStatus(shouldSearchWeb ? "Searching local library and web sources..." : "Searching local library...", "info");
  }

  if (shouldSearchLocal) {
    state.localPagination.page = 1;
    setLibraryOpen(true);
    loadResources(query);
  } else {
    renderResourceList(byId("localResults"), [], "Local results are hidden by the selected source.");
    setText("localCount", 0);
    byId("paginationControls") && (byId("paginationControls").innerHTML = "");
  }

  if (!shouldSearchWeb) {
    renderResourceList(webList, [], "Web results are hidden by the selected source.");
    showStatus("Local search complete.", "success");
    return;
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
  const fileInput = byId("resourceFile");
  const titleInput = byId("resourceTitle");
  const subjectInput = byId("resourceSubject");
  const dropzone = byId("dropzone");
  const dropzoneContent = byId("dropzoneContent");
  const previewBar = byId("filePreviewBar");
  const previewName = byId("filePreviewName");
  const previewSize = byId("filePreviewSize");
  const removeBtn = byId("fileRemoveBtn");

  const updateFilePreview = () => {
    const file = fileInput?.files?.[0];
    if (file) {
      if (previewBar) previewBar.hidden = false;
      if (dropzoneContent) dropzoneContent.hidden = true;
      if (previewName) previewName.textContent = file.name;
      if (previewSize) previewSize.textContent = formatBytes(file.size);

      // Auto-suggest title if empty
      if (titleInput && !titleInput.value.trim()) {
        const cleanName = file.name
          .replace(/\.[^/.]+$/, "")
          .replace(/[_-]+/g, " ")
          .trim();
        if (cleanName) {
          titleInput.value = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
        }
      }
    } else {
      if (previewBar) previewBar.hidden = true;
      if (dropzoneContent) dropzoneContent.hidden = false;
    }
  };

  if (dropzone && fileInput) {
    ["dragenter", "dragover"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add("is-dragover");
      });
    });

    ["dragleave", "dragend", "drop"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove("is-dragover");
      });
    });

    dropzone.addEventListener("drop", (e) => {
      if (e.dataTransfer?.files?.length) {
        fileInput.files = e.dataTransfer.files;
        updateFilePreview();
        scheduleDuplicateCheck();
      }
    });
  }

  removeBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    if (fileInput) fileInput.value = "";
    updateFilePreview();
    scheduleDuplicateCheck();
  });

  const scheduleDuplicateCheck = () => {
    window.clearTimeout(setupUploadForm.duplicateTimer);
    setupUploadForm.duplicateTimer = window.setTimeout(checkUploadDuplicate, 450);
  };

  fileInput?.addEventListener("change", () => {
    updateFilePreview();
    scheduleDuplicateCheck();
  });
  titleInput?.addEventListener("input", scheduleDuplicateCheck);
  subjectInput?.addEventListener("input", scheduleDuplicateCheck);

  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!token) {
      showStatus("Log in before uploading files.", "error");
      return;
    }

    const submitButton = uploadForm.querySelector("button[type='submit']");
    if (submitButton) submitButton.disabled = true;

    try {
      const duplicateResult = await checkUploadDuplicate();
      if (duplicateResult?.duplicate) {
        const proceed = confirm("A similar resource already exists. Upload anyway?");
        if (!proceed) return;
      }

      const data = await fetchJson(`${API_BASE}/resources`, {
        method: "POST",
        headers: { Authorization: token },
        body: new FormData(uploadForm)
      });

      uploadForm.reset();
      updateFilePreview();
      await loadResources();
      showStatus(data.message || "File uploaded successfully.", "success");
    } catch (error) {
      showStatus(error.message || "Upload failed.", "error");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}

async function hashBrowserFile(file) {
  if (!file || !window.crypto?.subtle) return "";
  const buffer = await file.arrayBuffer();
  const digest = await window.crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function checkUploadDuplicate() {
  const warning = byId("duplicateWarning");
  const file = byId("resourceFile")?.files?.[0];

  if (!token || !file) {
    if (warning) warning.hidden = true;
    return null;
  }

  try {
    const fileHash = await hashBrowserFile(file);
    const data = await fetchJson(`${API_BASE}/resources/check-duplicate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token
      },
      body: JSON.stringify({
        fileHash,
        originalName: file.name,
        title: byId("resourceTitle")?.value || "",
        subject: byId("resourceSubject")?.value || ""
      })
    });

    state.lastDuplicateCheck = data;
    if (warning) {
      warning.hidden = !data.duplicate;
      warning.textContent = data.duplicate
        ? `Possible duplicate: ${data.matches?.[0]?.resource?.title || "similar resource"} (${Math.round(
            (data.matches?.[0]?.similarity || 0) * 100
          )}% match).`
        : "";
    }

    return data;
  } catch (error) {
    if (warning) {
      warning.hidden = false;
      warning.textContent = "Duplicate check is unavailable right now.";
    }
    return null;
  }
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

async function initResourcePages() {
  const searchInput = byId("searchInput");

  if (searchInput) {
    await loadResourceFilters();
    const initialQuery = getInitialSearchQuery();
    const initialSource = new URLSearchParams(window.location.search).get("source");
    if (initialSource && byId("sourceFilter")) {
      byId("sourceFilter").value = sourceClassFor(initialSource);
    }
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

    // Quick filter chips (Instant 1-click filter)
    document.querySelectorAll(".filter-chip[data-source]").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".filter-chip[data-source]").forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        const sourceSelect = byId("sourceFilter");
        if (sourceSelect) {
          sourceSelect.value = chip.dataset.source || "";
          state.localPagination.page = 1;
          if (byId("results")) {
            searchResource();
          }
        }
      });
    });

    // Toggle Advanced Filters button
    const toggleFiltersBtn = byId("toggleFiltersBtn");
    const advancedFilters = document.querySelector(".advanced-filters");
    if (toggleFiltersBtn && advancedFilters) {
      toggleFiltersBtn.addEventListener("click", () => {
        const isHidden = advancedFilters.hidden;
        advancedFilters.hidden = !isHidden;
        toggleFiltersBtn.classList.toggle("is-active", isHidden);
      });
    }

    // Global keyboard shortcut '/' to focus search
    document.addEventListener("keydown", (event) => {
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        searchInput.focus();
      }
    });

    [
      "subjectFilter",
      "fileTypeFilter",
      "sourceFilter",
      "dateFromFilter",
      "dateToFilter",
      "ratingFilter",
      "sortFilter",
      "pageSize",
      "semanticToggle"
    ].forEach((id) => {
      byId(id)?.addEventListener("change", () => {
        state.localPagination.page = 1;
        if (byId("results") && searchInput.value.trim()) {
          searchResource();
        }
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

  if (byId("localResults") && !byId("results")) {
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

  if (state.dashboardRecommendations.length) {
    renderResourceList(
      list,
      state.dashboardRecommendations.map((resource) => ({
        ...resource,
        source: localSourceFor(resource),
        link: resourceLink(resource)
      })),
      "Save resources to get matching local recommendations.",
      { allowSave: true, openLabel: "Preview" }
    );
    return;
  }

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
    { allowSave: true, openLabel: "Preview" }
  );
}

async function loadDashboardRecommendations() {
  if (!token) return;

  try {
    const data = await fetchJson(`${API_BASE}/ai/recommendations`, {
      headers: { Authorization: token }
    });
    state.dashboardRecommendations = data.recommendations || [];
  } catch (error) {
    state.dashboardRecommendations = [];
  }
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
  await loadDashboardRecommendations();

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

  renderAdminAnalytics(stats);
}

function renderAdminAnalytics(stats) {
  const list = byId("adminAnalyticsList");
  if (!list) return;

  const items = [
    ...(stats.topSearches || []).map((item) => ({
      label: `Search: ${item.query}`,
      value: item.count
    })),
    ...(stats.mostViewed || []).slice(0, 3).map((resource) => ({
      label: `Viewed: ${resource.title}`,
      value: resource.views || 0
    })),
    ...(stats.topFileTypes || []).map((item) => ({
      label: `File type: ${item.type}`,
      value: item.count
    }))
  ].slice(0, 10);

  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = '<li class="empty-state">No analytics yet.</li>';
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "compact-row";
    const label = document.createElement("span");
    label.textContent = item.label;
    const value = document.createElement("strong");
    value.textContent = item.value;
    li.append(label, value);
    list.appendChild(li);
  });
}

function renderAdminUsers() {
  const list = byId("adminUserList");
  if (!list) return;

  list.innerHTML = "";
  if (!state.adminUsers.length) {
    list.innerHTML = '<li class="empty-state">No users found.</li>';
    return;
  }

  state.adminUsers.forEach((user) => {
    const li = document.createElement("li");
    li.className = "compact-row stacked";
    const name = document.createElement("span");
    name.textContent = `${user.name} (${user.email})`;

    const select = document.createElement("select");
    select.className = "compact-select";
    ["student", "teacher", "admin"].forEach((role) => {
      const option = document.createElement("option");
      option.value = role;
      option.textContent = role;
      select.appendChild(option);
    });
    select.value = user.role || "student";
    select.addEventListener("change", () => updateUserRole(user.id, select.value));

    li.append(name, select);
    list.appendChild(li);
  });
}

async function updateUserRole(userId, role) {
  try {
    await fetchJson(`${API_BASE}/admin/users/${userId}/role`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: token
      },
      body: JSON.stringify({ role })
    });
    showStatus("User role updated.", "success");
    await loadAdminUsers();
  } catch (error) {
    showStatus(error.message || "Role update failed.", "error");
  }
}

async function loadAdminUsers() {
  if (!byId("adminUserList") || !token) return;

  try {
    state.adminUsers = await fetchJson(`${API_BASE}/admin/users`, {
      headers: { Authorization: token }
    });
  } catch (error) {
    state.adminUsers = [];
  }

  renderAdminUsers();
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
    await loadAdminUsers();
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

function renderViewerReviews(resource) {
  const list = byId("reviewList");
  if (!list) return;

  const reviews = resource.reviews || [];
  list.innerHTML = "";

  if (!reviews.length) {
    list.innerHTML = '<li class="empty-state">No reviews yet.</li>';
    return;
  }

  reviews.forEach((review) => {
    const li = document.createElement("li");
    li.className = "compact-row stacked";
    const title = document.createElement("strong");
    title.textContent = `${review.rating} stars by ${review.userName || "Student"}`;
    const comment = document.createElement("span");
    comment.className = "muted-line";
    comment.textContent = review.comment || "No comment";
    li.append(title, comment);
    list.appendChild(li);
  });
}

async function loadViewerResource() {
  const frame = byId("viewerFrame");
  if (!frame) return null;

  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) {
    showStatus("Missing resource id.", "error");
    return null;
  }

  try {
    const resource = await fetchJson(`${API_BASE}/resources/${encodeURIComponent(id)}?view=true`);
    const link = resourceLink(resource);
    const isPdf = String(resource.mimeType || "").includes("pdf") || String(resource.filePath || "").toLowerCase().endsWith(".pdf");

    setText("viewerTitle", resource.title || "Resource");
    setText(
      "viewerMeta",
      `${resource.subject || "General"} | ${resource.fileCategory || "File"} | ${formatBytes(
        resource.fileSize
      )} | ${resource.pageCount || "Unknown"} pages | ${ratingLabel(resource)} | ${
        resource.views || 0
      } views`
    );
    setText("viewerSummary", resource.summary || "No extracted summary is available yet.");

    const download = byId("viewerDownload");
    if (download) download.href = resourceDownloadLink(resource);
    const openFile = byId("viewerOpenFile");
    if (openFile) openFile.href = link;

    if (isPdf && link !== "#") {
      frame.src = link;
      byId("viewerFrameWrap").hidden = false;
      byId("viewerFallback").hidden = true;
    } else {
      byId("viewerFrameWrap").hidden = true;
      byId("viewerFallback").hidden = false;
    }

    renderViewerReviews(resource);
    return resource;
  } catch (error) {
    showStatus(error.message || "Unable to load resource.", "error");
    return null;
  }
}

function initViewer() {
  if (!byId("viewerFrame")) return;

  let currentResource = null;
  loadViewerResource().then((resource) => {
    currentResource = resource;
  });

  byId("reviewForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!token) {
      showStatus("Log in to review resources.", "error");
      return;
    }

    const id = new URLSearchParams(window.location.search).get("id");
    try {
      const data = await fetchJson(`${API_BASE}/resources/${encodeURIComponent(id)}/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token
        },
        body: JSON.stringify({
          rating: byId("reviewRating").value,
          comment: byId("reviewComment").value
        })
      });
      currentResource = data.resource;
      renderViewerReviews(currentResource);
      showStatus("Review saved.", "success");
    } catch (error) {
      showStatus(error.message || "Review failed.", "error");
    }
  });

  byId("askResourceForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!token) {
      showStatus("Log in to ask questions about notes.", "error");
      return;
    }

    const id = new URLSearchParams(window.location.search).get("id");
    const answerTarget = byId("resourceAnswer");
    answerTarget.textContent = "Thinking...";

    try {
      const data = await fetchJson(`${API_BASE}/resources/${encodeURIComponent(id)}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token
        },
        body: JSON.stringify({ question: byId("resourceQuestion").value })
      });
      answerTarget.textContent = data.answer || "No clear answer found.";
      answerTarget.className = "status-message success";
    } catch (error) {
      answerTarget.textContent = error.message || "Question answering failed.";
      answerTarget.className = "status-message error";
    }
  });
}

function renderProfileHistory() {
  const list = byId("profileHistory");
  if (!list) return;

  const history = getSearchHistory();
  list.innerHTML = "";

  if (!history.length) {
    list.innerHTML = '<li class="empty-state">No search history yet.</li>';
    return;
  }

  history.forEach((query) => {
    const li = document.createElement("li");
    li.className = "compact-row";
    const link = document.createElement("a");
    link.href = `results.html?q=${encodeURIComponent(query)}`;
    link.textContent = query;
    li.appendChild(link);
    list.appendChild(li);
  });
}

function initProfile() {
  const form = byId("profileForm");
  if (!form) return;

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  const hydrate = () => {
    if (!state.currentUser) return;
    byId("profileName").value = state.currentUser.name || "";
    byId("profileEmail").value = state.currentUser.email || "";
    byId("profileRole").value = state.currentUser.role || "student";
    renderProfileHistory();
  };

  hydrate();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = await fetchJson(`${API_BASE}/user/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: token
        },
        body: JSON.stringify({ name: byId("profileName").value })
      });
      state.currentUser = data;
      hydrate();
      showStatus("Profile saved.", "success");
    } catch (error) {
      showStatus(error.message || "Profile update failed.", "error");
    }
  });
}

function getSunSvg() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
}

function getMoonSvg() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
}

function initTheme() {
  const savedTheme = localStorage.getItem("theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = savedTheme;

  document.querySelectorAll(".nav-links").forEach((nav) => {
    if (nav.querySelector("[data-theme-toggle]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle-btn";
    button.dataset.themeToggle = "true";
    button.setAttribute("aria-label", "Toggle color theme");
    button.title = savedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    button.innerHTML = savedTheme === "dark" ? getSunSvg() : getMoonSvg();
    button.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("theme", next);
      button.innerHTML = next === "dark" ? getSunSvg() : getMoonSvg();
      button.title = next === "dark" ? "Switch to light mode" : "Switch to dark mode";
    });
    nav.appendChild(button);
  });
}

function initNavEnhancements() {
  document.querySelectorAll(".nav-links").forEach((nav) => {
    if (token && !nav.querySelector("a[href='profile.html']")) {
      const link = document.createElement("a");
      link.href = "profile.html";
      link.textContent = "Profile";
      nav.insertBefore(link, nav.querySelector("[data-auth-action='logout']") || null);
    }
  });
}

function initAuthControls() {
  initNavEnhancements();
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
  initTheme();
  initAuthControls();
  await loadUserStateFromDatabase();
  initNavEnhancements();
  renderAuthControls();
  await initResourcePages();
  initDashboard();
  initAdmin();
  initViewer();
  initProfile();
});
