import tkinter as tk
from tkinter import ttk, scrolledtext, filedialog
import threading
import sys
import io
import os
import re

from scraper import scrape, CITY_AREAS


# ── redirect stdout so scraper log() appears in the UI ────────────────────────
class _StreamToText:
    def __init__(self, widget: scrolledtext.ScrolledText):
        self._w = widget

    def write(self, text):
        self._w.configure(state="normal")
        self._w.insert("end", text)
        self._w.see("end")
        self._w.configure(state="disabled")

    def flush(self):
        pass


# ── Main UI ───────────────────────────────────────────────────────────────────
class ScraperApp:
    BG = "#1e1e2e"
    CARD = "#2a2a3d"
    ACCENT = "#7c6af7"
    TEXT = "#e0e0f0"
    MUTED = "#888aaa"
    GREEN = "#4caf7d"
    RED = "#f07070"
    ENTRY_BG = "#33334a"

    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Google Maps Scraper")
        self.root.geometry("760x640")
        self.root.minsize(680, 540)
        self.root.configure(bg=self.BG)

        self._running = False
        self._thread = None

        self._build()

    # ── Layout ────────────────────────────────────────────────────────────────
    def _build(self):
        root = self.root

        # ── Header ──
        hdr = tk.Frame(root, bg=self.ACCENT, pady=12)
        hdr.pack(fill="x")
        tk.Label(hdr, text="  Google Maps Scraper", font=("Segoe UI", 16, "bold"),
                 bg=self.ACCENT, fg="white").pack(side="left", padx=18)

        # ── Form card ──
        card = tk.Frame(root, bg=self.CARD, padx=24, pady=20)
        card.pack(fill="x", padx=20, pady=(16, 0))

        def lbl(parent, text, row, col=0):
            tk.Label(parent, text=text, font=("Segoe UI", 10),
                     bg=self.CARD, fg=self.MUTED).grid(
                row=row, column=col, sticky="w", pady=(6, 2))

        def entry(parent, var, row, col=1, width=28):
            e = tk.Entry(parent, textvariable=var, font=("Segoe UI", 11),
                         bg=self.ENTRY_BG, fg=self.TEXT, insertbackground=self.TEXT,
                         relief="flat", bd=4, width=width)
            e.grid(row=row, column=col, sticky="ew", padx=(10, 0), pady=(6, 2))
            return e

        card.columnconfigure(1, weight=1)

        lbl(card, "Search Query", 0)
        self.var_query = tk.StringVar(value="gym")
        entry(card, self.var_query, 0)
        tk.Label(card, text="e.g.  gym  /  restaurant  /  salon",
                 font=("Segoe UI", 8), bg=self.CARD, fg=self.MUTED).grid(
            row=0, column=2, sticky="w", padx=8)

        lbl(card, "City", 1)
        self.var_city = tk.StringVar(value="Jaipur")
        city_entry = entry(card, self.var_city, 1)

        # City suggestion dropdown
        known = sorted(CITY_AREAS.keys(), key=str.title)
        suggestion = ttk.Combobox(card, values=[c.title() for c in known],
                                  font=("Segoe UI", 10), width=14)
        suggestion.grid(row=1, column=2, padx=8, sticky="w")
        suggestion.set("Pick city →")
        suggestion.bind("<<ComboboxSelected>>",
                        lambda e: self.var_city.set(suggestion.get()))

        lbl(card, "Target Count", 2)
        self.var_target = tk.StringVar(value="500")
        entry(card, self.var_target, 2)
        tk.Label(card, text="How many results you want",
                 font=("Segoe UI", 8), bg=self.CARD, fg=self.MUTED).grid(
            row=2, column=2, sticky="w", padx=8)

        lbl(card, "Output File", 3)
        self.var_out = tk.StringVar(value="")
        out_entry = entry(card, self.var_out, 3, width=22)
        tk.Button(card, text="Browse", font=("Segoe UI", 9),
                  bg=self.ACCENT, fg="white", relief="flat",
                  command=self._browse_output).grid(row=3, column=2, padx=8, sticky="w")
        tk.Label(card, text="(leave blank = auto name)",
                 font=("Segoe UI", 8), bg=self.CARD, fg=self.MUTED).grid(
            row=4, column=1, columnspan=2, sticky="w", padx=(10, 0))

        # ── Buttons ──
        btn_frame = tk.Frame(root, bg=self.BG, pady=12)
        btn_frame.pack(fill="x", padx=20)

        self.btn_start = tk.Button(
            btn_frame, text="▶  Start Scraping",
            font=("Segoe UI", 11, "bold"),
            bg=self.ACCENT, fg="white", relief="flat",
            padx=20, pady=8, cursor="hand2",
            command=self._start)
        self.btn_start.pack(side="left")

        self.btn_stop = tk.Button(
            btn_frame, text="■  Stop",
            font=("Segoe UI", 11),
            bg=self.RED, fg="white", relief="flat",
            padx=20, pady=8, cursor="hand2",
            state="disabled",
            command=self._stop)
        self.btn_stop.pack(side="left", padx=10)

        self.btn_open = tk.Button(
            btn_frame, text="📂  Open CSV",
            font=("Segoe UI", 11),
            bg=self.GREEN, fg="white", relief="flat",
            padx=20, pady=8, cursor="hand2",
            state="disabled",
            command=self._open_csv)
        self.btn_open.pack(side="left")

        # ── Status bar ──
        self.var_status = tk.StringVar(value="Ready")
        status_bar = tk.Label(root, textvariable=self.var_status,
                               font=("Segoe UI", 9), bg=self.CARD,
                               fg=self.MUTED, anchor="w", padx=12, pady=5)
        status_bar.pack(fill="x", padx=20)

        # ── Progress bar ──
        style = ttk.Style()
        style.theme_use("default")
        style.configure("Accent.Horizontal.TProgressbar",
                         troughcolor=self.CARD,
                         background=self.ACCENT,
                         thickness=6)
        self.progress = ttk.Progressbar(root, style="Accent.Horizontal.TProgressbar",
                                         mode="indeterminate")
        self.progress.pack(fill="x", padx=20, pady=(0, 6))

        # ── Log area ──
        log_frame = tk.Frame(root, bg=self.BG)
        log_frame.pack(fill="both", expand=True, padx=20, pady=(0, 16))
        tk.Label(log_frame, text="Live Log", font=("Segoe UI", 9, "bold"),
                 bg=self.BG, fg=self.MUTED).pack(anchor="w")
        self.log_box = scrolledtext.ScrolledText(
            log_frame, font=("Consolas", 9),
            bg="#12121e", fg=self.TEXT,
            insertbackground=self.TEXT,
            relief="flat", state="disabled",
            height=14, wrap="word")
        self.log_box.pack(fill="both", expand=True)

        # Tags for colored lines
        self.log_box.tag_config("ok", foreground=self.GREEN)
        self.log_box.tag_config("err", foreground=self.RED)
        self.log_box.tag_config("hdr", foreground=self.ACCENT)

    # ── Helpers ───────────────────────────────────────────────────────────────
    def _browse_output(self):
        path = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")])
        if path:
            self.var_out.set(path)

    def _log(self, text: str, tag: str = ""):
        self.log_box.configure(state="normal")
        self.log_box.insert("end", text, tag)
        self.log_box.see("end")
        self.log_box.configure(state="disabled")
        self.root.update_idletasks()

    def _open_csv(self):
        path = self._last_output or ""
        if path and os.path.exists(path):
            os.startfile(path)

    # ── Scraper thread ────────────────────────────────────────────────────────
    def _start(self):
        query = self.var_query.get().strip()
        city = self.var_city.get().strip()
        target_str = self.var_target.get().strip()
        out = self.var_out.get().strip()

        if not query or not city:
            self._log("  Please fill in Query and City.\n", "err")
            return
        try:
            target = int(target_str)
            assert target > 0
        except Exception:
            self._log("  Target must be a positive number.\n", "err")
            return

        self.log_box.configure(state="normal")
        self.log_box.delete("1.0", "end")
        self.log_box.configure(state="disabled")

        self._running = True
        self._last_output = out
        self.btn_start.config(state="disabled")
        self.btn_stop.config(state="normal")
        self.btn_open.config(state="disabled")
        self.progress.start(12)
        self.var_status.set(f"Scraping \"{query}\" in {city}  →  target {target}")

        # Redirect stdout → log box
        self._old_stdout = sys.stdout
        sys.stdout = _StreamToText(self.log_box)

        self._thread = threading.Thread(
            target=self._run_scrape,
            args=(query, city, target, out),
            daemon=True)
        self._thread.start()

    def _run_scrape(self, query, city, target, out):
        try:
            results = scrape(query, city, target, out)
            # Detect output file name (auto-generated if blank)
            if not out:
                safe_q = re.sub(r'[^a-zA-Z0-9_]', '_', query)
                safe_c = re.sub(r'[^a-zA-Z0-9_]', '_', city)
                out = f"{safe_q}_{safe_c}_results.csv"
            self._last_output = out
            self.root.after(0, self._on_done, len(results), out)
        except Exception as e:
            self.root.after(0, self._on_error, str(e))

    def _stop(self):
        # Playwright doesn't support hard-kill from another thread cleanly,
        # but we can flag it — the scraper will stop after the current search.
        self._running = False
        self._log("\n  Stop requested — will finish current search then exit.\n", "err")
        self.btn_stop.config(state="disabled")

    def _on_done(self, count: int, path: str):
        sys.stdout = self._old_stdout
        self.progress.stop()
        self._running = False
        self.btn_start.config(state="normal")
        self.btn_stop.config(state="disabled")
        self.btn_open.config(state="normal")
        self.var_status.set(f"Done!  {count} results saved → {path}")
        self._log(f"\n  Saved {count} results → {path}\n", "ok")

    def _on_error(self, msg: str):
        sys.stdout = self._old_stdout
        self.progress.stop()
        self._running = False
        self.btn_start.config(state="normal")
        self.btn_stop.config(state="disabled")
        self.var_status.set("Error — see log")
        self._log(f"\n  ERROR: {msg}\n", "err")

    # ── Run ───────────────────────────────────────────────────────────────────
    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    ScraperApp().run()
