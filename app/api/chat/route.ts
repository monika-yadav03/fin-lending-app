import { NextResponse } from "next/server";
import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import "@azure/openai/types";
import { AzureOpenAI } from "openai";

import { getSessionFromCookies } from "../../../lib/auth";
import { generateReplyWithSource, getConfiguredProvider } from "./provider";

export const runtime = "nodejs";

const DEFAULT_API_VERSION = "2024-08-01-preview";
const DEFAULT_POLL_INTERVAL_MS = 1500;
const DEFAULT_MAX_POLL_ATTEMPTS = 60;
const MESSAGE_LOOKUP_ATTEMPTS = 5;
const AZURE_SCOPE = "https://cognitiveservices.azure.com/.default";

let cachedClient: AzureOpenAI | null = null;
let cachedClientKey = "";

type ChatRequestBody = {
  message?: string;
  threadId?: string | null;
  conversationId?: string | null;
  history?: Array<{ who?: string; text?: string }>;
};

function readEnv(name: string) {
  return String(process.env[name] || "").trim();
}

function normalizeAzureEndpoint(endpoint: string) {
  return endpoint
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/openai\/v1$/i, "")
    .replace(/\/openai$/i, "");
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createConfigError(message: string) {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = 500;
  return error;
}

function getClient() {
  const endpoint = normalizeAzureEndpoint(readEnv("AZURE_OPENAI_ENDPOINT"));
  const apiVersion = readEnv("AZURE_OPENAI_API_VERSION") || DEFAULT_API_VERSION;
  const apiKey = readEnv("AZURE_OPENAI_API_KEY");

  if (!endpoint) {
    throw createConfigError(
      "AZURE_OPENAI_ENDPOINT is missing. Set it in your environment before using the chat route.",
    );
  }

  const cacheKey = `${endpoint}|${apiVersion}|${apiKey ? "api-key" : "entra-id"}`;
  if (cachedClient && cachedClientKey === cacheKey) {
    return cachedClient;
  }

  cachedClient =
    apiKey.length > 0
      ? new AzureOpenAI({
          endpoint,
          apiKey,
          apiVersion,
          maxRetries: 2,
        })
      : new AzureOpenAI({
          endpoint,
          apiVersion,
          azureADTokenProvider: getBearerTokenProvider(
            new DefaultAzureCredential(),
            AZURE_SCOPE,
          ),
          maxRetries: 2,
        });

  cachedClientKey = cacheKey;
  return cachedClient;
}

async function ensureThread(
  client: AzureOpenAI,
  incomingThreadId?: string | null,
  incomingConversationId?: string | null,
) {
  const trimmedThreadId = String(incomingThreadId || incomingConversationId || "").trim();

  if (trimmedThreadId) {
    return trimmedThreadId;
  }

  const thread = await client.beta.threads.create();
  return thread.id;
}

async function pollRunUntilComplete(
  client: AzureOpenAI,
  threadId: string,
  runId: string,
) {
  for (let attempt = 0; attempt < DEFAULT_MAX_POLL_ATTEMPTS; attempt += 1) {
    const run = await client.beta.threads.runs.retrieve(runId, {
      thread_id: threadId,
    });

    switch (run.status) {
      case "queued":
      case "in_progress":
      case "cancelling":
        await wait(DEFAULT_POLL_INTERVAL_MS);
        continue;

      case "completed":
        return run;

      case "requires_action":
        throw new Error(
          "The assistant requested tool outputs. This route currently supports completed text responses only.",
        );

      case "failed":
        throw new Error(run.last_error?.message || "The assistant run failed.");

      case "expired":
        throw new Error("The assistant run expired before completion.");

      case "cancelled":
        throw new Error("The assistant run was cancelled.");

      case "incomplete":
        throw new Error("The assistant run completed without a final answer.");

      default:
        throw new Error(`Unexpected run status: ${run.status}`);
    }
  }

  throw new Error("Timed out while waiting for the assistant response.");
}

