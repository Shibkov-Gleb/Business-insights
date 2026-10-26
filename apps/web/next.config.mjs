export default {
  devIndicators: process.env.BANK_UI_PREVIEW === "1" ? false : undefined,
  transpilePackages: ["@context/ui", "@context/contracts"],
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.INTERNAL_API_URL || "http://localhost:4000"}/api/v1/:path*`,
      },
    ];
  },
};
