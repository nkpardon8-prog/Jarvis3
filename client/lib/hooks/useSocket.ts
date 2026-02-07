"use client";

import { useContext } from "react";
import { SocketContext, SocketContextType } from "@/lib/contexts/SocketContext";

export function useSocket(): SocketContextType {
  return useContext(SocketContext);
}