function extractTextFromMessageContent(content: unknown) {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (
        part &&
        typeof part === "object" &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        part.text &&
        typeof part.text === "object" &&
        "value" in part.text &&
        typeof part.text.value === "string"
      ) {
        return part.text.value.trim();
      }

      return "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

async function getLatestAssistantReply(
  client: AzureOpenAI,
  threadId: string,
  runId: string,
) {
  for (let attempt = 0; attempt < MESSAGE_LOOKUP_ATTEMPTS; attempt += 1) {
    const page = await client.beta.threads.messages.list(threadId, {
      order: "desc",
      limit: 20,
      run_id: runId,
    });

    const assistantMessage = page.data.find((message) => message.role === "assistant");
    const extractedText = extractTextFromMessageContent(assistantMessage?.content);

    if (extractedText) {
      return extractedText;
    }

    await wait(500);
  }

  throw new Error(
    "The run finished, but no assistant message was available to return to the client.",
  );
}

function normalizeError(error: unknown) {
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

  const rawMessage =
    error instanceof Error && error.message
      ? error.message
      : "Unable to complete the AI request.";

  const message =
    /ownership verification failure/i.test(rawMessage) &&
    /same AOAI resource/i.test(rawMessage)
      ? "The configured Azure OpenAI assistant is referencing files or vector stores that belong to a different Azure OpenAI resource. Re-upload those files on the same resource as AZURE_OPENAI_ENDPOINT and recreate the assistant there, or remove AZURE_OPENAI_ASSISTANT_ID to use the Azure Foundry agent configuration instead."
      : rawMessage;

  return {
    statusCode,
    message,
  };
}

function hasAssistantsConfig() {
  return Boolean(
    normalizeAzureEndpoint(readEnv("AZURE_OPENAI_ENDPOINT")) &&
      readEnv("AZURE_OPENAI_ASSISTANT_ID"),
  );
}

async function handleFoundryFallback(body: ChatRequestBody) {
  const { reply, conversationId } = await generateReplyWithSource({
    userMessage: String(body?.message || "").trim(),
    conversationId: String(body?.conversationId || body?.threadId || "").trim() || null,
    history: Array.isArray(body?.history) ? body.history : [],
  });

  return NextResponse.json({
    reply,
    threadId: conversationId || null,
    conversationId: conversationId || null,
    provider: "azure_foundry_agent",
  });
}

export async function POST(request: Request) {
  const session = await getSessionFromCookies();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as ChatRequestBody;
    const message = String(body?.message || "").trim();
    const assistantId = readEnv("AZURE_OPENAI_ASSISTANT_ID");

    if (!message) {
      return NextResponse.json(
        { error: "Please provide a message to continue the conversation." },
        { status: 400 },
      );
    }

    if (getConfiguredProvider() === "azure_foundry_agent") {
      return await handleFoundryFallback(body);
    }

    if (!hasAssistantsConfig()) {
      return await handleFoundryFallback(body);
    }

    if (!assistantId) {
      throw createConfigError(
        "AZURE_OPENAI_ASSISTANT_ID is missing. Add your assistant ID before using this route.",
      );
    }

    const client = getClient();
    const threadId = await ensureThread(
      client,
      body?.threadId,
      body?.conversationId,
    );

    await client.beta.threads.messages.create(threadId, {
      role: "user",
      content: message,
    });

    const run = await client.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
    });

    const completedRun = await pollRunUntilComplete(client, threadId, run.id);
    const reply = await getLatestAssistantReply(client, threadId, completedRun.id);

    return NextResponse.json({
      reply,
      threadId,
      conversationId: threadId,
      provider: "azure_openai_assistants",
    });
  } catch (error) {
    const normalized = normalizeError(error);

    return NextResponse.json(
      {
        error: normalized.message,
      },
      { status: normalized.statusCode },
    );
  }
}
