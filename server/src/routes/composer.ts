import { Router, Response } from "express";
import { randomUUID } from "crypto";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { prisma } from "../services/prisma";
import { gateway } from "../gateway/connection";

// pdf-parse v1 is CJS-only
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buffer: Buffer) => Promise<{ text: string; numpages: number }> = require("pdf-parse");

const router = Router();

router.use(authMiddleware);

// ─── System tag definitions ─────────────────────────────────
const SYSTEM_TAGS = [
  { name: "Sales", color: "#f0a500", sortingIntent: "sales-leads", autoDraft: true },
  { name: "Clients", color: "#00d4ff", sortingIntent: "client-requests", autoDraft: true },
  { name: "Finance", color: "#00ff88", sortingIntent: "invoices-payments", autoDraft: false },
  { name: "Operations", color: "#8b5cf6", sortingIntent: "ops-internal", autoDraft: false },
  { name: "Legal/Admin", color: "#ef4444", sortingIntent: "legal-compliance", autoDraft: false },
  { name: "Personal", color: "#6b7280", sortingIntent: "personal", autoDraft: false },
  { name: "Miscellaneous", color: "#94a3b8", sortingIntent: "misc-other", autoDraft: false },
];

// ─── Helper: agentExec ──────────────────────────────────────
async function agentExec(prompt: string, timeoutMs = 60000) {
  const defaults = gateway.sessionDefaults;
  const sessionKey = `agent:${defaults?.defaultAgentId || "main"}:${defaults?.mainKey || "main"}`;
  return gateway.send(
    "chat.send",
    {
      sessionKey,
      message: prompt,
      deliver: "full",
      thinking: "low",
      idempotencyKey: `composer-${Date.now()}-${randomUUID().slice(0, 8)}`,
    },
    timeoutMs
  );
}

