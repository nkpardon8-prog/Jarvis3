import { Socket } from "socket.io";
import { verifyJWT } from "../services/auth.service";

export function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error("Authentication required"));
  }

  const payload = verifyJWT(token);
  if (!payload) {
    return next(new Error("Invalid or expired token"));
  }

  socket.data.user = payload;
  next();
}
