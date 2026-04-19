import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";
import { existsSync } from "node:fs";

const projectClientCache = new Map();
const openAIClientCache = new Map();
const MAX_MCP_APPROVAL_ROUNDS = 8;

function ensureAzureCliOnPath() {
  if (process.platform !== "win32") return;

  const currentPath = String(process.env.PATH || "");
  const candidates = [
    "C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin",
    "C:\\Program Files (x86)\\Microsoft SDKs\\Azure\\CLI2\\wbin",
  ];

  const missing = candidates.filter(
    (item) => existsSync(item) && !currentPath.includes(item),
  );

  if (missing.length > 0) {
    process.env.PATH = [currentPath, ...missing].join(";");
  }
}

function clean(value) {
  const text = String(value || "").trim();
  return text || "";
}

function trimSlash(value = "") {
  return String(value).replace(/\/+$/, "");
}

function readEnv(names = []) {
  for (const name of names) {
    const value = clean(process.env[name]);
    if (value) return value;
  }
  return "";
}

function isHostedInAzure() {
  return Boolean(
    clean(process.env.WEBSITE_SITE_NAME) ||
      clean(process.env.WEBSITE_INSTANCE_ID) ||
      clean(process.env.IDENTITY_ENDPOINT),
  );
}

function isStaticWebAppsRuntime() {
  return Boolean(
    clean(process.env.SWA_RUNTIME_CONFIG) ||
      (isHostedInAzure() &&
        clean(process.env.WEBSITE_HOSTNAME).includes(".azurestaticapps.net")),
  );
}

function createConfigError(message) {
  const error = new Error(message);
  error.statusCode = 500;
  return error;
}

function parseAgent(value) {
  const raw = clean(value);
  if (!raw) return { name: "", version: "" };

  const [name, version = ""] = raw.split(":");
  return {
    name: clean(name),
    version: clean(version),
  };
}

function getFoundryConfig(options = {}) {
  const endpoint = trimSlash(
    readEnv(
      options.projectEndpointEnvNames || [
        "AZURE_AI_PROJECT_ENDPOINT",
        "AZURE_EXISTING_AIPROJECT_ENDPOINT",
      ],
    ),
  );

  const parsed = parseAgent(
    readEnv(
      options.agentIdEnvNames || [
        "AZURE_AI_AGENT_ID",
        "AZURE_EXISTING_AGENT_ID",
      ],
    ),
  );

  const agentName =
    readEnv(options.agentNameEnvNames || ["AZURE_AI_AGENT_NAME"]) ||
    parsed.name;

  const agentVersion =
    readEnv(options.agentVersionEnvNames || ["AZURE_AI_AGENT_VERSION"]) ||
    parsed.version;

  if (!endpoint || !agentName) return null;

  return {
    projectEndpoint: endpoint,
    agentName,
    agentVersion,
  };
}

function validateConfig(config, options = {}) {
  const label = clean(options.configLabel) || "Azure Foundry agent";

  if (!config) {
    throw createConfigError(
      `${label} is not configured. Check environment variables.`,
    );
  }

  if (
    !/^https:\/\/[^/]+\.services\.ai\.azure\.com\/api\/projects\/[^/]+$/i.test(
      config.projectEndpoint,
    )
  ) {
    throw createConfigError(
      `Invalid endpoint. Use format: https://<resource>.services.ai.azure.com/api/projects/<project-name>`,
    );
  }
}

function getProjectClient(config, options = {}) {
  validateConfig(config, options);
  ensureAzureCliOnPath();

  if (!projectClientCache.has(config.projectEndpoint)) {
    const client = new AIProjectClient(
      config.projectEndpoint,
      new DefaultAzureCredential(),
    );

    projectClientCache.set(config.projectEndpoint, client);
  }

  return projectClientCache.get(config.projectEndpoint);
}

function getOpenAIClient(config, options = {}) {
  validateConfig(config, options);

  if (!openAIClientCache.has(config.projectEndpoint)) {
    openAIClientCache.set(
      config.projectEndpoint,
      getProjectClient(config, options).getOpenAIClient(),
    );
  }

  return openAIClientCache.get(config.projectEndpoint);
}

function toConversationItems(history, userMessage) {
  const list = Array.isArray(history) ? history : [];

  const items = list
    .filter((item) => item?.content && item?.role)
    .map((item) => ({
      type: "message",
      role: item.role === "user" ? "user" : "assistant",
      content: item.content,
    }));

  items.push({
    type: "message",
    role: "user",
    content: userMessage,
  });

  return items;
}

