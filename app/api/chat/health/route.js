import { BedrockAgentRuntimeClient, RetrieveAndGenerateCommand } from "@aws-sdk/client-bedrock-agent-runtime"

export const runtime = "nodejs"

function getBedrockClient() {
 return new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION,
  credentials: {
   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
 })
}

export async function GET() {
 try {
  if (!process.env.KNOWLEDGE_BASE_ID || !process.env.MODEL_ARN) {
   return Response.json({ ok: false, error: "Server not configured" }, { status: 500 })
  }

  const command = new RetrieveAndGenerateCommand({
   input: { text: "health check" },
   retrieveAndGenerateConfiguration: {
    type: "KNOWLEDGE_BASE",
    knowledgeBaseConfiguration: {
     knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID,
     modelArn: process.env.MODEL_ARN
    }
   }
  })

  const response = await getBedrockClient().send(command)
  const replyText = response?.output?.text

  if (!replyText) {
   return Response.json({ ok: false, error: "No response from AI" }, { status: 502 })
  }

  return Response.json({ ok: true })
 } catch (error) {
  console.log("Bedrock health error", error)
  return Response.json({ ok: false, error: "Bedrock error" }, { status: 500 })
 }
}