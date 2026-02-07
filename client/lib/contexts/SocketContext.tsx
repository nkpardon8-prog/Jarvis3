"use client";

import {
  createContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
  useRef,
} from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@/lib/hooks/useAuth";

export interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
}

export const SocketContext = createContext<SocketContextType>({
  socket: null,
  connected: false,
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const getToken = useCallback(async (): Promise<string | null> => {
    // Token is in httpOnly cookie, but Socket.io needs it in handshake
    // We'll fetch it from the /api/auth/token endpoint
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        // Extract the cookie value - we need to pass it through a different mechanism
        // Since cookies are httpOnly, we'll use a token endpoint
        const tokenRes = await fetch("/api/auth/socket-token", { credentials: "include" });
        if (tokenRes.ok) {
          const data = await tokenRes.json();
          return data.data?.token || null;
        }
      }
    } catch {
      // Ignore
    }
    return null;
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      // Disconnect if not authenticated
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setConnected(false);
      }
      return;
    }

    // Connect Socket.io
    const connectSocket = async () => {
      const token = await getToken();
      if (!token) {
        console.warn("[Socket] Could not get auth token for socket connection");
        return;
      }

      const newSocket = io("http://localhost:3001", {
        auth: { token },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
      });

      newSocket.on("connect", () => {
        console.log("[Socket] Connected");
        setConnected(true);
      });

      newSocket.on("disconnect", (reason) => {
        console.log("[Socket] Disconnected:", reason);
        setConnected(false);
      });

      newSocket.on("connect_error", (err) => {
        console.warn("[Socket] Connection error:", err.message);
        setConnected(false);
      });

      socketRef.current = newSocket;
      setSocket(newSocket);
    };

    connectSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setConnected(false);
      }
    };
  }, [isAuthenticated, getToken]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}
