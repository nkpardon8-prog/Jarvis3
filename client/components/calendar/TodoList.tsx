"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { Plus, Trash2 } from "lucide-react";

interface TodoListProps {
  onTodosChanged?: () => void;
}

interface Todo {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: string | null;
  completed: boolean;
}

export function TodoList({ onTodosChanged }: TodoListProps) {
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newDueDate, setNewDueDate] = useState("");
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["todos"],
    queryFn: async () => {
      const res = await api.get<Todo[]>("/todos");
      if (!res.ok) throw new Error(res.error || "Failed to load todos");
      return res.data || [];
    },
  });

  const createTodo = useMutation({
    mutationFn: async (todo: { title: string; priority: string; dueDate?: string }) => {
      const res = await api.post("/todos", todo);
      if (!res.ok) throw new Error(res.error || "Failed to create");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      setNewTitle("");
      setNewDueDate("");
      setShowForm(false);
      onTodosChanged?.();
    },
  });

  const toggleTodo = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const res = await api.patch(`/todos/${id}`, { completed });
      if (!res.ok) throw new Error(res.error || "Failed to update");
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      onTodosChanged?.();
    },
  });

  const deleteTodo = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/todos/${id}`);
      if (!res.ok) throw new Error(res.error || "Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      onTodosChanged?.();
    },
  });

  const todos = (data as Todo[]) || [];
  const priorityColors: Record<string, string> = {
    high: "text-hud-error border-hud-error/30",
    medium: "text-hud-amber border-hud-amber/30",
    low: "text-hud-text-muted border-hud-border",
  };

  return (
    <GlassPanel>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-hud-text">Tasks</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="p-1.5 rounded-lg text-hud-text-muted hover:text-hud-accent hover:bg-hud-accent/10 transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Add todo form */}
      {showForm && (
        <div className="space-y-2 mb-4 p-3 bg-white/3 rounded-lg border border-hud-border">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Task title"
            className="w-full bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/50 focus:outline-none focus:border-hud-accent/50"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTitle.trim()) {
                createTodo.mutate({
                  title: newTitle.trim(),
                  priority: newPriority,
                  dueDate: newDueDate || undefined,
                });
              }
            }}
          />
          <div className="flex gap-2">
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value)}
              className="bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-2 py-1.5 text-xs text-hud-text focus:outline-none focus:border-hud-accent/50"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="flex-1 bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-2 py-1.5 text-xs text-hud-text focus:outline-none focus:border-hud-accent/50"
            />
            <HudButton
              size="sm"
              onClick={() => {
                if (newTitle.trim()) {
                  createTodo.mutate({
                    title: newTitle.trim(),
                    priority: newPriority,
                    dueDate: newDueDate || undefined,
                  });
                }
              }}
              disabled={!newTitle.trim() || createTodo.isPending}
            >
              Add
            </HudButton>
          </div>
        </div>
      )}

      {/* Todo list */}
      {isLoading ? (
        <p className="text-xs text-hud-text-muted text-center py-4">Loading...</p>
      ) : todos.length === 0 ? (
        <p className="text-xs text-hud-text-muted text-center py-4">
          No tasks yet. Click + to add one.
        </p>
      ) : (
        <div className="space-y-1.5">
          {todos.map((todo) => (
            <div
              key={todo.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-white/3 group ${
                todo.completed ? "opacity-50" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() =>
                  toggleTodo.mutate({
                    id: todo.id,
                    completed: !todo.completed,
                  })
                }
                className="rounded border-hud-border accent-hud-accent"
              />
              <div className="flex-1 min-w-0">
                <p
                  className={`text-xs ${
                    todo.completed
                      ? "line-through text-hud-text-muted"
                      : "text-hud-text"
                  }`}
                >
                  {todo.title}
                </p>
                {todo.dueDate && (
                  <p className="text-[10px] text-hud-text-muted">
                    Due: {new Date(todo.dueDate).toLocaleDateString()}
                  </p>
                )}
              </div>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded border ${
                  priorityColors[todo.priority] || priorityColors.medium
                }`}
              >
                {todo.priority}
              </span>
              <button
                onClick={() => deleteTodo.mutate(todo.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-hud-text-muted hover:text-hud-error transition-all"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}
