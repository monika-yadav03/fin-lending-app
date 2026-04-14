"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const safeLine = escapeHtml(line);

    if (
      isTableRow(line) &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      closeLists();
      const headerCells = parseRow(line);
      i += 2;
      const bodyRows = [];
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        isTableRow(lines[i])
      ) {
        bodyRows.push(parseRow(lines[i]));
        i += 1;
      }
      i -= 1;

      html += '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
      for (const cell of headerCells) {
        html += `<th>${cell}</th>`;
      }
      html += "</tr></thead><tbody>";
      for (const row of bodyRows) {
        html += "<tr>";
        for (let c = 0; c < row.length; c += 1) {
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

export default function FinLendingApp({ phoneNumber = "" }) {
  const router = useRouter();
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [inputNudge, setInputNudge] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [listening, setListening] = useState(false);
  const chatBoxRef = useRef(null);
  const speechRef = useRef(null);
  const inputRef = useRef(null);
  const profileMenuRef = useRef(null);
  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId),
    [chats, activeChatId],
  );
  const hasMessages = (activeChat?.messages || []).length > 0;
  const isMobileRef = useRef(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const syncSidebarState = (event) => {
      const isMobile = event.matches;
      isMobileRef.current = isMobile;
      setSidebarOpen(!isMobile);
      setShowHistory(!isMobile);
    };

    syncSidebarState(mediaQuery);

    const handleChange = (event) => syncSidebarState(event);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", handleChange);
      } else if (typeof mediaQuery.removeListener === "function") {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!profileMenuRef.current?.contains(event.target)) {
        setProfileOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!chatBoxRef.current) {
      return;
    }

    const container = chatBoxRef.current;
    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [activeChat?.messages?.length]);

  async function sendMessage(options = {}) {
    const text = String(options.backendText ?? input).trim();
    const visibleText = String(options.visibleText ?? text).trim();
    if (!text || loading) {
      return;
    }

    const chatId = activeChatId || `chat-${Date.now()}`;
    const nextChat = activeChat || {
      id: chatId,
      title: visibleText,
      messages: [],
      conversationId: null,
    };
    const previousMessages = nextChat.messages;
    const nextMessages = [
      ...nextChat.messages,
      { who: "user", text: visibleText },
    ];
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
          threadId: nextChat.conversationId || null,
          conversationId: nextChat.conversationId || null,
          message: text,
          history: previousMessages,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || data?.reply || "Server error");
      }
      const updatedMessages = [
        ...nextMessages,
        {
          who: "ai",
          text:
            data?.reply ||
            data?.error ||
            "The assistant did not return a reply.",
        },
      ];
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: updatedMessages,
                conversationId:
                  data.conversationId ||
                  data.threadId ||
                  chat.conversationId ||
                  null,
              }
            : chat,
        ),
      );
      if (isMobileRef.current) {
        setSidebarOpen(false);
      }
      setInputNudge(true);
    } catch (error) {
      const updatedMessages = [
        ...nextMessages,
        {
          who: "ai",
          text: error?.message || "Server error",
        },
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
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      setInput((prev) => {
        const base =
          prev && !prev.includes("Voice input not supported")
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
    setShowHistory(!isMobileRef.current);
    if (isMobileRef.current) {
      setSidebarOpen(false);
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const productOptions = [
    "Loan Against Property (LAP)",
    "Home Loan",
    "Business Loan",
    "Working Capital Limit CGTMSE",
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

        <div className="sidebar-shortcuts">
          <Link href="/msme-subsidy" className="sidebar-nav-item">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 20V8l8-4 8 4v12" />
              <path d="M9 20v-4h6v4" />
              <path d="M9 10h.01" />
              <path d="M9 13h.01" />
              <path d="M15 10h.01" />
              <path d="M15 13h.01" />
            </svg>
            <span>MSME Subsidy Agent</span>
          </Link>
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
              type="button"
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
                    if (isMobileRef.current) {
                      setSidebarOpen(false);
                    }
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
        <div
          className="profile-menu profile-menu-floating"
          ref={profileMenuRef}
        >
          <button
            className="profile-trigger"
            type="button"
            aria-label="Open profile menu"
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((prev) => !prev)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
              <path d="M5 20a7 7 0 0 1 14 0" />
            </svg>
          </button>
          <div
            className={`profile-dropdown ${profileOpen ? "open" : ""}`}
            role="menu"
          >
            <div className="profile-dropdown-label">
              <span>Signed in</span>
              <strong>{phoneNumber || "Verified user"}</strong>
            </div>
            <button
              className="profile-dropdown-item"
              type="button"
              role="menuitem"
              onClick={logout}
            >
              Logout
            </button>
          </div>
        </div>
        <section className="hero">
          <h2>Hello there!</h2>
          <p>How can I help you FinLending today?</p>
          {!hasMessages ? (
            <div className="suggested">
              <p className="suggested-title">CHOOSE THE PRODUCT</p>
              <div className="suggested-grid">
                {productOptions.map((product) => (
                  <button
                    key={product}
                    className="suggested-card"
                    type="button"
                    onClick={() =>
                      sendMessage({
                        backendText: `I have selected ${product}. Please start the data collection process.`,
                        visibleText: product,
                      })
                    }
                  >
                    {product}
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
              {loading ? <div className="bubble">Analyzing</div> : null}
            </div>
          ) : null}
          <div
            className={`input-bar ${inputNudge ? "input-nudge" : ""} ${
              hasMessages ? "" : "input-bar-start"
            }`}
          >
            <input
              ref={inputRef}
              value={input}
              placeholder="Ask anything"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  sendMessage();
                }
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
