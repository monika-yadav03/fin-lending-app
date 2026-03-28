import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";
import { existsSync } from "node:fs";

let cachedProjectClient = null;
let cachedOpenAIClient = null;
let cachedProjectEndpoint = "";

function ensureAzureCliOnPath() {
  if (process.platform !== "win32") {
    return;
  }

  const currentPath = String(process.env.PATH || "");
  const candidates = [
    "C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin",
    "C:\\Program Files (x86)\\Microsoft SDKs\\Azure\\CLI2\\wbin",
  ];
  const missingCandidates = candidates.filter(
    (candidate) => existsSync(candidate) && !currentPath.includes(candidate)
  );

  if (missingCandidates.length === 0) {
    return;
  }

  process.env.PATH = [currentPath, ...missingCandidates].filter(Boolean).join(";");
}

function trimTrailingSlash(value = "") {
  return String(value).replace(/\/+$/, "");
}

function cleanEnvValue(value) {
  const normalized = String(value || "").trim();
  return normalized ? normalized : "";
}

function isHostedInAzure() {
  return Boolean(
    cleanEnvValue(process.env.WEBSITE_SITE_NAME) ||
      cleanEnvValue(process.env.WEBSITE_INSTANCE_ID) ||
      cleanEnvValue(process.env.AzureWebJobsStorage) ||
      cleanEnvValue(process.env.IDENTITY_ENDPOINT)
  );
}

function isStaticWebAppsRuntime() {
  return Boolean(
    cleanEnvValue(process.env.SWA_CLI_DEPLOYMENT_TOKEN) ||
      cleanEnvValue(process.env.SWA_RUNTIME_CONFIG) ||
      cleanEnvValue(process.env.STATIC_WEB_APP) ||
      (isHostedInAzure() && cleanEnvValue(process.env.WEBSITE_HOSTNAME).includes(".azurestaticapps.net"))
  );
}

function createConfigError(message) {
  const error = new Error(message);
  error.name = "ConfigError";
  error.statusCode = 500;
  return error;
}

function parseAgentIdentifier(value) {
  const raw = cleanEnvValue(value);

  if (!raw) {
    return { name: "", version: "" };
  }

  const [name, version = ""] = raw.split(":");
  return {
    name: cleanEnvValue(name),
    version: cleanEnvValue(version),
  };
}

function getFoundryConfig() {
  const projectEndpoint = trimTrailingSlash(
    cleanEnvValue(
      process.env.AZURE_AI_PROJECT_ENDPOINT ||
        process.env.AZURE_EXISTING_AIPROJECT_ENDPOINT
    )
  );
  const parsedAgent = parseAgentIdentifier(
    process.env.AZURE_AI_AGENT_ID || process.env.AZURE_EXISTING_AGENT_ID
  );
  const agentName = cleanEnvValue(process.env.AZURE_AI_AGENT_NAME) || parsedAgent.name;
  const agentVersion =
    cleanEnvValue(process.env.AZURE_AI_AGENT_VERSION) || parsedAgent.version;

  if (!projectEndpoint || !agentName) {
    return null;
  }

  return {
    projectEndpoint,
    agentName,
    agentVersion,
  };
}

function validateFoundryConfig(config) {
  if (!config) {
    throw createConfigError(
      "Azure Foundry agent is not configured. Set AZURE_AI_PROJECT_ENDPOINT and AZURE_AI_AGENT_NAME or AZURE_AI_AGENT_ID."
    );
  }

  if (!/^https:\/\/[^/]+\.services\.ai\.azure\.com\/api\/projects\/[^/]+$/i.test(config.projectEndpoint)) {
    throw createConfigError(
      "Invalid AZURE_AI_PROJECT_ENDPOINT. Use format: https://<resource>.services.ai.azure.com/api/projects/<project-name>"
    );
  }
}

function getProjectClient() {
  const config = getFoundryConfig();
  validateFoundryConfig(config);
  ensureAzureCliOnPath();

  if (!cachedProjectClient || cachedProjectEndpoint !== config.projectEndpoint) {
    const credential = new DefaultAzureCredential();
    cachedProjectClient = new AIProjectClient(config.projectEndpoint, credential, {
      userAgentOptions: {
        userAgentPrefix: "finlending",
      },
    });
    cachedOpenAIClient = null;
    cachedProjectEndpoint = config.projectEndpoint;
  }

  return cachedProjectClient;
}

function getOpenAIClient() {
  if (!cachedOpenAIClient) {
    cachedOpenAIClient = getProjectClient().getOpenAIClient();
  }

  return cachedOpenAIClient;
}

