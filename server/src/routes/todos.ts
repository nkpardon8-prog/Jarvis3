import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { AuthRequest } from "../types";
import { prisma } from "../services/prisma";

const router = Router();

router.use(authMiddleware);

// List todos
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const completed = req.query.completed === "true" ? true : req.query.completed === "false" ? false : undefined;

    const todos = await prisma.todo.findMany({
      where: {
        userId,
        ...(completed !== undefined ? { completed } : {}),
      },
      orderBy: [{ completed: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
    });

    res.json({ ok: true, data: todos });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create a todo
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { title, description, priority, dueDate } = req.body;

    if (!title) {
      res.status(400).json({ ok: false, error: "title is required" });
      return;
    }

    const todo = await prisma.todo.create({
      data: {
        userId,
        title,
        description: description || null,
        priority: priority || "medium",
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    });

    res.json({ ok: true, data: todo });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update a todo
router.patch("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);
    const { title, description, priority, dueDate, completed } = req.body;

    // Verify ownership
    const existing = await prisma.todo.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Todo not found" });
      return;
    }

    const todo = await prisma.todo.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
        ...(completed !== undefined ? { completed } : {}),
      },
    });

    res.json({ ok: true, data: todo });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Delete a todo
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const id = String(req.params.id);

    // Verify ownership
    const existing = await prisma.todo.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ ok: false, error: "Todo not found" });
      return;
    }

    await prisma.todo.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
