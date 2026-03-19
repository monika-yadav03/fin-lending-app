import {
  BedrockAgentRuntimeClient,
  RetrieveAndGenerateCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";

export const runtime = "nodejs";

function getBedrockClient() {
  return new BedrockAgentRuntimeClient({
    region: process.env.FIN_REGION,
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const message = body?.message;

    if (!message || typeof message !== "string") {
      return Response.json({ reply: "Message is required" }, { status: 400 });
    }
    if (message.length > 2000) {
      return Response.json({ reply: "Message too long" }, { status: 400 });
    }
    if (!process.env.KNOWLEDGE_BASE_ID || !process.env.MODEL_ARN) {
      return Response.json({ reply: "Server not configured" }, { status: 500 });
    }

    const systemPrompt = `
You are a financial expert for Indian users (RBI, INR, banks/NBFCs context).

Answer strictly based on the user's question and intent.
Give clear, specific, and unique responses every time.

Rules:
- Do not repeat or use templated answers
- Do not guess missing information; ask 1 clarification if needed
- Avoid time-sensitive claims; suggest user to verify if required
- No legal, tax, or investment advice
- Keep responses natural and human-like (like ChatGPT)

Format in Markdown:
- Summary (2-3 lines)
- Key Points (bullets)
- Risks/Assumptions (if relevant)
- Next Steps (bullets)
- Table (ONLY if it directly helps answer the question; otherwise omit)
`;
    const promptText = `
${systemPrompt}

User Question: ${message}
`;

    const command = new RetrieveAndGenerateCommand({
      input: { text: promptText },
      retrieveAndGenerateConfiguration: {
        type: "KNOWLEDGE_BASE",
        knowledgeBaseConfiguration: {
          knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID,
          modelArn: process.env.MODEL_ARN,
        },
      },
    });

    const response = await getBedrockClient().send(command);
    const replyText = response?.output?.text;

    if (!replyText) {
      return Response.json({ reply: "No response from AI" }, { status: 502 });
    }

    return Response.json({ reply: replyText });
  } catch (error) {
    const errName = error?.name || "UnknownError";
    const errMessage = error?.message || "Unknown error";
    const errCode = error?.$metadata?.httpStatusCode;
    const errRequestId = error?.$metadata?.requestId;
    console.log("Bedrock error", {
      name: errName,
      message: errMessage,
      httpStatusCode: errCode,
      requestId: errRequestId,
    });
    return Response.json(
      {
        reply: "AI error",
        error: {
          name: errName,
          message: errMessage,
          httpStatusCode: errCode,
          requestId: errRequestId,
        },
      },
      { status: 500 },
    );
  }
}
