import { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error("[Error]", err.message);

  if (process.env.NODE_ENV !== "production") {
    console.error(err.stack);
  }

  res.status(500).json({
    ok: false,
    error: "Internal server error",
  });
}
