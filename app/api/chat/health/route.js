import { getConfiguredProvider, runHealthCheck } from "../provider";

export const runtime = "nodejs";

export async function GET() {
  try {
    if (!getConfiguredProvider()) {
      return Response.json(
        { ok: false, error: "Azure Foundry agent is not configured" },
        { status: 500 }
      );
    }

    await runHealthCheck();

    return Response.json({ ok: true, provider: "azure_foundry_agent" });
  } catch (error) {
    const errName = error?.name || "UnknownError";
    const errMessage = error?.message || "Unknown error";
    const errCode = error?.statusCode;

    console.log("Azure Foundry health error", {
      name: errName,
      message: errMessage,
      httpStatusCode: errCode,
    });

    return Response.json(
      {
        ok: false,
        error: "AI provider error",
        details: {
          name: errName,
          message: errMessage,
          httpStatusCode: errCode,
        },
      },
      { status: Number(errCode) || 500 }
    );
  }
}
