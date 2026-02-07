"use client";

import { useState } from "react";
import { TodoList } from "./TodoList";
import { AgendaPanel } from "./AgendaPanel";

export function CalendarPage() {
  const [agendaRefresh, setAgendaRefresh] = useState(0);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-hud-text">Calendar & Daily Agenda</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TodoList onTodosChanged={() => setAgendaRefresh((n) => n + 1)} />
        <AgendaPanel key={agendaRefresh} />
      </div>
    </div>
  );
}