function stripCitationArtifacts(text) {
  return String(text || "")
    .replace(/【[^【】]*†[^【】]*】/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractReplyText(response) {
  if (typeof response?.output_text === "string") {
    return stripCitationArtifacts(response.output_text);
  }

  const outputs = Array.isArray(response?.output) ? response.output : [];
  const texts = [];

  for (const item of outputs) {
    if (item?.type !== "message") continue;

    const parts = Array.isArray(item.content) ? item.content : [];

    for (const part of parts) {
      const text = part?.text || part?.text?.value || part?.output_text || "";

      if (String(text).trim()) {
        texts.push(String(text).trim());
      }
    }
  }

  return stripCitationArtifacts(texts.join("\n"));
}

function buildAgentReference(config) {
  const obj = {
    name: config.agentName,
    type: "agent_reference",
  };

  if (config.agentVersion) {
    obj.version = config.agentVersion;
  }

  return obj;
}

function hasOutputType(response, type) {
  const output = Array.isArray(response?.output) ? response.output : [];
  return output.some((item) => item?.type === type);
}

function getApprovals(response) {
  const output = Array.isArray(response?.output) ? response.output : [];

  return output
    .filter((item) => item?.type === "mcp_approval_request")
    .map((item) => ({
      type: "mcp_approval_response",
      approval_request_id: item.approval_request_id,
      approve: true,
      reason: "Auto approved",
    }));
}

async function continueWithApprovals(client, response, config) {
  let current = response;

  for (let i = 0; i < MAX_MCP_APPROVAL_ROUNDS; i++) {
    const approvals = getApprovals(current);

    if (approvals.length === 0) return current;

    current = await client.responses.create(
      {
        input: approvals,
        previous_response_id: current.id,
      },
      {
        body: {
          agent: buildAgentReference(config),
        },
      },
    );
  }

  throw new Error("Too many approval rounds.");
}

function normalizeProviderError(error) {
  const message = String(error?.message || "Backend call failure");

  const authError =
    /ChainedTokenCredential/i.test(message) ||
    /DefaultAzureCredential/i.test(message) ||
    /CredentialUnavailableError/i.test(message);

  if (authError) {
    const msg = isStaticWebAppsRuntime()
      ? "Authentication failed. Check AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET."
      : "Authentication failed. Run az login or configure service principal.";

    const e = new Error(msg);
    e.statusCode = 401;
    return e;
  }

  const e = new Error(message || "Backend call failure");
  e.statusCode =
    Number(error?.statusCode) || Number(error?.response?.status) || 500;

  return e;
}

export function getConfiguredProvider(options = {}) {
  return getFoundryConfig(options) ? "azure_foundry_agent" : null;
}

export async function runHealthCheck(configOptions = {}) {
  try {
    const config = getFoundryConfig(configOptions);
    validateConfig(config, configOptions);

    const client = getProjectClient(config, configOptions);

    if (config.agentVersion) {
      await client.agents.getVersion(config.agentName, config.agentVersion);
    } else {
      await client.agents.get(config.agentName);
    }

    return {
      ok: true,
      provider: "azure_foundry_agent",
      agentName: config.agentName,
      agentVersion: config.agentVersion || null,
    };
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
  validateConfig(config, configOptions);

  const message = clean(userMessage);

  if (!message) {
    throw createConfigError("Please provide a message.");
  }

  try {
    const client = getOpenAIClient(config, configOptions);
    let currentConversationId = clean(conversationId);

    if (currentConversationId) {
      await client.conversations.items.create(currentConversationId, {
        items: [
          {
            type: "message",
            role: "user",
            content: message,
          },
        ],
      });
    } else {
      const conversation = await client.conversations.create({
        items: toConversationItems(history, message),
      });

      currentConversationId = conversation.id;
    }

    const response = await Promise.race([
      client.responses.create(
        {
          conversation: currentConversationId,
        },
        {
          body: {
            agent: buildAgentReference(config),
          },
        },
      ),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Request timeout. Please try again.")),
          30000,
        ),
      ),
    ]);

    const finalResponse = hasOutputType(response, "mcp_approval_request")
      ? await continueWithApprovals(client, response, config)
      : response;

    const reply = extractReplyText(finalResponse);

    if (!reply) {
      throw new Error("No response received from Azure agent.");
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
