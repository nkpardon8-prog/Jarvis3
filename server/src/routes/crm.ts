import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { prisma } from "../services/prisma";

const router = Router();

router.use(authMiddleware);

// Get CRM status & settings
router.get("/status", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    let settings = await prisma.crmSettings.findUnique({ where: { userId } });
    const connected = !!(settings?.spreadsheetId);

    res.json({
      ok: true,
      data: {
        connected,
        settings: settings || { spreadsheetId: null },
        message: connected
          ? "CRM connected to Google Sheets."
          : "Connect a Google Spreadsheet to enable CRM features.",
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update CRM settings
router.put("/settings", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { spreadsheetId, apolloApiKey } = req.body;

    const settings = await prisma.crmSettings.upsert({
      where: { userId },
      update: {
        ...(spreadsheetId !== undefined ? { spreadsheetId } : {}),
        ...(apolloApiKey !== undefined ? { apolloApiKey } : {}),
      },
      create: {
        userId,
        spreadsheetId: spreadsheetId || null,
        apolloApiKey: apolloApiKey || null,
      },
    });

    res.json({ ok: true, data: settings });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
