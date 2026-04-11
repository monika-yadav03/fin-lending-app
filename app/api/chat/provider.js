import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";
import { existsSync } from "node:fs";

const projectClientCache = new Map();
const openAIClientCache = new Map();
const MAX_MCP_APPROVAL_ROUNDS = 8;

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

function readFirstEnv(names = []) {
  for (const name of names) {
    const value = cleanEnvValue(process.env[name]);

    if (value) {
      return value;
    }
  }

  return "";
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

function looksLikeUrl(value) {
  return /^https?:\/\//i.test(cleanEnvValue(value));
}

function getFoundryConfig(options = {}) {
  const projectEndpointEnvNames = Array.isArray(options.projectEndpointEnvNames)
    ? options.projectEndpointEnvNames
    : ["AZURE_AI_PROJECT_ENDPOINT", "AZURE_EXISTING_AIPROJECT_ENDPOINT"];
  const agentIdEnvNames = Array.isArray(options.agentIdEnvNames)
    ? options.agentIdEnvNames
    : ["AZURE_AI_AGENT_ID", "AZURE_EXISTING_AGENT_ID"];
  const agentNameEnvNames = Array.isArray(options.agentNameEnvNames)
    ? options.agentNameEnvNames
    : ["AZURE_AI_AGENT_NAME"];
  const agentVersionEnvNames = Array.isArray(options.agentVersionEnvNames)
    ? options.agentVersionEnvNames
    : ["AZURE_AI_AGENT_VERSION"];
  const projectEndpoint = trimTrailingSlash(
    readFirstEnv(projectEndpointEnvNames)
  );
  const parsedAgent = parseAgentIdentifier(readFirstEnv(agentIdEnvNames));
  const agentName = readFirstEnv(agentNameEnvNames) || parsedAgent.name;
  const agentVersion = readFirstEnv(agentVersionEnvNames) || parsedAgent.version;

  if (looksLikeUrl(agentName)) {
    throw createConfigError(
      `${cleanEnvValue(options.configLabel) || "Azure Foundry agent"} name looks invalid. Put the project URL in the project endpoint variable, not in the agent name variable.`,
    );
  }

  if (looksLikeUrl(agentVersion)) {
    throw createConfigError(
      `${cleanEnvValue(options.configLabel) || "Azure Foundry agent"} version looks invalid. Put the project URL in the project endpoint variable, not in the agent version variable.`,
    );
  }

  if (!projectEndpoint || !agentName) {
    return null;
  }

  return {
    projectEndpoint,
    agentName,
    agentVersion,
  };
}

function validateFoundryConfig(config, options = {}) {
  const configLabel = cleanEnvValue(options.configLabel) || "Azure Foundry agent";

  if (!config) {
    throw createConfigError(
      `${configLabel} is not configured. Set AZURE_AI_PROJECT_ENDPOINT and AZURE_AI_AGENT_NAME or AZURE_AI_AGENT_ID.`,
    );
  }

  if (!/^https:\/\/[^/]+\.services\.ai\.azure\.com\/api\/projects\/[^/]+$/i.test(config.projectEndpoint)) {
    throw createConfigError(
      `Invalid ${configLabel} project endpoint. Use format: https://<resource>.services.ai.azure.com/api/projects/<project-name>`,
    );
  }
}

function getProjectClient(config, options = {}) {
  validateFoundryConfig(config, options);
  ensureAzureCliOnPath();

  if (!projectClientCache.has(config.projectEndpoint)) {
    const credential = new DefaultAzureCredential();
    const projectClient = new AIProjectClient(config.projectEndpoint, credential, {
      userAgentOptions: {
        userAgentPrefix: "finlending",
      },
    });
    projectClientCache.set(config.projectEndpoint, projectClient);
  }

  return projectClientCache.get(config.projectEndpoint);
}

function getOpenAIClient(config, options = {}) {
  validateFoundryConfig(config, options);

  if (!openAIClientCache.has(config.projectEndpoint)) {
    openAIClientCache.set(
      config.projectEndpoint,
      getProjectClient(config, options).getOpenAIClient(),
    );
  }

  return openAIClientCache.get(config.projectEndpoint);
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
          : typeof part?.text?.value === "string"
            ? part.text.value
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

function buildAgentReference(config) {
  const agentReference = {
    name: config.agentName,
    type: "agent_reference",
  };

  if (config.agentVersion) {
    agentReference.version = config.agentVersion;
  }

  return agentReference;
}

function describeResponse(response) {
  const outputItems = Array.isArray(response?.output) ? response.output : [];
  const outputTypes = outputItems
    .map((item) => String(item?.type || "unknown"))
    .filter(Boolean);
  const status = typeof response?.status === "string" ? response.status : "unknown";
  const responseId = typeof response?.id === "string" ? response.id : "unknown";
  const errorMessage =
    typeof response?.error?.message === "string" ? response.error.message : "";

  const parts = [
    `response_id=${responseId}`,
    `status=${status}`,
    outputTypes.length > 0 ? `output_types=${outputTypes.join(",")}` : "output_types=none",
  ];

  if (errorMessage) {
    parts.push(`error=${errorMessage}`);
  }

  return parts.join("; ");
}

function hasOutputType(response, type) {
  const outputItems = Array.isArray(response?.output) ? response.output : [];
  return outputItems.some((item) => item?.type === type);
}

function getMcpApprovalRequests(response) {
  const outputItems = Array.isArray(response?.output) ? response.output : [];

  return outputItems.filter(
    (item) =>
      item &&
      item.type === "mcp_approval_request" &&
      typeof item.approval_request_id === "string" &&
      item.approval_request_id.trim()
  );
}

function buildMcpApprovalResponses(response) {
  return getMcpApprovalRequests(response).map((item) => ({
    type: "mcp_approval_response",
    approval_request_id: item.approval_request_id,
    approve: true,
    reason: `Auto-approved MCP request for ${item.server_label || "configured knowledge server"}.`,
  }));
}

async function continueResponseWithApprovals(openAIClient, response, config) {
  let currentResponse = response;

  for (let attempt = 0; attempt < MAX_MCP_APPROVAL_ROUNDS; attempt += 1) {
    const approvals = buildMcpApprovalResponses(currentResponse);

    if (approvals.length === 0) {
      return currentResponse;
    }

    currentResponse = await openAIClient.responses.create(
      {
        input: approvals,
        previous_response_id: currentResponse.id,
      },
      {
        body: {
          agent: buildAgentReference(config),
        },
      }
    );
  }

  throw new Error(
    "The Azure Foundry agent kept requesting MCP approvals and did not finish after multiple approval rounds.",
  );
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

export function getConfiguredProvider(options = {}) {
  return getFoundryConfig(options) ? "azure_foundry_agent" : null;
}

export async function runHealthCheck(options = {}) {
  const config = getFoundryConfig(options);
  validateFoundryConfig(config, options);

  try {
    const projectClient = getProjectClient(config, options);

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
  configOptions = {},
}) {
  const config = getFoundryConfig(configOptions);
  validateFoundryConfig(config, configOptions);

  const normalizedMessage = String(userMessage || "").trim();
  if (!normalizedMessage) {
    throw createConfigError("Please provide a message.");
  }

  try {
    const openAIClient = getOpenAIClient(config, configOptions);
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
          agent: buildAgentReference(config),
        },
      }
    );

    const finalizedResponse = hasOutputType(response, "mcp_approval_request")
      ? await continueResponseWithApprovals(openAIClient, response, config)
      : response;
    const reply = extractReplyText(finalizedResponse);
    if (!reply) {
      if (hasOutputType(finalizedResponse, "mcp_approval_request")) {
        throw new Error(
          "The Azure Foundry agent requested MCP tool approval. This app currently supports text replies only and does not complete the MCP approval flow. Remove MCP tools from the MSME agent, or configure the agent to answer using only uploaded PDF knowledge.",
        );
      }

      throw new Error(
        `No response from Azure Foundry agent. ${describeResponse(finalizedResponse)}`,
      );
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
