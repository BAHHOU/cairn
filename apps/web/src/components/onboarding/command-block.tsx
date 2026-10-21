"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";

/**
 * A command you can take away.
 *
 * The only interactive piece of the onboarding page, and it exists for one
 * reason: a setup guide is read with one hand on the keyboard, and retyping a
 * Maven invocation is how a typo becomes a half-hour of confusion. Comment lines
 * are dimmed but still copied — they are instructions to the reader, and dropping
 * them would hand over a command that silently does the wrong thing.
 */
export function CommandBlock({ command, shell }: { command: string; shell?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    void navigator.clipboard
      ?.writeText(command)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  }, [command]);

  return (
    <div className="group relative rounded-lg border bg-muted/50">
      <pre className="overflow-x-auto p-3 pr-12 font-mono text-xs leading-relaxed">
        {command.split("\n").map((line) => (
          <div
            key={line}
            className={line.trim().startsWith("#") ? "text-muted-foreground" : undefined}
          >
            {line}
          </div>
        ))}
      </pre>
      {shell && shell !== "any" ? (
        <span className="absolute bottom-1.5 left-3 text-[10px] text-muted-foreground uppercase">
          {shell}
        </span>
      ) : null}
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Commande copiée" : "Copier la commande"}
        className="absolute top-2 right-2 rounded-md border bg-background p-1.5 text-muted-foreground hover:text-foreground"
      >
        {copied ? (
          <Check className="size-3.5 text-primary" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
      </button>
    </div>
  );
}
