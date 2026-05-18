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

  function cleanOrigin(value) {
    return String(value || "").trim().replace(/\\/+$/, "");
  }

  window.resourceFinderApiOrigin = function () {
    return cleanOrigin(window.RESOURCE_FINDER_API_ORIGIN);
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
    "FRONTEND_API_ORIGIN is empty. The Vercel frontend will call APIs on its own domain."
  );
}

console.log(`Built Vercel static site in ${path.relative(projectRoot, outputDir)}`);
