import { Router, Response } from "express";
import { google } from "googleapis";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { getGoogleApiClient } from "../services/oauth.service";

const router = Router();

router.use(authMiddleware);

// ─── List recent Drive files ─────────────────────────────

router.get("/files", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const maxResults = Math.min(parseInt(String(req.query.max || "20"), 10), 50);
    const nameFilter = req.query.q ? String(req.query.q) : undefined;
    const pageToken = req.query.pageToken ? String(req.query.pageToken) : undefined;

    const auth = await getGoogleApiClient(userId);
    if (!auth) {
      res.json({ ok: true, data: { connected: false, message: "Connect Google on the Connections page to access Drive.", files: [] } });
      return;
    }

    const drive = google.drive({ version: "v3", auth });

    let q = "trashed = false";
    if (nameFilter) {
      q += ` and name contains '${nameFilter.replace(/'/g, "\\'")}'`;
    }

    const response = await drive.files.list({
      q,
      pageSize: maxResults,
      pageToken,
      orderBy: "modifiedTime desc",
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink, size, owners)",
    });

    const files = (response.data.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink,
      size: f.size ? parseInt(f.size, 10) : null,
      owner: f.owners?.[0]?.displayName || f.owners?.[0]?.emailAddress || null,
    }));

    res.json({
      ok: true,
      data: {
        connected: true,
        files,
        nextPageToken: response.data.nextPageToken || null,
      },
    });
  } catch (err: any) {
    console.error("[Drive] List files error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Full-text search across Drive ───────────────────────

router.get("/search", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const query = req.query.q ? String(req.query.q) : "";

    if (!query) {
      res.status(400).json({ ok: false, error: "Query parameter 'q' is required" });
      return;
    }

    const auth = await getGoogleApiClient(userId);
    if (!auth) {
      res.json({ ok: true, data: { connected: false, message: "Connect Google on the Connections page to search Drive.", files: [] } });
      return;
    }

    const drive = google.drive({ version: "v3", auth });

    const response = await drive.files.list({
      q: `fullText contains '${query.replace(/'/g, "\\'")}' and trashed = false`,
      pageSize: 20,
      orderBy: "modifiedTime desc",
      fields: "files(id, name, mimeType, modifiedTime, webViewLink, size)",
    });

    const files = (response.data.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink,
      size: f.size ? parseInt(f.size, 10) : null,
    }));

    res.json({ ok: true, data: { connected: true, files } });
  } catch (err: any) {
    console.error("[Drive] Search error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Read a Google Doc ───────────────────────────────────

router.get("/docs/:docId", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { docId } = req.params;

    const auth = await getGoogleApiClient(userId);
    if (!auth) {
      res.json({ ok: true, data: { connected: false, message: "Connect Google on the Connections page to read Docs." } });
      return;
    }

    const docs = google.docs({ version: "v1", auth });

    const docResponse = await docs.documents.get({ documentId: String(docId) });
    const docData = docResponse.data;

    // Extract plain text from document body
    const body = docData.body?.content || [];
    let textContent = "";
    for (const element of body) {
      if (element.paragraph) {
        for (const pe of element.paragraph.elements || []) {
          if (pe.textRun?.content) {
            textContent += pe.textRun.content;
          }
        }
      }
    }

    res.json({
      ok: true,
      data: {
        connected: true,
        doc: {
          title: docData.title || "(Untitled)",
          body: textContent,
          revisionId: docData.revisionId || null,
          documentId: docData.documentId,
        },
      },
    });
  } catch (err: any) {
    console.error("[Drive] Read doc error:", err.message);
    if (err.code === 404) {
      res.status(404).json({ ok: false, error: "Document not found" });
    } else {
      res.status(500).json({ ok: false, error: err.message });
    }
  }
});

export default router;
