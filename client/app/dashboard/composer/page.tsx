"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ComposerRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/documents");
  }, [router]);

  return null;
}
