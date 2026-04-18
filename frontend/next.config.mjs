/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
    NEXT_PUBLIC_WS_URL:
      process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000",
    NEXT_PUBLIC_WALLET_NETWORK:
      process.env.NEXT_PUBLIC_WALLET_NETWORK ?? "testnet",
  },
};

export default nextConfig;
