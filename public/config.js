(function () {
  window.RESOURCE_FINDER_API_ORIGIN = window.RESOURCE_FINDER_API_ORIGIN || "";
  const DEFAULT_REMOTE_API_ORIGIN = "https://student-resource-finder-api.onrender.com";

  function cleanOrigin(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function isLocalHost(hostname) {
    return ["localhost", "127.0.0.1", "::1", ""].includes(hostname);
  }

  window.resourceFinderApiOrigin = function () {
    const configuredOrigin = cleanOrigin(window.RESOURCE_FINDER_API_ORIGIN);
    if (configuredOrigin) return configuredOrigin;

    if (
      typeof window !== "undefined" &&
      !isLocalHost(window.location.hostname) &&
      !window.location.hostname.endsWith("onrender.com")
    ) {
      return DEFAULT_REMOTE_API_ORIGIN;
    }

    return "";
  };

  window.resourceFinderApiBase = function () {
    return `${window.resourceFinderApiOrigin()}/api`;
  };

  window.resourceFinderUploadBase = function () {
    return `${window.resourceFinderApiOrigin()}/uploads`;
  };
})();
