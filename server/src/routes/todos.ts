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

    const period = req.query.period as string | undefined;

    let dateFilter: any = {};
    if (period === "today") {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const tomorrow = new Date(todayStart);
      tomorrow.setDate(tomorrow.getDate() + 1);
      // Include tasks due today OR tasks with no due date (unscheduled = do today)
      dateFilter = {
        OR: [
          { dueDate: { gte: todayStart, lt: tomorrow } },
          { dueDate: null },
        ],
      };
    } else if (period === "week") {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(todayStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      dateFilter = {
        OR: [
          { dueDate: { gte: todayStart, lt: weekEnd } },
          { dueDate: null },
        ],
      };
    } else if (period === "month") {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const monthEnd = new Date(todayStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      dateFilter = {
        OR: [
          { dueDate: { gte: todayStart, lt: monthEnd } },
          { dueDate: null },
        ],
      };
    }

    const todos = await prisma.todo.findMany({
      where: {
        userId,
        ...(completed !== undefined ? { completed } : {}),
        ...dateFilter,
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
    const { title, description, priority, dueDate, estimatedMinutes } = req.body;

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
        estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes, 10) : null,
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
    const { title, description, priority, dueDate, completed, estimatedMinutes } = req.body;

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
        ...(estimatedMinutes !== undefined ? { estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes, 10) : null } : {}),
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
