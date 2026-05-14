"use client";

import { useEffect, useRef, useState } from "react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const CHIPS = [
  "How do I generate labels?",
  "How is pallet count calculated?",
  "How do I fill the Bill of Lading?",
  "How does the ÷10 import work?",
];

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      setMessages([
        ...next,
        { role: "assistant", content: data.reply || data.error || "No response." },
      ]);
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: "Network error reaching the assistant." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open assistant"
        style={{
          position: "fixed",
          bottom: 28,
          right: 28,
          width: 54,
          height: 54,
          borderRadius: "50%",
          background: "linear-gradient(135deg,#1A5088,#2a70b8)",
          border: "none",
          color: "#fff",
          cursor: "pointer",
          boxShadow: "0 4px 20px rgba(26,80,136,.5)",
          fontSize: 22,
          zIndex: 9000,
        }}
      >
        {open ? "✕" : "💬"}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 94,
            right: 28,
            width: 370,
            maxWidth: "calc(100vw - 24px)",
            height: 520,
            maxHeight: "70vh",
            background: "#0c0c14",
            border: "1px solid #1e2030",
            borderRadius: 18,
            boxShadow: "0 20px 60px rgba(0,0,0,.55)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 8999,
          }}
        >
          <div
            style={{
              padding: "13px 15px",
              background: "#10101a",
              borderBottom: "1px solid #1e2030",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "linear-gradient(135deg,#1A5088,#E8593C)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              Q
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e8e8f2" }}>
                QuikT Assistant
              </div>
              <div style={{ fontSize: 10, color: "#4ec994", fontFamily: "monospace" }}>
                {loading ? "Thinking…" : "Ready"}
              </div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                title="Clear chat"
                style={{
                  background: "#181824",
                  border: "1px solid #2a2a3a",
                  color: "#888",
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                ↺
              </button>
            )}
          </div>

          <div
            ref={chatRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "14px 13px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {messages.length === 0 && (
              <div style={{ margin: "auto", textAlign: "center", color: "#5a5a7a" }}>
                <div style={{ fontSize: 26, marginBottom: 8, color: "#1A5088" }}>◈</div>
                <div style={{ fontSize: 11.5, lineHeight: 1.8 }}>
                  Ask anything about this tool —<br />
                  formulas, steps, BOL, labels.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 14, justifyContent: "center" }}>
                  {CHIPS.map((c) => (
                    <button
                      key={c}
                      onClick={() => send(c)}
                      style={{
                        background: "#181824",
                        border: "1px solid #2a2a3a",
                        color: "#8090b0",
                        borderRadius: 12,
                        padding: "4px 10px",
                        fontSize: 10.5,
                        cursor: "pointer",
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "92%",
                }}
              >
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 11,
                    fontSize: 12.5,
                    lineHeight: 1.65,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    background: m.role === "user" ? "#1A5088" : "#181824",
                    border: m.role === "user" ? "none" : "1px solid #2a2a3a",
                    color: m.role === "user" ? "#fff" : "#dde0f0",
                  }}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ alignSelf: "flex-start", color: "#4a5a7a", fontSize: 18, padding: "0 6px" }}>
                •••
              </div>
            )}
          </div>

          <div
            style={{
              padding: "9px 11px",
              borderTop: "1px solid #1e2030",
              display: "flex",
              gap: 6,
              background: "#10101a",
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send(input);
              }}
              placeholder="Ask about formulas, steps, BOL…"
              style={{
                flex: 1,
                background: "#181824",
                border: "1px solid #2a2a3a",
                borderRadius: 8,
                color: "#e8e8f2",
                fontSize: 13,
                padding: "9px 11px",
                outline: "none",
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              style={{
                width: 38,
                background: "#1A5088",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                opacity: loading || !input.trim() ? 0.5 : 1,
              }}
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}
