"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Clock,
  X,
} from "lucide-react";

interface Todo {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: string | null;
  estimatedMinutes: number | null;
  completed: boolean;
  createdAt: string;
}

type Period = "today" | "week" | "month" | "all";

const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "all", label: "All" },
];

const DURATIONS = [
  { value: "", label: "No estimate" },
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1.5 hours" },
  { value: "120", label: "2 hours" },
  { value: "180", label: "3 hours" },
  { value: "240", label: "4 hours" },
];

const priorityColors: Record<string, string> = {
  high: "text-hud-error bg-hud-error/10 border-hud-error/30",
  medium: "text-hud-amber bg-hud-amber/10 border-hud-amber/30",
  low: "text-hud-text-muted bg-hud-text-muted/10 border-hud-border",
};

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function TasksPanel() {
  const [period, setPeriod] = useState<Period>("today");
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newDueDate, setNewDueDate] = useState("");
  const [newDuration, setNewDuration] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["todos", period],
    queryFn: async () => {
      const url = period === "all" ? "/todos" : `/todos?period=${period}`;
      const res = await api.get<any>(url);
      if (!res.ok) throw new Error(res.error || "Failed to load tasks");
      return res.data;
    },
  });

  // Separate count queries for badges
  const { data: todayData } = useQuery({
    queryKey: ["todos", "today"],
    queryFn: async () => {
      const res = await api.get<any>("/todos?period=today");
      if (!res.ok) return [];
      return res.data;
    },
    enabled: period !== "today",
  });

  const { data: weekData } = useQuery({
    queryKey: ["todos", "week"],
    queryFn: async () => {
      const res = await api.get<any>("/todos?period=week");
      if (!res.ok) return [];
      return res.data;
    },
    enabled: period !== "week",
  });

  const { data: monthData } = useQuery({
    queryKey: ["todos", "month"],
    queryFn: async () => {
      const res = await api.get<any>("/todos?period=month");
      if (!res.ok) return [];
      return res.data;
    },
    enabled: period !== "month",
  });

  const { data: allData } = useQuery({
    queryKey: ["todos", "all"],
    queryFn: async () => {
      const res = await api.get<any>("/todos");
      if (!res.ok) return [];
      return res.data;
    },
    enabled: period !== "all",
  });

  function getCount(p: Period): number {
    let d: Todo[] | undefined;
    if (p === period) d = data as Todo[] | undefined;
    else if (p === "today") d = todayData as Todo[] | undefined;
    else if (p === "week") d = weekData as Todo[] | undefined;
    else if (p === "month") d = monthData as Todo[] | undefined;
    else d = allData as Todo[] | undefined;
    return (d || []).filter((t) => !t.completed).length;
  }

  const createTodo = useMutation({
    mutationFn: async () => {
      const body: any = { title: newTitle.trim(), priority: newPriority };
      if (newDueDate) body.dueDate = newDueDate;
      if (newDuration) body.estimatedMinutes = parseInt(newDuration);
      if (newDescription.trim()) body.description = newDescription.trim();
      const res = await api.post("/todos", body);
      if (!res.ok) throw new Error(res.error || "Failed to create task");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      setNewTitle("");
      setNewDueDate("");
      setNewDuration("");
      setNewDescription("");
      setNewPriority("medium");
      setShowForm(false);
    },
  });

  const toggleTodo = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const res = await api.patch(`/todos/${id}`, { completed });
      if (!res.ok) throw new Error(res.error || "Failed");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const deleteTodo = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/todos/${id}`);
      if (!res.ok) throw new Error(res.error || "Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const todos = ((data as Todo[]) || []).sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const prio: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return (prio[a.priority] || 1) - (prio[b.priority] || 1);
  });

  const inputClass =
    "w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-sm text-hud-text placeholder:text-hud-text-muted/50 focus:outline-none focus:border-hud-accent/50 transition-colors";

  return (
    <div className="space-y-4">
      {/* Period tabs + Add button */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1 p-0.5 bg-hud-bg-secondary/50 rounded-lg border border-hud-border">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                period === p.id
                  ? "bg-hud-accent/20 text-hud-accent"
                  : "text-hud-text-muted hover:text-hud-text"
              }`}
            >
              {p.label}
              {getCount(p.id) > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    period === p.id
                      ? "bg-hud-accent/20 text-hud-accent"
                      : "bg-hud-surface text-hud-text-muted"
                  }`}
                >
                  {getCount(p.id)}
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-hud-accent/20 text-hud-accent border border-hud-accent/30 hover:bg-hud-accent/30 transition-colors"
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? "Cancel" : "New Task"}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <GlassPanel>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newTitle.trim()) createTodo.mutate();
            }}
            className="space-y-3"
          >
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Task title"
              className={inputClass}
              autoFocus
            />
            <div className="grid grid-cols-3 gap-2">
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
                className={inputClass}
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
              </select>
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className={inputClass}
              />
              <select
                value={newDuration}
                onChange={(e) => setNewDuration(e.target.value)}
                className={inputClass}
              >
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className={`${inputClass} resize-none`}
            />
            <div className="flex justify-end">
              <HudButton
                type="submit"
                size="sm"
                disabled={!newTitle.trim() || createTodo.isPending}
              >
                {createTodo.isPending ? "Creating..." : "Add Task"}
              </HudButton>
            </div>
          </form>
        </GlassPanel>
      )}

      {/* Task list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="md" />
        </div>
      ) : todos.length === 0 ? (
        <GlassPanel>
          <div className="text-center py-10">
            <p className="text-sm text-hud-text-muted">
              {period === "today"
                ? "No tasks for today. Add some to get started!"
                : `No tasks for this ${period === "week" ? "week" : period === "month" ? "month" : "period"}.`}
            </p>
          </div>
        </GlassPanel>
      ) : (
        <div className="space-y-1.5">
          {todos.map((todo) => (
            <TaskItem
              key={todo.id}
              todo={todo}
              expanded={expandedId === todo.id}
              onToggleExpand={() =>
                setExpandedId(expandedId === todo.id ? null : todo.id)
              }
              onToggleComplete={() =>
                toggleTodo.mutate({ id: todo.id, completed: !todo.completed })
              }
              onDelete={() => deleteTodo.mutate(todo.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Task Item with inline editing ─────────────────────
function TaskItem({
  todo,
  expanded,
  onToggleExpand,
  onToggleComplete,
  onDelete,
}: {
  todo: Todo;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleComplete: () => void;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const [editTitle, setEditTitle] = useState(todo.title);
  const [editDescription, setEditDescription] = useState(todo.description || "");
  const [editPriority, setEditPriority] = useState(todo.priority);
  const [editDueDate, setEditDueDate] = useState(
    todo.dueDate ? todo.dueDate.split("T")[0] : ""
  );
  const [editDuration, setEditDuration] = useState(
    todo.estimatedMinutes ? String(todo.estimatedMinutes) : ""
  );
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateTodo = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const res = await api.patch(`/todos/${todo.id}`, updates);
      if (!res.ok) throw new Error(res.error || "Failed to update");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const autoSave = useCallback(
    (updates: Record<string, any>) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        updateTodo.mutate(updates);
      }, 800);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const pc = priorityColors[todo.priority] || priorityColors.medium;

  const inputClass =
    "w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-1.5 text-sm text-hud-text placeholder:text-hud-text-muted/50 focus:outline-none focus:border-hud-accent/50 transition-colors";

  return (
    <GlassPanel className="!p-0">
      {/* Main row */}
      <div
        className={`flex items-center gap-3 px-4 py-3 ${
          todo.completed ? "opacity-50" : ""
        }`}
      >
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={onToggleComplete}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-hud-border accent-hud-accent shrink-0"
        />
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggleExpand}>
          <p
            className={`text-sm ${
              todo.completed
                ? "line-through text-hud-text-muted"
                : "text-hud-text"
            }`}
          >
            {todo.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {todo.dueDate && (
              <span className="text-[10px] text-hud-text-muted">
                Due: {new Date(todo.dueDate).toLocaleDateString()}
              </span>
            )}
            {todo.estimatedMinutes && (
              <span className="flex items-center gap-0.5 text-[10px] text-hud-text-muted">
                <Clock size={9} />
                {formatDuration(todo.estimatedMinutes)}
              </span>
            )}
          </div>
        </div>

        <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${pc}`}>
          {todo.priority}
        </span>

        <button
          onClick={onToggleExpand}
          className="p-1 text-hud-text-muted hover:text-hud-accent transition-colors shrink-0"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 text-hud-text-muted hover:text-hud-error transition-colors shrink-0"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Expanded edit */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-hud-border/50 space-y-3">
          <div>
            <label className="block text-[10px] text-hud-text-muted mb-1">Title</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => {
                setEditTitle(e.target.value);
                autoSave({ title: e.target.value });
              }}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-[10px] text-hud-text-muted mb-1">Description</label>
            <textarea
              value={editDescription}
              onChange={(e) => {
                setEditDescription(e.target.value);
                autoSave({ description: e.target.value });
              }}
              rows={2}
              className={`${inputClass} resize-none`}
              placeholder="Add description..."
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] text-hud-text-muted mb-1">Priority</label>
              <select
                value={editPriority}
                onChange={(e) => {
                  setEditPriority(e.target.value);
                  updateTodo.mutate({ priority: e.target.value });
                }}
                className={inputClass}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-hud-text-muted mb-1">Due Date</label>
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => {
                  setEditDueDate(e.target.value);
                  updateTodo.mutate({ dueDate: e.target.value || null });
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-[10px] text-hud-text-muted mb-1">Duration</label>
              <select
                value={editDuration}
                onChange={(e) => {
                  setEditDuration(e.target.value);
                  updateTodo.mutate({
                    estimatedMinutes: e.target.value ? parseInt(e.target.value) : null,
                  });
                }}
                className={inputClass}
              >
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </GlassPanel>
  );
}
