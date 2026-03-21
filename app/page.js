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
  const cleaned = text.replace(/\*\*/g, "");
  const lines = cleaned.split(/\r?\n/);
  let html = "";
  let inUl = false;
  let inOl = false;
  const labelMatch =
    /^(Summary|Key Points|Risks\/Assumptions|Risks|Assumptions|Next Steps|Table)\s*:\s*(.*)$/i;

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
    const safeLine = escapeHtml(line);

    if (
      isTableRow(line) &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      closeLists();
      const headerCells = parseRow(line);
      i += 2; // skip separator
      const bodyRows = [];
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        isTableRow(lines[i])
      ) {
        bodyRows.push(parseRow(lines[i]));
        i++;
      }
      i--; // for-loop will increment

      html += '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
      for (const cell of headerCells) {
        html += `<th>${cell}</th>`;
      }
      html += "</tr></thead><tbody>";
      for (const row of bodyRows) {
        html += "<tr>";
        for (let c = 0; c < row.length; c++) {
          const cell = row[c];
          const label = headerCells[c] || "";
          html += `<td data-label="${label}">${cell}</td>`;
        }
        html += "</tr>";
      }
      html += "</tbody></table></div>";
      continue;
    }
    if (/^#{3}\s+/.test(line)) {
      closeLists();
      html += `<h3>${escapeHtml(line.replace(/^#{3}\s+/, ""))}</h3>`;
      continue;
    }
    if (/^#{2}\s+/.test(line)) {
      closeLists();
      html += `<h2>${escapeHtml(line.replace(/^#{2}\s+/, ""))}</h2>`;
      continue;
    }
    if (/^#\s+/.test(line)) {
      closeLists();
      html += `<h1>${escapeHtml(line.replace(/^#\s+/, ""))}</h1>`;
      continue;
    }
    if (/^(\*|-|•)\s+/.test(line)) {
      if (!inUl) {
        closeLists();
        html += "<ul>";
        inUl = true;
      }
      html += `<li>${escapeHtml(line.replace(/^(\*|-|•)\s+/, ""))}</li>`;
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (!inOl) {
        closeLists();
        html += "<ol>";
        inOl = true;
      }
      html += `<li>${escapeHtml(line.replace(/^\d+\.\s+/, ""))}</li>`;
      continue;
    }
    if (line.trim() === "") {
      closeLists();
      html += "<br />";
      continue;
    }
    closeLists();
    const labelParts = line.match(labelMatch);
    if (labelParts) {
      const label = escapeHtml(labelParts[1]);
      const rest = escapeHtml(labelParts[2] || "");
      html += `<p><span class="md-label">${label}:</span> ${rest}</p>`;
    } else {
      html += `<p>${safeLine}</p>`;
    }
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [listening, setListening] = useState(false);
  const fileInputRef = useRef(null);
  const chatBoxRef = useRef(null);
  const speechRef = useRef(null);
  const inputRef = useRef(null);
  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId),
    [chats, activeChatId],
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
    const previousMessages = nextChat.messages;
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
        body: JSON.stringify({
          message: text,
          history: previousMessages,
        }),
      });
      const data = await res.json();
      const updatedMessages = [
        ...nextMessages,
        { who: "ai", text: data.reply || "No response" },
      ];
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId ? { ...chat, messages: updatedMessages } : chat,
        ),
      );
      setInputNudge(true);
    } catch (err) {
      const updatedMessages = [
        ...nextMessages,
        { who: "ai", text: "Server error" },
      ];
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId ? { ...chat, messages: updatedMessages } : chat,
        ),
      );
      setInputNudge(true);
    } finally {
      setLoading(false);
      setTimeout(() => setInputNudge(false), 300);
    }
  }

  function toggleVoiceInput() {
    const SpeechRecognition =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SpeechRecognition) {
      setInput("Voice input not supported in this browser.");
      return;
    }

    if (listening && speechRef.current) {
      speechRef.current.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput((prev) => {
        const base = prev && !prev.includes("Voice input not supported")
          ? prev.replace(/\s+$/, "")
          : "";
        return base ? `${base} ${transcript}` : transcript;
      });
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    speechRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function startNewChat() {
    setActiveChatId(null);
    setInput("");
    setInputNudge(false);
    setShowHistory(false);
  }

  const suggestedPrompts = [
    "Best loan options for CIBIL 680?",
    "Home loan vs LAP: what is better?",
    "Need ₹20L business loan, turnover ₹60L",
    "Compare NBFC vs bank for quick approval",
  ];

  return (
    <div className="main">
      <aside className={`sidebar ${sidebarOpen ? "open" : "collapsed"}`}>
        <div className="brand">
          <h1>FinLending</h1>
          <button
            className="new-chat-btn"
            onClick={startNewChat}
            aria-label="New chat"
            type="button"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 20h4l11-11-4-4L4 16v4zm13.7-13.7-4-4 1.4-1.4a1 1 0 0 1 1.4 0l2.6 2.6a1 1 0 0 1 0 1.4l-1.4 1.4z" />
            </svg>
          </button>
        </div>

        <div>
          <div className="history-header">
            <p
              style={{ color: "var(--muted)", fontSize: 12, letterSpacing: 2 }}
            >
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
              <div
                className="card"
                style={{ color: "var(--muted)", fontSize: 12 }}
              >
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
      </aside>

      <main
        className={`main-area ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}
      >
        <button
          className="sidebar-toggle"
          type="button"
          aria-label="Toggle sidebar"
          onClick={() => setSidebarOpen((prev) => !prev)}
        >
          <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M9 5v14" />
          </svg>
        </button>
        <section className="hero">
          <h2>Hello there!</h2>
          <p>How can I help you FinLending today?</p>
          {!hasMessages ? (
            <div className="suggested">
              <p className="suggested-title">Try one of these</p>
              <div className="suggested-grid">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    className="suggested-card"
                    type="button"
                    onClick={() => {
                      setInput(prompt);
                      inputRef.current?.focus();
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
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
          <div
            className={`input-bar ${inputNudge ? "input-nudge" : ""} ${
              hasMessages ? "" : "input-bar-start"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="file-input"
              aria-hidden="true"
              tabIndex={-1}
            />
            <button
              className="icon-btn"
              type="button"
              aria-label="Attach file"
              onClick={() => fileInputRef.current?.click()}
            >
              <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
                <path d="M11 4h2v16h-2zM4 11h16v2H4z" />
              </svg>
            </button>
            <input
              ref={inputRef}
              value={input}
              placeholder="Ask anything"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") sendMessage();
              }}
            />
            <div className="input-actions">
              <button
                className={`icon-btn ${listening ? "icon-btn-active" : ""}`}
                type="button"
                aria-label="Voice"
                onClick={toggleVoiceInput}
              >
                <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
                  <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm-5 9a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.93V21h-2v-2.07A7 7 0 0 1 5 12h2z" />
                </svg>
              </button>
              <button
                className="send-btn"
                onClick={sendMessage}
                disabled={loading}
                aria-label="Send"
              >
                <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
                  <path d="M3.4 20.4l17.6-8.4L3.4 3.6l-.4 7 10 1.4-10 1.4.4 7z" />
                </svg>
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
