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

export async function POST(request) {
 try {
  const body = await request.json()
  const message = body?.message

  if (!message || typeof message !== "string") {
   return Response.json({ reply: "Message is required" }, { status: 400 })
  }
  if (message.length > 2000) {
   return Response.json({ reply: "Message too long" }, { status: 400 })
  }
  if (!process.env.KNOWLEDGE_BASE_ID || !process.env.MODEL_ARN) {
   return Response.json({ reply: "Server not configured" }, { status: 500 })
  }

  const command = new RetrieveAndGenerateCommand({
   input: { text: message },
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
   return Response.json({ reply: "No response from AI" }, { status: 502 })
  }

  return Response.json({ reply: replyText })
 } catch (error) {
  console.log("Bedrock error", error)
  return Response.json({ reply: "AI error" }, { status: 500 })
 }
}