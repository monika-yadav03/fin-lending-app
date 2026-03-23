export const runtime = "nodejs";

function getAzureConfig() {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  const apiVersion =
    process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";

  if (!apiKey || !endpoint || !deployment) {
    return null;
  }

  return {
    apiKey,
    endpoint: endpoint.replace(/\/+$/, ""),
    deployment,
    apiVersion,
  };
}

export function getConfiguredProvider() {
  return getAzureConfig();
}

function getContentText(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item?.type === "text") {
          return item.text || "";
        }

        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

async function runAzureChat(messages) {
  const config = getAzureConfig();

  if (!config) {
    const error = new Error("Server not configured");
    error.statusCode = 500;
    throw error;
  }

  const response = await fetch(
    `${config.endpoint}/openai/deployments/${config.deployment}/chat/completions?api-version=${config.apiVersion}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": config.apiKey,
      },
      body: JSON.stringify({
        messages,
        temperature: 0.7,
        max_tokens: 800,
      }),
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      data?.error?.message || `Azure OpenAI request failed with ${response.status}`,
    );
    error.statusCode = response.status;
    error.details = data?.error;
    throw error;
  }

  const replyText = getContentText(data?.choices?.[0]?.message?.content);

  if (!replyText) {
    const error = new Error("No response from AI");
    error.statusCode = 502;
    throw error;
  }

  return replyText;
}

export async function generateReply({
  promptText,
  systemPrompt,
}) {
  return runAzureChat([
    { role: "system", content: systemPrompt.trim() },
    { role: "user", content: promptText.trim() },
  ]);
}

export async function runHealthCheck() {
  return runAzureChat([
    {
      role: "system",
      content: "You are a health check assistant. Reply with OK only.",
    },
    {
      role: "user",
      content: "Health check",
    },
  ]);
}
