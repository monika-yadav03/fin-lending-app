import { NextResponse } from "next/server";

import { getSessionFromCookies } from "../../../lib/auth";
import { generateReplyWithSource } from "../chat/provider";

export const runtime = "nodejs";

const MSME_AGENT_CONFIG = {
  configLabel: "MSME subsidy agent",
  projectEndpointEnvNames: [
    "AZURE_AI_MSME_PROJECT_ENDPOINT",
    "AZURE_AI_PROJECT_ENDPOINT",
    "AZURE_EXISTING_AIPROJECT_ENDPOINT",
  ],
  agentIdEnvNames: [
    "AZURE_AI_MSME_AGENT_ID",
    "AZURE_AI_AGENT_ID",
    "AZURE_EXISTING_AGENT_ID",
  ],
  agentNameEnvNames: [
    "AZURE_AI_MSME_AGENT_NAME",
    "AZURE_AI_AGENT_NAME",
  ],
  agentVersionEnvNames: [
    "AZURE_AI_MSME_AGENT_VERSION",
    "AZURE_AI_AGENT_VERSION",
  ],
};

function normalizeError(error) {
  const statusCode =
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
      ? error.statusCode
      : typeof error === "object" &&
          error !== null &&
          "status" in error &&
          typeof error.status === "number"
        ? error.status
        : 500;

  return {
    statusCode,
    message:
      error instanceof Error && error.message
        ? error.message
        : "Unable to complete the MSME subsidy request.",
  };
}

export async function POST(request) {
  const session = await getSessionFromCookies();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const message = String(body?.message || "").trim();

    if (!message) {
      return NextResponse.json(
        { error: "Please provide business details to continue." },
        { status: 400 },
      );
    }

    const { reply, conversationId } = await generateReplyWithSource({
      userMessage: message,
      conversationId: String(body?.conversationId || body?.threadId || "").trim() || null,
      history: Array.isArray(body?.history) ? body.history : [],
      configOptions: MSME_AGENT_CONFIG,
    });

    return NextResponse.json({
      reply,
      threadId: conversationId || null,
      conversationId: conversationId || null,
      provider: "azure_foundry_agent_msme",
    });
  } catch (error) {
    const normalized = normalizeError(error);

    return NextResponse.json(
      { error: normalized.message },
      { status: normalized.statusCode },
    );
  }
}
