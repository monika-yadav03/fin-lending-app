"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMarkdown(text) {
  const lines = escapeHtml(text).split(/\r?\n/);
  let html = "";
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html += "</ul>";
      inUl = false;
    }
    if (inOl) {
      html += "</ol>";
      inOl = false;
    }
  };

  const isTableSeparator = (line) =>
    /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
  const isTableRow = (line) => /\|/.test(line);
  const parseRow = (line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      closeLists();
      const headerCells = parseRow(line);
      i += 2; // skip separator
      const bodyRows = [];
      while (i < lines.length && lines[i].trim() !== "" && isTableRow(lines[i])) {
        bodyRows.push(parseRow(lines[i]));
        i++;
      }
      i--; // for-loop will increment

      html += "<table class=\"md-table\"><thead><tr>";
      for (const cell of headerCells) {
        html += `<th>${cell}</th>`;
      }
      html += "</tr></thead><tbody>";
      for (const row of bodyRows) {
        html += "<tr>";
        for (const cell of row) {
          html += `<td>${cell}</td>`;
        }
        html += "</tr>";
      }
      html += "</tbody></table>";
      continue;
    }
    if (/^#{3}\s+/.test(line)) {
      closeLists();
      html += `<h3>${line.replace(/^#{3}\s+/, "")}</h3>`;
      continue;
    }
    if (/^#{2}\s+/.test(line)) {
      closeLists();
      html += `<h2>${line.replace(/^#{2}\s+/, "")}</h2>`;
      continue;
    }
    if (/^#\s+/.test(line)) {
      closeLists();
      html += `<h1>${line.replace(/^#\s+/, "")}</h1>`;
      continue;
    }
    if (/^(\*|-|•)\s+/.test(line)) {
      if (!inUl) {
        closeLists();
        html += "<ul>";
        inUl = true;
      }
      html += `<li>${line.replace(/^(\*|-|•)\s+/, "")}</li>`;
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (!inOl) {
        closeLists();
        html += "<ol>";
        inOl = true;
      }
      html += `<li>${line.replace(/^\d+\.\s+/, "")}</li>`;
      continue;
    }
    if (line.trim() === "") {
      closeLists();
      html += "<br />";
      continue;
    }
    closeLists();
    html += `<p>${line}</p>`;
  }

  closeLists();
  return html;
}

export default function Home() {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [inputNudge, setInputNudge] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const chatBoxRef = useRef(null);
  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId),
    [chats, activeChatId]
  );
  const hasMessages = (activeChat?.messages || []).length > 0;

  useEffect(() => {
    if (!chatBoxRef.current) return;
    const container = chatBoxRef.current;
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [activeChat?.messages?.length]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const chatId = activeChatId || `chat-${Date.now()}`;
    const nextChat = activeChat || { id: chatId, title: text, messages: [] };
    const nextMessages = [...nextChat.messages, { who: "user", text }];
    const nextChats = chats.filter((chat) => chat.id !== chatId);
    setChats([{ ...nextChat, messages: nextMessages }, ...nextChats]);
    setActiveChatId(chatId);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      const updatedMessages = [
        ...nextMessages,
        { who: "ai", text: data.reply || "No response" },
      ];
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId ? { ...chat, messages: updatedMessages } : chat
        )
      );
      setInputNudge(true);
    } catch (err) {
      const updatedMessages = [
        ...nextMessages,
        { who: "ai", text: "Server error" },
      ];
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId ? { ...chat, messages: updatedMessages } : chat
        )
      );
      setInputNudge(true);
    } finally {
      setLoading(false);
      setTimeout(() => setInputNudge(false), 300);
    }
  }

  function startNewChat() {
    setActiveChatId(null);
    setInput("");
    setInputNudge(false);
    setShowHistory(false);
  }

  return (
    <div className="main">
      <aside className="sidebar">
        <div className="brand">
          <h1>FinLending</h1>
          <button className="btn primary" onClick={startNewChat}>
            New
          </button>
        </div>

        <div>
          <div className="history-header">
            <p style={{ color: "var(--muted)", fontSize: 12, letterSpacing: 2 }}>
              Chat History
            </p>
            <button
              className="history-toggle"
              onClick={() => setShowHistory((prev) => !prev)}
            >
              {showHistory ? "^" : "v"}
            </button>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 12,
            }}
          >
            {chats.length === 0 ? (
              <div className="card" style={{ color: "var(--muted)", fontSize: 12 }}>
                No chats yet
              </div>
            ) : !showHistory ? (
              <button className="btn" onClick={() => setShowHistory(true)}>
                Show history
              </button>
            ) : (
              chats.map((chat) => (
                <button
                  key={chat.id}
                  className="card"
                  style={{
                    textAlign: "left",
                    cursor: "pointer",
                    borderColor:
                      chat.id === activeChatId
                        ? "var(--accent)"
                        : "var(--border)",
                  }}
                  onClick={() => {
                    setActiveChatId(chat.id);
                    setShowHistory(true);
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{chat.title}</div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="card footer-card">
          <div style={{ color: "var(--accent)", fontSize: 12 }}>o</div>
          <div style={{ marginTop: 6, fontWeight: 600 }}>Free Trial Active</div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
            Your team's free trial ends in 29 days. Contact your owner.
          </div>
        </div>
      </aside>

      <main className="main-area">
        <section className="hero">
          <h2>Hello there!</h2>
          <p>How can I help you FinLending today?</p>
          {hasMessages ? (
            <div className="chat-box" ref={chatBoxRef}>
              {(activeChat?.messages || []).map((msg, index) => (
                <div
                  key={`${msg.who}-${index}`}
                  className={`bubble ${msg.who === "user" ? "user" : "ai"}`}
                >
                  {msg.who === "ai" ? (
                    <div
                      className="ai-content"
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(msg.text || ""),
                      }}
                    />
                  ) : (
                    msg.text
                  )}
                </div>
              ))}
              {loading ? <div className="bubble">Thinking...</div> : null}
            </div>
          ) : null}
          <div className={`input-bar ${inputNudge ? "input-nudge" : ""}`}>
            <input
              value={input}
              placeholder="Ask anything"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") sendMessage();
              }}
            />
            <button onClick={sendMessage} disabled={loading}>
              Send
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
