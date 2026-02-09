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
import integrationsRoutes from "./routes/integrations";
import driveRoutes from "./routes/drive";
import composerRoutes from "./routes/composer";
import automationRoutes from "./routes/automation";
import { gateway } from "./gateway/connection";
import { setupSocketIO } from "./socket";
import multer from "multer";

const composerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "text/plain",
      "text/csv",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/png",
      "image/jpeg",
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

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
app.use("/api/integrations", integrationsRoutes);
app.use("/api/drive", driveRoutes);

app.use("/api/automation", automationRoutes);

// Composer routes — apply multer for file upload endpoints
app.use("/api/composer/upload", composerUpload.single("file"));
app.use("/api/composer/invoices/upload", composerUpload.single("file"));
app.use("/api/composer/pdf/analyze", composerUpload.single("file"));
app.use("/api/composer", composerRoutes);

// Error handler (must be last)
app.use(errorHandler);

// Setup Socket.io (must be done before listen)
const io = setupSocketIO(httpServer, gateway);

// Startup validation
if (!config.oauthEncryptionKey) {
  if (process.env.NODE_ENV === "production") {
    console.error("[Jarvis] FATAL: OAUTH_CREDENTIALS_ENCRYPTION_KEY is required in production. Exiting.");
    process.exit(1);
  } else {
    console.warn("[Jarvis] WARNING: OAUTH_CREDENTIALS_ENCRYPTION_KEY not set — using dev fallback from JWT_SECRET");
  }
}
if (!config.oauthBaseUrl) {
  if (process.env.NODE_ENV === "production") {
    console.warn("[Jarvis] WARNING: OAUTH_BASE_URL not set — OAuth callbacks may not work in production");
  }
}
if (config.googleClientId) {
  console.warn("[Jarvis] DEPRECATED: GOOGLE_CLIENT_ID env var detected. Migrate to per-user OAuth credentials via the Connections UI.");
}
if (config.microsoftClientId) {
  console.warn("[Jarvis] DEPRECATED: MICROSOFT_CLIENT_ID env var detected. Migrate to per-user OAuth credentials via the Connections UI.");
}

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

  gateway.on("connected", async () => {
    console.log("[Jarvis] Gateway reconnected");
  });
});

export { app, httpServer, gateway, io };
