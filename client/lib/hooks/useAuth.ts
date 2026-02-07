"use client";

import { useContext } from "react";
import { AuthContext, AuthContextType } from "@/lib/contexts/AuthContext";

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}