// ─── Seed system tags ───────────────────────────────────────
router.post("/seed-tags", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const existing = await prisma.emailTag.findMany({
      where: { userId, isSystem: true },
    });

    if (existing.length >= SYSTEM_TAGS.length) {
      res.json({ ok: true, data: { seeded: false, count: existing.length } });
      return;
    }

    const existingNames = new Set(existing.map((t) => t.name));
    const toCreate = SYSTEM_TAGS.filter((t) => !existingNames.has(t.name));

    for (const tag of toCreate) {
      await prisma.emailTag.create({
        data: {
          userId,
          name: tag.name,
          color: tag.color,
          sortingIntent: tag.sortingIntent,
          autoDraft: tag.autoDraft,
          isSystem: true,
          description: `System category: ${tag.name.toLowerCase()}`,
          criteria: `Emails related to ${tag.sortingIntent.replace(/-/g, " ")}`,
        },
      });
    }

    res.json({ ok: true, data: { seeded: true, count: toCreate.length } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Draft Reply endpoints ──────────────────────────────────

// List drafts
router.get("/drafts", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || "20"), 10)));
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (status) where.status = status;

    const [drafts, total] = await Promise.all([
      prisma.draftReply.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.draftReply.count({ where }),
    ]);

    res.json({
      ok: true,
      data: { drafts, total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Generate a draft reply
router.post("/drafts/generate", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { emailId, emailSubject, emailFrom, emailSnippet, provider, tagId, tone } = req.body;

    if (!emailId || !emailSubject || !emailFrom || !provider) {
      res.status(400).json({ ok: false, error: "emailId, emailSubject, emailFrom, and provider are required" });
      return;
    }

    // Check for existing draft
    const existing = await prisma.draftReply.findUnique({
      where: { userId_emailId: { userId, emailId } },
    });
    if (existing) {
      res.json({ ok: true, data: existing });
      return;
    }

    // Get user's draft settings
    const settings = await prisma.emailSettings.findUnique({ where: { userId } });
    const draftTone = tone || settings?.draftTone || "professional";
    const signature = settings?.signature || "";
    const draftRules = settings?.draftRules || "";

    const prompt = `Draft a ${draftTone} reply to this email.
From: ${emailFrom}
Subject: ${emailSubject}
Body: ${emailSnippet || "(no preview available)"}
${signature ? `\nSign with: ${signature}` : ""}
${draftRules ? `\nRules: ${draftRules}` : ""}

Reply only with the draft email text, no explanation.`;

    const result = (await agentExec(prompt, 30000)) as any;

    // Extract text from the AI response
    const draftBody =
      result?.text || result?.content || result?.message?.text || result?.message?.content || String(result || "");

    const draft = await prisma.draftReply.create({
      data: {
        userId,
        emailId,
        emailSubject,
        emailFrom,
        emailSnippet: emailSnippet || null,
        tagId: tagId || null,
        draftBody,
        tone: draftTone,
        status: "pending",
        provider,
      },
    });

    res.json({ ok: true, data: draft });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update a draft
router.patch("/drafts/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);
    const { draftBody, status, tone } = req.body;

    const existing = await prisma.draftReply.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Draft not found" });
      return;
    }

    const draft = await prisma.draftReply.update({
      where: { id },
      data: {
        ...(draftBody !== undefined ? { draftBody } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(tone !== undefined ? { tone } : {}),
      },
    });

    res.json({ ok: true, data: draft });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete a draft
router.delete("/drafts/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);

    const existing = await prisma.draftReply.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Draft not found" });
      return;
    }

    await prisma.draftReply.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── AI Compose Assist ──────────────────────────────────────

router.post("/compose/assist", async (req: AuthRequest, res: Response) => {
  try {
    const { text, instruction, context } = req.body;

    if (!text || !instruction) {
      res.status(400).json({ ok: false, error: "text and instruction are required" });
      return;
    }

    const prompt = `${instruction}

Text:
${text}
${context ? `\nContext: ${context}` : ""}

Return only the improved text.`;

    const result = (await agentExec(prompt, 30000)) as any;
    const improved =
      result?.text || result?.content || result?.message?.text || result?.message?.content || String(result || "");

    res.json({ ok: true, data: { improved } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── File Upload ────────────────────────────────────────────

router.post("/upload", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    // multer middleware is applied in index.ts — file is on req.file
    const file = (req as any).file;
    if (!file) {
      res.status(400).json({ ok: false, error: "No file uploaded" });
      return;
    }

    const content = file.buffer.toString("base64");
    const purpose = String(req.body.purpose || "compose-attachment");

    let textContent: string | null = null;

    // Extract text from PDFs
    if (file.mimetype === "application/pdf") {
      try {
        const parsed = await pdfParse(file.buffer);
        textContent = parsed.text;
      } catch (err: any) {
        console.error("[Composer] PDF parse error:", err.message);
      }
    }

    // Extract text from plain text files
    if (file.mimetype === "text/plain" || file.mimetype === "text/csv") {
      textContent = file.buffer.toString("utf-8");
    }

    const uploaded = await prisma.uploadedFile.create({
      data: {
        userId,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        content,
        textContent,
        purpose,
      },
    });

    res.json({
      ok: true,
      data: {
        id: uploaded.id,
        filename: uploaded.filename,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        textContent: uploaded.textContent,
        purpose: uploaded.purpose,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete uploaded file
router.delete("/files/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);

    const existing = await prisma.uploadedFile.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "File not found" });
      return;
    }

    await prisma.uploadedFile.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Invoice endpoints ──────────────────────────────────────

// List invoices
router.get("/invoices", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || "20"), 10)));
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (status) where.status = status;

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.invoice.count({ where }),
    ]);

    res.json({
      ok: true,
      data: { invoices, total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Upload and analyze invoice
router.post("/invoices/upload", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const file = (req as any).file;

    if (!file) {
      res.status(400).json({ ok: false, error: "No file uploaded" });
      return;
    }

    // Store the uploaded file
    const content = file.buffer.toString("base64");
    let textContent: string | null = null;

    if (file.mimetype === "application/pdf") {
      try {
        const parsed = await pdfParse(file.buffer);
        textContent = parsed.text;
      } catch (err: any) {
        console.error("[Composer] Invoice PDF parse error:", err.message);
      }
    } else if (file.mimetype === "text/plain" || file.mimetype === "text/csv") {
      textContent = file.buffer.toString("utf-8");
    }

    const uploaded = await prisma.uploadedFile.create({
      data: {
        userId,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        content,
        textContent,
        purpose: "invoice",
      },
    });

    if (!textContent) {
      // Still create invoice record but without AI extraction
      const invoice = await prisma.invoice.create({
        data: {
          userId,
          source: "upload",
          sourceId: uploaded.id,
          rawText: null,
          summary: "Could not extract text from this file.",
          status: "pending",
        },
      });
      res.json({ ok: true, data: invoice });
      return;
    }

    // AI extraction
    const extractionPrompt = `Extract structured invoice data from this text. Return ONLY valid JSON with these fields:
{ "vendor": string|null, "invoiceNumber": string|null, "amount": number|null, "currency": string|null, "dueDate": string|null, "lineItems": [{ "description": string, "quantity": number, "unitPrice": number, "total": number }], "summary": string }
If a field cannot be determined, use null. For lineItems, return an empty array if none found.

Invoice text:
${textContent.slice(0, 8000)}`;

    let extracted: any = {};
    try {
      const result = (await agentExec(extractionPrompt, 30000)) as any;
      const responseText =
        result?.text || result?.content || result?.message?.text || result?.message?.content || String(result || "");

      // Try to parse JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      }
    } catch (err: any) {
      console.error("[Composer] Invoice AI extraction error:", err.message);
    }

    const invoice = await prisma.invoice.create({
      data: {
        userId,
        source: "upload",
        sourceId: uploaded.id,
        vendor: extracted.vendor || null,
        invoiceNumber: extracted.invoiceNumber || null,
        amount: extracted.amount || null,
        currency: extracted.currency || "USD",
        dueDate: extracted.dueDate || null,
        status: "pending",
        lineItems: extracted.lineItems ? JSON.stringify(extracted.lineItems) : null,
        rawText: textContent.slice(0, 50000),
        summary: extracted.summary || null,
      },
    });

    res.json({ ok: true, data: invoice });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update invoice
router.patch("/invoices/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);
    const { vendor, invoiceNumber, amount, currency, dueDate, status, summary } = req.body;

    const existing = await prisma.invoice.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Invoice not found" });
      return;
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        ...(vendor !== undefined ? { vendor } : {}),
        ...(invoiceNumber !== undefined ? { invoiceNumber } : {}),
        ...(amount !== undefined ? { amount } : {}),
        ...(currency !== undefined ? { currency } : {}),
        ...(dueDate !== undefined ? { dueDate } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(summary !== undefined ? { summary } : {}),
      },
    });

    res.json({ ok: true, data: invoice });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete invoice
router.delete("/invoices/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);

    const existing = await prisma.invoice.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Invoice not found" });
      return;
    }

    await prisma.invoice.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PDF Analyzer ───────────────────────────────────────────

// Analyze PDF — upload + initial question
router.post("/pdf/analyze", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const file = (req as any).file;
    const question = String(req.body.question || "Summarize this document.");

    if (!file) {
      res.status(400).json({ ok: false, error: "No file uploaded" });
      return;
    }

    // Store file
    const content = file.buffer.toString("base64");
    let textContent: string | null = null;

    if (file.mimetype === "application/pdf") {
      try {
        const parsed = await pdfParse(file.buffer);
        textContent = parsed.text;
      } catch (err: any) {
        console.error("[Composer] PDF parse error:", err.message);
      }
    } else if (file.mimetype === "text/plain" || file.mimetype === "text/csv") {
      textContent = file.buffer.toString("utf-8");
    }

    if (!textContent) {
      res.status(400).json({ ok: false, error: "Could not extract text from this file" });
      return;
    }

    const uploaded = await prisma.uploadedFile.create({
      data: {
        userId,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        content,
        textContent,
        purpose: "pdf-analyze",
      },
    });

    // Ask AI the initial question
    const prompt = `Based on the following document content, answer this question: ${question}

Document (${file.originalname}):
${textContent.slice(0, 12000)}

Answer concisely and accurately based only on the document content.`;

    const result = (await agentExec(prompt, 30000)) as any;
    const answer =
      result?.text || result?.content || result?.message?.text || result?.message?.content || String(result || "");

    const now = new Date().toISOString();
    const messages = [
      { role: "user", content: question, timestamp: now },
      { role: "assistant", content: answer, timestamp: now },
    ];

    const session = await prisma.pdfSession.create({
      data: {
        userId,
        fileId: uploaded.id,
        fileName: file.originalname,
        messages: JSON.stringify(messages),
      },
    });

    res.json({ ok: true, data: { session: { ...session, messages }, answer } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// List PDF sessions
router.get("/pdf/sessions", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const sessions = await prisma.pdfSession.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        fileName: true,
        createdAt: true,
        updatedAt: true,
        messages: true,
      },
    });

    // Parse messages to get count
    const data = sessions.map((s) => {
      let msgCount = 0;
      try {
        msgCount = JSON.parse(s.messages).length;
      } catch {}
      return { ...s, messageCount: msgCount, messages: undefined };
    });

    res.json({ ok: true, data });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Ask follow-up question in PDF session
router.post("/pdf/sessions/:id/ask", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);
    const { question } = req.body;

    if (!question) {
      res.status(400).json({ ok: false, error: "question is required" });
      return;
    }

    const session = await prisma.pdfSession.findFirst({ where: { id, userId } });
    if (!session) {
      res.status(404).json({ ok: false, error: "Session not found" });
      return;
    }

    // Get the original file's text content
    const file = await prisma.uploadedFile.findFirst({ where: { id: session.fileId, userId } });
    if (!file || !file.textContent) {
      res.status(400).json({ ok: false, error: "Original file text not available" });
      return;
    }

    // Build conversation context
    let messages: any[] = [];
    try {
      messages = JSON.parse(session.messages);
    } catch {}

    const conversationContext = messages
      .slice(-6) // Last 3 exchanges
      .map((m: any) => `${m.role === "user" ? "Q" : "A"}: ${m.content}`)
      .join("\n\n");

    const prompt = `Based on this document, answer the follow-up question.

Document (${session.fileName}):
${file.textContent.slice(0, 10000)}

Previous conversation:
${conversationContext}

New question: ${question}

Answer concisely and accurately based on the document.`;

    const result = (await agentExec(prompt, 30000)) as any;
    const answer =
      result?.text || result?.content || result?.message?.text || result?.message?.content || String(result || "");

    const now = new Date().toISOString();
    messages.push(
      { role: "user", content: question, timestamp: now },
      { role: "assistant", content: answer, timestamp: now }
    );

    await prisma.pdfSession.update({
      where: { id },
      data: { messages: JSON.stringify(messages) },
    });

    res.json({ ok: true, data: { answer, messages } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete PDF session
router.delete("/pdf/sessions/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);

    const existing = await prisma.pdfSession.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Session not found" });
      return;
    }

    await prisma.pdfSession.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PDF Form Builder ───────────────────────────────────────

// Generate form from prompt
router.post("/pdf/forms/generate", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { prompt: userPrompt, title } = req.body;

    if (!userPrompt) {
      res.status(400).json({ ok: false, error: "prompt is required" });
      return;
    }

    const aiPrompt = `Generate a form schema based on this description: "${userPrompt}"

Return ONLY valid JSON with this structure:
{
  "title": "Form Title",
  "description": "Brief description",
  "fields": [
    { "label": "Field Label", "type": "text|email|phone|number|date|select|textarea|checkbox", "required": true|false, "options": ["option1", "option2"] }
  ]
}

The "options" field is only needed for "select" type fields. Generate appropriate fields for the described form. Be thorough but practical.`;

    const result = (await agentExec(aiPrompt, 30000)) as any;
    const responseText =
      result?.text || result?.content || result?.message?.text || result?.message?.content || String(result || "");

    let parsed: any = {};
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (err: any) {
      res.status(500).json({ ok: false, error: "Failed to generate form structure" });
      return;
    }

    const form = await prisma.pdfForm.create({
      data: {
        userId,
        title: title || parsed.title || "Untitled Form",
        description: parsed.description || null,
        fields: JSON.stringify(parsed.fields || []),
        prompt: userPrompt,
      },
    });

    res.json({
      ok: true,
      data: {
        ...form,
        fields: parsed.fields || [],
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// List forms
router.get("/pdf/forms", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const forms = await prisma.pdfForm.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    const data = forms.map((f) => {
      let fields: any[] = [];
      try {
        fields = JSON.parse(f.fields);
      } catch {}
      return { ...f, fields };
    });

    res.json({ ok: true, data });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update form
router.patch("/pdf/forms/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);
    const { title, description, fields } = req.body;

    const existing = await prisma.pdfForm.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Form not found" });
      return;
    }

    const form = await prisma.pdfForm.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(fields !== undefined ? { fields: JSON.stringify(fields) } : {}),
      },
    });

    let parsedFields: any[] = [];
    try {
      parsedFields = JSON.parse(form.fields);
    } catch {}

    res.json({ ok: true, data: { ...form, fields: parsedFields } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete form
router.delete("/pdf/forms/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);

    const existing = await prisma.pdfForm.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Form not found" });
      return;
    }

    await prisma.pdfForm.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── People Search ──────────────────────────────────────────

router.post("/people/search", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { query } = req.body;

    if (!query) {
      res.status(400).json({ ok: false, error: "query is required" });
      return;
    }

    // Search drafts for interactions
    const draftMatches = await prisma.draftReply.findMany({
      where: {
        userId,
        OR: [
          { emailFrom: { contains: query } },
          { emailSubject: { contains: query } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // Build a summary prompt with what we have
    const interactionData = draftMatches
      .map(
        (d) =>
          `- Email from ${d.emailFrom}: "${d.emailSubject}" (${new Date(d.createdAt).toLocaleDateString()})`
      )
      .join("\n");

    let summary = "";
    if (interactionData) {
      const prompt = `Based on these email interactions, provide a brief relationship summary for "${query}":

${interactionData}

Return a 2-3 sentence summary of the relationship and interaction history. If the data is limited, say so.`;

      try {
        const result = (await agentExec(prompt, 20000)) as any;
        summary =
          result?.text || result?.content || result?.message?.text || result?.message?.content || String(result || "");
      } catch {
        summary = "Could not generate relationship summary.";
      }
    }

    // Extract unique contacts from matches
    const contacts = new Map<string, { name: string; email: string; lastContact: string; interactionCount: number }>();
    for (const d of draftMatches) {
      const emailMatch = d.emailFrom.match(/<(.+?)>/);
      const email = emailMatch ? emailMatch[1] : d.emailFrom;
      const name = d.emailFrom.replace(/<.+?>/, "").trim() || email;

      if (!contacts.has(email)) {
        contacts.set(email, {
          name,
          email,
          lastContact: d.createdAt.toISOString(),
          interactionCount: 0,
        });
      }
      const contact = contacts.get(email)!;
      contact.interactionCount++;
    }

    res.json({
      ok: true,
      data: {
        query,
        contacts: Array.from(contacts.values()),
        recentEmails: draftMatches.map((d) => ({
          subject: d.emailSubject,
          from: d.emailFrom,
          date: d.createdAt.toISOString(),
        })),
        summary,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
