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
  const connectingRef = useRef(false);

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

    // Guard against duplicate connection attempts
    if (connectingRef.current || socketRef.current) return;
    connectingRef.current = true;

    // Connect Socket.io
    const connectSocket = async () => {
      try {
        const tokenRes = await fetch("/api/auth/socket-token", {
          credentials: "include",
        });
        if (!tokenRes.ok) {
          console.warn("[Socket] Could not get auth token for socket connection");
          connectingRef.current = false;
          return;
        }
        const data = await tokenRes.json();
        const token = data.data?.token;
        if (!token) {
          console.warn("[Socket] Empty token from socket-token endpoint");
          connectingRef.current = false;
          return;
        }

        const newSocket = io("http://localhost:3001", {
          auth: { token },
          transports: ["websocket"],
          reconnection: true,
          reconnectionDelay: 2000,
          reconnectionDelayMax: 15000,
          reconnectionAttempts: 10,
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
      } catch {
        console.warn("[Socket] Failed to fetch token");
      } finally {
        connectingRef.current = false;
      }
    };

    connectSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setConnected(false);
      }
      connectingRef.current = false;
    };
  }, [isAuthenticated]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}
