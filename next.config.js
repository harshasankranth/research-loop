/** @type {import('next').NextConfig} */
const nextConfig = {
  // postgres-js opens raw TCP sockets; keep it out of the server bundle.
  serverExternalPackages: ["postgres"],
};

module.exports = nextConfig;
