"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MarkdownContent from "./markdown-content";

export default function MsmeSubsidyForm({ phoneNumber = "" }) {
  const router = useRouter();

  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [showHistory, setShowHistory] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);

  const chatBoxRef = useRef(null);
  const profileMenuRef = useRef(null);
  const isMobileRef = useRef(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");

    const sync = (event) => {
      const mobile = event.matches;
      isMobileRef.current = mobile;
      setSidebarOpen(!mobile);
      setShowHistory(!mobile);
    };

    sync(mediaQuery);

    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!chatBoxRef.current) return;

    chatBoxRef.current.scrollTo({
      top: chatBoxRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  useEffect(() => {
    function closeOutside(event) {
      if (!profileMenuRef.current?.contains(event.target)) {
        setProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, []);

  function addMessage(role, content) {
    setMessages((prev) => [...prev, { role, content }]);
  }

  function startNewChat() {
    setMessages([]);
    setConversationId(null);
    setInput("");
  }

  async function handleSend() {
    if (!input.trim() || loading) return;

    const text = input.trim();
    const previousMessages = messages;
    addMessage("user", text);
    setInput("");

    try {
      setLoading(true);

      const res = await fetch("/api/msme-subsidy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          history: previousMessages,
          threadId: conversationId || null,
          conversationId: conversationId || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Something went wrong.");
      }

      addMessage("assistant", data?.reply || "No response returned.");
      setConversationId(
        data?.conversationId || data?.threadId || conversationId || null,
      );
    } catch (error) {
      addMessage(
        "assistant",
        error instanceof Error ? error.message : "Unable to respond right now.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="main">
      <aside className={`sidebar ${sidebarOpen ? "open" : "collapsed"}`}>
        <div className="brand">
          <h1>FinLending</h1>

          <button
            className="new-chat-btn"
            type="button"
            onClick={startNewChat}
          >
            +
          </button>
        </div>

        <div className="sidebar-shortcuts">
          <Link href="/msme-subsidy" className="sidebar-nav-item">
            <span>MSME Subsidy Agent</span>
          </Link>

          <Link href="/dashboard" className="sidebar-nav-item">
            <span>Loan Agent</span>
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
            >
              {showHistory ? "^" : "v"}
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            <div
              className="card"
              style={{ color: "var(--muted)", fontSize: 12 }}
            >
              No chats yet
            </div>
          </div>
        </div>
      </aside>

      <main
        className={`main-area ${
          sidebarOpen ? "sidebar-open" : "sidebar-collapsed"
        }`}
      >
        <button
          className="sidebar-toggle"
          type="button"
          onClick={() => setSidebarOpen((prev) => !prev)}
        >
          ☰
        </button>

        <div
          className="profile-menu profile-menu-floating"
          ref={profileMenuRef}
        >
          <button
            className="profile-trigger"
            type="button"
            onClick={() => setProfileOpen((prev) => !prev)}
          >
            👤
          </button>

          <div className={`profile-dropdown ${profileOpen ? "open" : ""}`}>
            <div className="profile-dropdown-label">
              <span>Signed in</span>
              <strong>{phoneNumber || "Verified user"}</strong>
            </div>

            <button
              className="profile-dropdown-item"
              type="button"
              onClick={logout}
            >
              Logout
            </button>
          </div>
        </div>

        <section className="hero">
          {!hasMessages ? (
            <>
              <h2>Hello there!</h2>
              <p>How can I help you with MSME Subsidy today?</p>
            </>
          ) : (
            <div className="chat-box" ref={chatBoxRef}>
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`bubble ${msg.role === "user" ? "user" : "ai"}`}
                >
                  <MarkdownContent text={msg.content} />
                </div>
              ))}

              {loading && <div className="bubble ai">Analyzing...</div>}
            </div>
          )}

          <div className={`input-bar ${hasMessages ? "" : "input-bar-start"}`}>
            <input
              value={input}
              placeholder="Ask anything"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
            />

            <div className="input-actions">
              <button
                className="send-btn"
                onClick={handleSend}
                disabled={loading}
              >
                ➤
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
