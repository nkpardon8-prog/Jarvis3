"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function EmailRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/composer");
  }, [router]);

  return null;
}
