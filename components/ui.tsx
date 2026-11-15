"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, X } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ROLE_LABELS, type Provenance, type Role } from "@/lib/domain";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export function Button({ children, variant = "primary", size = "normal", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "normal" | "small" }) {
  return <button {...props} className={`btn btn-${variant} ${size === "small" ? "btn-small" : ""} ${className}`.trim()}>{children}</button>;
}

export function Badge({ children, type = "neutral" }: { children: ReactNode; type?: "neutral" | "verified" | "pending" | "alert" }) {
  return <span className={`badge badge-${type}`}>{type === "verified" && <Check size={9} strokeWidth={3} />}{children}</span>;
}

const provenanceLabels: Record<Provenance, string> = {
  verified: "Verified",
  "ai-confirmed": "AI-read · patient-confirmed",
  "self-reported": "Self-reported",
};
export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  const type = provenance === "verified" ? "verified" : provenance === "self-reported" ? "pending" : "neutral";
  return <Badge type={type}>{provenanceLabels[provenance]}</Badge>;
}

export function Modal({ open, onOpenChange, title, description, width = "max-w-xl", children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; width?: string; children: ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="modal-overlay" />
      <Dialog.Content className={`modal-content ${width}`}>
        <div className="modal-head"><div><Dialog.Title className="modal-title">{title}</Dialog.Title><Dialog.Description className="modal-description">{description}</Dialog.Description></div><Dialog.Close className="btn-icon" aria-label="Close dialog"><X size={15} /></Dialog.Close></div>
        <div className="modal-body">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function RolePicker({ role, onChange }: { role: Role; onChange: (role: Role) => void }) {
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger className="role-picker"><span className="role-picker-dot" /><span className="hidden text-[9px] text-slate-400 sm:inline">Viewing as</span><strong>{ROLE_LABELS[role]}</strong><ChevronDown size={12} /></DropdownMenu.Trigger>
    <DropdownMenu.Portal><DropdownMenu.Content className="role-menu" align="end" sideOffset={8}>
      <div className="role-menu-title">Switch demo role</div>
      {(Object.keys(ROLE_LABELS) as Role[]).map((item) => <DropdownMenu.Item key={item} className={`role-menu-item ${item === role ? "selected" : ""}`} onSelect={() => onChange(item)}>{ROLE_LABELS[item]}{item === role && <Check size={12} />}</DropdownMenu.Item>)}
      <DropdownMenu.Separator className="my-1 border-t border-slate-100" />
      <div className="role-menu-note">Each role is a fictional prototype account.</div>
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
