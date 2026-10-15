import React, { createContext, useContext, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from './ui/button'
import { Select as SelectRoot, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { errorMessage, PanelError } from '../services/client'
export const OperationalAvailability = createContext(true)
export function FieldSelect({ label, value, onChange, items, id, disabled = false }: { label: string; value: string; onChange(value: string): void; items: { value: string; label: string; disabled?: boolean }[]; id?: string; disabled?: boolean }) {
  return <SelectRoot value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger id={id} aria-label={label}><SelectValue placeholder={label}/></SelectTrigger><SelectContent position="popper" sideOffset={5}>{items.map(item => <SelectItem key={item.value} value={item.value} disabled={item.disabled}>{item.label}</SelectItem>)}</SelectContent></SelectRoot>
}
export function SearchField({ label, value, onChange, onSubmit, onComposition, disabled }: { label: string; value: string; onChange(value: string): void; onSubmit?(): void; onComposition?(value: boolean): void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  return <div className="panel-search"><label htmlFor={label}>{label}</label><div><input id={label} ref={input} type="search" value={value} disabled={disabled} onChange={e => onChange(e.target.value)} onCompositionStart={() => onComposition?.(true)} onCompositionEnd={() => onComposition?.(false)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); onSubmit?.() } }}/>{value && <Button type="button" variant="ghost" size="icon" aria-label="Limpar busca" onClick={() => { onChange(''); input.current?.focus() }}><X/></Button>}</div></div>
}
export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div className={error ? 'panel-notice panel-error' : 'panel-notice'} role={error ? 'alert' : 'status'}>{children}</div>
}
export function ConfirmAction({ title, description, action, children, open, busy, disabled = false, requiresConnection = false, onClose, onConfirm }: { title: string; description: string; action: string; children?: React.ReactNode; open: boolean; busy: boolean; disabled?: boolean; requiresConnection?: boolean; onClose(): void; onConfirm(): void }) {
  const cancel = useRef<HTMLButtonElement>(null), restore = useRef<HTMLElement | null>(null)
  const available = useContext(OperationalAvailability)
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose() }}><DialogContent className="app-dialog panel-dialog" onOpenAutoFocus={e => { e.preventDefault(); restore.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; cancel.current?.focus() }} onCloseAutoFocus={e => { e.preventDefault(); const target = restore.current?.isConnected && !restore.current.matches(':disabled') ? restore.current : document.querySelector<HTMLElement>('section:not([hidden])[data-view] h1'); target?.focus() }} onEscapeKeyDown={e => { if (busy) e.preventDefault() }} onPointerDownOutside={e => { if (busy) e.preventDefault() }}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{children}<div className="dialog-actions"><Button ref={cancel} type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="button" disabled={busy || disabled || requiresConnection && !available} aria-busy={busy} onClick={onConfirm}>{action}</Button></div></DialogContent></Dialog>
}
export function useAction(onFailure: (error: unknown) => void) {
  const lock = useRef(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [uncertain, setUncertain] = useState(false)
  async function run(work: () => Promise<void>, success: string) {
    if (lock.current || uncertain) return false
    lock.current = true; setBusy(true); setError(''); setMessage('')
    try { await work(); setMessage(success); return true }
    catch (failure) { setError(errorMessage(failure)); if (failure instanceof PanelError && failure.code === 'OUTCOME_UNCERTAIN') setUncertain(true); onFailure(failure); return false }
    finally { lock.current = false; setBusy(false) }
  }
  return { run, busy, error, message, uncertain }
}
