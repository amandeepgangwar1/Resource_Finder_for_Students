(function () {
  window.RESOURCE_FINDER_API_ORIGIN = window.RESOURCE_FINDER_API_ORIGIN || "";

  function cleanOrigin(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  window.resourceFinderApiOrigin = function () {
    return cleanOrigin(window.RESOURCE_FINDER_API_ORIGIN);
  };

  window.resourceFinderApiBase = function () {
    return `${window.resourceFinderApiOrigin()}/api`;
  };

  window.resourceFinderUploadBase = function () {
    return `${window.resourceFinderApiOrigin()}/uploads`;
  };
})();