function toConversationItems(history, userMessage) {
  const seededHistory = Array.isArray(history) ? history : [];
  const items = seededHistory
    .filter(
      (item) =>
        item &&
        (item.who === "user" || item.who === "ai") &&
        typeof item.text === "string" &&
        item.text.trim()
    )
    .map((item) => ({
      type: "message",
      role: item.who === "user" ? "user" : "assistant",
      content: item.text.trim(),
    }));

  items.push({
    type: "message",
    role: "user",
    content: String(userMessage || "").trim(),
  });

  return items;
}

function extractReplyText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const outputItems = Array.isArray(response?.output) ? response.output : [];
  const texts = [];

  for (const item of outputItems) {
    if (item?.type !== "message") {
      continue;
    }

    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content) {
      const text =
        typeof part?.text === "string"
          ? part.text
          : typeof part?.output_text === "string"
            ? part.output_text
            : "";

      if (text.trim()) {
        texts.push(text.trim());
      }
    }
  }

  return texts.join("\n").trim();
}

function normalizeProviderError(error) {
  const message = String(error?.message || "Azure Foundry request failed");
  const helpText = [];
  const isAuthChainError =
    /ChainedTokenCredential authentication failed/i.test(message) ||
    /AggregateAuthenticationError/i.test(String(error?.name || "")) ||
    /CredentialUnavailableError/i.test(message);

  if (isAuthChainError || /DefaultAzureCredential/i.test(message)) {
    const hostedMessage = isStaticWebAppsRuntime()
      ? "Azure Foundry agent requires Microsoft Entra authentication. Azure Static Web Apps managed backends do not expose managed identity to server code, so 'az login' will not fix the deployed app. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET for a service principal in Static Web App environment variables, or move this API to App Service / Azure Functions / Container Apps with managed identity."
      : isHostedInAzure()
        ? "Azure Foundry agent requires Microsoft Entra authentication. This Azure-hosted app cannot use local 'az login'. Configure managed identity or set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET for a service principal."
        : "Azure Foundry agent requires Microsoft Entra authentication. Install Azure CLI and run 'az login', or set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET for a service principal.";
    const normalized = new Error(
      hostedMessage
    );
    normalized.name = "AzureFoundryAuthError";
    normalized.statusCode = 401;
    normalized.details = error;
    return normalized;
  }

  if (/403|Forbidden/i.test(message)) {
    helpText.push("Verify your account has access to the Azure AI Project and Agent.");
  }

  const normalized = new Error(
    helpText.length > 0 ? `${message} ${helpText.join(" ")}` : message
  );
  normalized.name = error?.name || "AzureFoundryError";
  normalized.statusCode =
    Number(error?.statusCode) ||
    Number(error?.code) ||
    Number(error?.response?.status) ||
    500;
  normalized.details = error;
  return normalized;
}

export function getConfiguredProvider() {
  return getFoundryConfig() ? "azure_foundry_agent" : null;
}

export async function runHealthCheck() {
  const config = getFoundryConfig();
  validateFoundryConfig(config);

  try {
    const projectClient = getProjectClient();

    if (config.agentVersion) {
      await projectClient.agents.getVersion(config.agentName, config.agentVersion);
      return;
    }

    await projectClient.agents.get(config.agentName);
  } catch (error) {
    throw normalizeProviderError(error);
  }
}

export async function generateReplyWithSource({
  userMessage,
  conversationId,
  history,
}) {
  const config = getFoundryConfig();
  validateFoundryConfig(config);

  const normalizedMessage = String(userMessage || "").trim();
  if (!normalizedMessage) {
    throw createConfigError("Please provide a message.");
  }

  try {
    const openAIClient = getOpenAIClient();
    let currentConversationId = cleanEnvValue(conversationId);

    if (currentConversationId) {
      await openAIClient.conversations.items.create(currentConversationId, {
        items: [
          {
            type: "message",
            role: "user",
            content: normalizedMessage,
          },
        ],
      });
    } else {
      const conversation = await openAIClient.conversations.create({
        items: toConversationItems(history, normalizedMessage),
      });
      currentConversationId = conversation.id;
    }

    const response = await openAIClient.responses.create(
      {
        conversation: currentConversationId,
      },
      {
        body: {
          agent: {
            name: config.agentName,
            type: "agent_reference",
          },
        },
      }
    );

    const reply = extractReplyText(response);
    if (!reply) {
      throw new Error("No response from Azure Foundry agent");
    }

    return {
      reply,
      conversationId: currentConversationId,
      source: "azure_foundry_agent",
    };
  } catch (error) {
    throw normalizeProviderError(error);
  }
}
