import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { config } from "../config";
import { socketAuthMiddleware } from "./auth";
import { registerChatHandlers } from "./chat";
import { OpenClawGateway } from "../gateway/connection";

export function setupSocketIO(httpServer: HttpServer, gateway: OpenClawGateway): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin,
      credentials: true,
    },
  });

  // Auth middleware for all connections
  io.use(socketAuthMiddleware);

  // Register chat event handlers
  registerChatHandlers(io, gateway);

  console.log("[Socket] Socket.io server initialized");
  return io;
}
