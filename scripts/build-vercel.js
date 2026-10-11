const fs = require("fs");
const path = require("path");

const projectRoot = path.join(__dirname, "..");
const sourceDir = path.join(projectRoot, "public");
const outputDir = path.join(projectRoot, "dist");

function cleanOrigin(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function clientConfig(apiOrigin) {
  return `(function () {
  window.RESOURCE_FINDER_API_ORIGIN = ${JSON.stringify(apiOrigin)};
  const DEFAULT_REMOTE_API_ORIGIN = "https://student-resource-finder-api.onrender.com";

  function cleanOrigin(value) {
    return String(value || "").trim().replace(/\\/+$/, "");
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
    return \`\${window.resourceFinderApiOrigin()}/api\`;
  };

  window.resourceFinderUploadBase = function () {
    return \`\${window.resourceFinderApiOrigin()}/uploads\`;
  };
})();
`;
}

const apiOrigin = cleanOrigin(
  process.env.FRONTEND_API_ORIGIN || process.env.API_ORIGIN || ""
);

fs.rmSync(outputDir, { recursive: true, force: true });
fs.cpSync(sourceDir, outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "config.js"), clientConfig(apiOrigin));

if (!apiOrigin) {
  console.warn(
    "FRONTEND_API_ORIGIN is empty. Non-local static hosts will use the default Render backend origin."
  );
}

console.log(`Built Vercel static site in ${path.relative(projectRoot, outputDir)}`);
