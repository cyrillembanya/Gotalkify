"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";

const DialogContext = createContext(null);

function DialogFrame({ title, icon: Icon, danger, children, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="flex items-start gap-4">
          <span
            className={`shrink-0 rounded-xl p-2.5 ${
              danger ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-600"
            }`}
          >
            <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="dialog-title" className="text-lg font-bold text-slate-900">
              {title}
            </h3>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ options, resolve }) {
  const {
    title = "Are you sure?",
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = false,
  } = options;
  const buttonRef = useRef(null);
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);
  const close = useCallback(() => resolve(false), [resolve]);
  return (
    <DialogFrame title={title} icon={danger ? AlertTriangle : HelpCircle} danger={danger} onClose={close}>
      {message ? <p className="mt-1 text-sm text-slate-600">{message}</p> : null}
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={close}>
          {cancelLabel}
        </button>
        <button
          ref={buttonRef}
          type="button"
          className={`${danger ? "btn-danger" : "btn-primary"} px-4 py-2 text-sm`}
          onClick={() => resolve(true)}
        >
          {confirmLabel}
        </button>
      </div>
    </DialogFrame>
  );
}

function PromptDialog({ options, resolve }) {
  const {
    title = "Enter a value",
    message,
    label,
    defaultValue = "",
    placeholder,
    confirmLabel = "OK",
    cancelLabel = "Cancel",
    inputType = "text",
  } = options;
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const close = useCallback(() => resolve(null), [resolve]);
  return (
    <DialogFrame title={title} icon={HelpCircle} onClose={close}>
      <form
        className="mt-1"
        onSubmit={(e) => {
          e.preventDefault();
          resolve(value);
        }}
      >
        {message ? <p className="text-sm text-slate-600">{message}</p> : null}
        {label ? (
          <label className="label mt-3" htmlFor="dialog-input">
            {label}
          </label>
        ) : null}
        <input
          ref={inputRef}
          id="dialog-input"
          type={inputType}
          className={`input ${label ? "" : "mt-3"}`}
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={close}>
            {cancelLabel}
          </button>
          <button type="submit" className="btn-primary px-4 py-2 text-sm">
            {confirmLabel}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const open = useCallback(
    (type, options) =>
      new Promise((resolve) => {
        setDialog({
          type,
          options,
          resolve: (result) => {
            setDialog(null);
            resolve(result);
          },
        });
      }),
    []
  );

  const value = useMemo(
    () => ({
      confirm: (options) => open("confirm", typeof options === "string" ? { message: options } : options),
      prompt: (options) => open("prompt", typeof options === "string" ? { message: options } : options),
    }),
    [open]
  );

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog?.type === "confirm" ? (
        <ConfirmDialog key="confirm" options={dialog.options} resolve={dialog.resolve} />
      ) : null}
      {dialog?.type === "prompt" ? (
        <PromptDialog key="prompt" options={dialog.options} resolve={dialog.resolve} />
      ) : null}
    </DialogContext.Provider>
  );
}

function useDialogs() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useConfirm/usePrompt must be used inside <DialogProvider>");
  return ctx;
}

export function useConfirm() {
  return useDialogs().confirm;
}

export function usePrompt() {
  return useDialogs().prompt;
}
