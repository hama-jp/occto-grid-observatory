import type { NextConfig } from "next";

const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true" && repoName.length > 0;
const basePath = isGitHubPagesBuild ? `/${repoName}` : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
};

export default nextConfig;
