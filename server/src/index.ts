import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { config } from "./config";
import { errorHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth";
import healthRoutes from "./routes/health";
import chatRoutes from "./routes/chat";
import dashboardRoutes from "./routes/dashboard";
import connectionsRoutes from "./routes/connections";
import skillsRoutes from "./routes/skills";
import todosRoutes from "./routes/todos";
import calendarRoutes from "./routes/calendar";
import emailRoutes from "./routes/email";
import crmRoutes from "./routes/crm";
import oauthRoutes from "./routes/oauth";
import gatewayRoutes from "./routes/gateway";
import { gateway } from "./gateway/connection";
import { setupSocketIO } from "./socket";

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/connections", connectionsRoutes);
app.use("/api/skills", skillsRoutes);
app.use("/api/todos", todosRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/crm", crmRoutes);
app.use("/api/oauth", oauthRoutes);
app.use("/api/gateway", gatewayRoutes);

// Error handler (must be last)
app.use(errorHandler);

// Setup Socket.io (must be done before listen)
const io = setupSocketIO(httpServer, gateway);

// Start server
httpServer.listen(config.port, async () => {
  console.log(`[Jarvis] Server running on http://localhost:${config.port}`);

  // Connect to OpenClaw Gateway
  try {
    await gateway.connect();
    console.log("[Jarvis] Gateway connection established");
  } catch (err: any) {
    console.error("[Jarvis] Failed to connect to Gateway:", err.message);
    console.log("[Jarvis] Will retry connecting in the background...");
  }

  gateway.on("disconnected", () => {
    console.log("[Jarvis] Gateway disconnected — will auto-reconnect");
  });

  gateway.on("connected", () => {
    console.log("[Jarvis] Gateway reconnected");
  });
});

export { app, httpServer, gateway, io };
