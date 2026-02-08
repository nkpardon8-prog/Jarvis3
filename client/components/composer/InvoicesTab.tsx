"use client";

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { HudBadge } from "@/components/ui/HudBadge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  Receipt,
  Upload,
  DollarSign,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";

interface Invoice {
  id: string;
  source: string;
  sourceId: string | null;
  vendor: string | null;
  invoiceNumber: string | null;
  amount: number | null;
  currency: string | null;
  dueDate: string | null;
  status: string;
  lineItems: string | null;
  rawText: string | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_CONFIG: Record<string, { variant: "warning" | "online" | "error" | "info"; label: string; icon: typeof Clock }> = {
  pending: { variant: "warning", label: "Pending", icon: Clock },
  paid: { variant: "online", label: "Paid", icon: CheckCircle2 },
  overdue: { variant: "error", label: "Overdue", icon: AlertTriangle },
  disputed: { variant: "info", label: "Disputed", icon: AlertTriangle },
};

export function InvoicesTab() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["composer-invoices", filterStatus],
    queryFn: async () => {
      const params = filterStatus ? `?status=${filterStatus}` : "";
      const res = await api.get<any>(`/composer/invoices${params}`);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const uploadInvoice = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.upload<Invoice>("/composer/invoices/upload", formData);
      if (!res.ok) throw new Error(res.error);
      return res.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["composer-invoices"] });
    },
  });

  const updateInvoice = useMutation({
    mutationFn: async ({ id, ...body }: { id: string; status?: string }) => {
      const res = await api.patch(`/composer/invoices/${id}`, body);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["composer-invoices"] });
    },
  });

  const deleteInvoice = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/composer/invoices/${id}`);
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["composer-invoices"] });
    },
  });

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadInvoice.mutate(file);
      if (e.target) e.target.value = "";
    },
    [uploadInvoice]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) uploadInvoice.mutate(file);
    },
    [uploadInvoice]
  );

  const invoices: Invoice[] = data?.invoices || [];
  const total = data?.total || 0;

  // Dashboard summary
  const pendingCount = invoices.filter((i) => i.status === "pending").length;
  const overdueCount = invoices.filter((i) => i.status === "overdue").length;
  const pendingTotal = invoices
    .filter((i) => i.status === "pending")
    .reduce((sum, i) => sum + (i.amount || 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <GlassPanel>
          <div className="flex items-center gap-2 mb-1">
            <Clock size={14} className="text-hud-amber" />
            <p className="text-[10px] text-hud-text-muted uppercase">Pending</p>
          </div>
          <p className="text-lg font-semibold text-hud-text">{pendingCount}</p>
          <p className="text-[10px] text-hud-text-muted">
            ${pendingTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </GlassPanel>
        <GlassPanel>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={14} className="text-hud-error" />
            <p className="text-[10px] text-hud-text-muted uppercase">Overdue</p>
          </div>
          <p className="text-lg font-semibold text-hud-text">{overdueCount}</p>
        </GlassPanel>
        <GlassPanel>
          <div className="flex items-center gap-2 mb-1">
            <Receipt size={14} className="text-hud-accent" />
            <p className="text-[10px] text-hud-text-muted uppercase">Total</p>
          </div>
          <p className="text-lg font-semibold text-hud-text">{total}</p>
        </GlassPanel>
      </div>

      {/* Upload zone */}
      <GlassPanel>
        <div
          className="border-2 border-dashed border-hud-border rounded-lg p-6 text-center cursor-pointer hover:border-hud-accent/40 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          {uploadInvoice.isPending ? (
            <div className="flex flex-col items-center gap-2">
              <LoadingSpinner size="sm" />
              <p className="text-xs text-hud-text-muted">Analyzing invoice...</p>
            </div>
          ) : (
            <>
              <Upload size={24} className="mx-auto text-hud-text-muted mb-2" />
              <p className="text-xs text-hud-text-secondary">
                Drop an invoice PDF here or click to upload
              </p>
              <p className="text-[10px] text-hud-text-muted mt-1">
                AI will extract vendor, amount, line items, and due date
              </p>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.csv"
          onChange={handleFileSelect}
          className="hidden"
        />
        {uploadInvoice.isError && (
          <p className="text-xs text-hud-error mt-2">
            {(uploadInvoice.error as Error).message}
          </p>
        )}
      </GlassPanel>

      {/* Filter + list */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-hud-text">Invoices</h3>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-2 py-1 text-xs text-hud-text focus:outline-none focus:border-hud-accent/50"
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="disputed">Disputed</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : invoices.length === 0 ? (
        <GlassPanel>
          <p className="text-xs text-hud-text-muted text-center py-8">
            No invoices yet. Upload a PDF to get started.
          </p>
        </GlassPanel>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => {
            const isExpanded = expandedId === inv.id;
            const config = STATUS_CONFIG[inv.status] || STATUS_CONFIG.pending;
            let lineItems: any[] = [];
            try {
              if (inv.lineItems) lineItems = JSON.parse(inv.lineItems);
            } catch {}

            return (
              <GlassPanel key={inv.id}>
                <div
                  className="flex items-start gap-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                >
                  <DollarSign size={16} className="text-hud-success mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs font-medium text-hud-text truncate">
                        {inv.vendor || "Unknown Vendor"}
                      </p>
                      <HudBadge variant={config.variant}>{config.label}</HudBadge>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-hud-text-muted">
                      {inv.invoiceNumber && <span>#{inv.invoiceNumber}</span>}
                      {inv.amount != null && (
                        <span className="font-medium text-hud-text-secondary">
                          {inv.currency || "$"}
                          {inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      )}
                      {inv.dueDate && <span>Due: {inv.dueDate}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[9px] text-hud-text-muted">
                      {new Date(inv.createdAt).toLocaleDateString()}
                    </span>
                    {isExpanded ? (
                      <ChevronUp size={14} className="text-hud-text-muted" />
                    ) : (
                      <ChevronDown size={14} className="text-hud-text-muted" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-hud-border space-y-3">
                    {inv.summary && (
                      <div className="bg-hud-accent/5 rounded-lg p-3 border border-hud-accent/10">
                        <p className="text-[10px] text-hud-accent mb-1">AI Summary</p>
                        <p className="text-xs text-hud-text">{inv.summary}</p>
                      </div>
                    )}

                    {lineItems.length > 0 && (
                      <div>
                        <p className="text-[10px] text-hud-text-muted mb-2 uppercase">Line Items</p>
                        <div className="bg-white/3 rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-hud-border">
                                <th className="text-left px-3 py-1.5 text-hud-text-muted text-[10px]">Description</th>
                                <th className="text-right px-3 py-1.5 text-hud-text-muted text-[10px]">Qty</th>
                                <th className="text-right px-3 py-1.5 text-hud-text-muted text-[10px]">Unit Price</th>
                                <th className="text-right px-3 py-1.5 text-hud-text-muted text-[10px]">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lineItems.map((item: any, i: number) => (
                                <tr key={i} className="border-b border-hud-border/50">
                                  <td className="px-3 py-1.5 text-hud-text">{item.description}</td>
                                  <td className="text-right px-3 py-1.5 text-hud-text-secondary">{item.quantity}</td>
                                  <td className="text-right px-3 py-1.5 text-hud-text-secondary">${item.unitPrice}</td>
                                  <td className="text-right px-3 py-1.5 text-hud-text">${item.total}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Status actions */}
                    <div className="flex gap-2">
                      {inv.status !== "paid" && (
                        <HudButton
                          size="sm"
                          onClick={() => updateInvoice.mutate({ id: inv.id, status: "paid" })}
                          disabled={updateInvoice.isPending}
                        >
                          <CheckCircle2 size={12} /> Mark Paid
                        </HudButton>
                      )}
                      {inv.status !== "overdue" && inv.status !== "paid" && (
                        <HudButton
                          size="sm"
                          variant="danger"
                          onClick={() => updateInvoice.mutate({ id: inv.id, status: "overdue" })}
                          disabled={updateInvoice.isPending}
                        >
                          <AlertTriangle size={12} /> Mark Overdue
                        </HudButton>
                      )}
                      <HudButton
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteInvoice.mutate(inv.id)}
                        disabled={deleteInvoice.isPending}
                      >
                        <Trash2 size={12} /> Delete
                      </HudButton>
                    </div>
                  </div>
                )}
              </GlassPanel>
            );
          })}
        </div>
      )}
    </div>
  );
}
