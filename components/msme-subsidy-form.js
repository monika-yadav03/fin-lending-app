async function handleSend() {
  if (!input.trim() || loading) return;

  const text = input.trim();

  const updatedMessages = [...messages, { role: "user", content: text }];

  setMessages(updatedMessages);
  setInput("");
  setLoading(true);

  try {
    const res = await fetch("/api/msme-subsidy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: text,
        history: updatedMessages,
        threadId: null,
        conversationId: null,
      }),
    });

    const raw = await res.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      data = {
        error: raw || "Backend call failure",
      };
    }

    if (!res.ok) {
      throw new Error(data?.error || "Something went wrong.");
    }

    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: data?.reply || "No response returned.",
      },
    ]);
  } catch (error) {
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content:
          error instanceof Error
            ? error.message
            : "Unable to respond right now.",
      },
    ]);
  } finally {
    setLoading(false);
  }
}
