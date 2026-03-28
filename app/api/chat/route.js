import { generateReplyWithSource } from "./provider";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const message = body?.message;
    const conversationId = body?.conversationId;
    const history = Array.isArray(body?.history) ? body.history : [];

    if (!message || typeof message !== "string" || !message.trim()) {
      return Response.json({ reply: "Please enter a valid message." }, { status: 400 });
    }

    const { reply, source, conversationId: nextConversationId } =
      await generateReplyWithSource({
        conversationId,
        history,
        userMessage: message,
      });

    console.log("Chat response source", { source });

    return Response.json({
      reply,
      source,
      conversationId: nextConversationId,
    });
  } catch (error) {
    const errName = error?.name || "UnknownError";
    const errMessage = error?.message || "Unknown error";
    const errCode = error?.statusCode;

    console.log("Azure Foundry agent error", {
      name: errName,
      message: errMessage,
      httpStatusCode: errCode,
    });

    return Response.json(
      {
        reply:
          errCode || errMessage
            ? `AI error: ${errMessage}${errCode ? ` (${errCode})` : ""}`
            : "AI error",
        error: {
          name: errName,
          message: errMessage,
          httpStatusCode: errCode,
        },
      },
      { status: Number(errCode) || 500 }
    );
  }
}
