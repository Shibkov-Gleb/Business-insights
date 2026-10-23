import { app, finishRoutes } from "./app.ts";
finishRoutes();
const server = app.listen(4000, "0.0.0.0", () =>
  console.log("API http://localhost:4000"),
);
process.on("SIGTERM", () => server.close(() => process.exit(0)));
