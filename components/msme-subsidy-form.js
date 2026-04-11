"use client";

import { useState } from "react";

import MarkdownContent from "./markdown-content";

const inputClassName =
  "mt-2 w-full rounded-2xl border border-white/10 bg-[#1b2026] px-4 py-3 text-sm text-white outline-none transition duration-200 placeholder:text-[#70808f] focus:border-[#18c2a5] focus:ring-2 focus:ring-[#18c2a5]/20";

function buildEligibilityPrompt({
  industryType,
  natureOfBusiness,
  businessStage,
  state,
  city,
}) {
  return [
    "Please recommend suitable MSME loan and subsidy schemes for this business.",
    "",
    `Industry Type: ${industryType}`,
    `Nature of Business: ${natureOfBusiness}`,
    `Business Stage: ${businessStage}`,
    `State: ${state}`,
    `City: ${city}`,
  ].join("\n");
}

function FormField({ label, children }) {
  return (
    <label className="block text-left">
      <span className="text-sm font-medium text-[#d6dde6]">{label}</span>
      {children}
    </label>
  );
}

export default function MsmeSubsidyForm() {
  const [formValues, setFormValues] = useState({
    industryType: "",
    natureOfBusiness: "Manufacturing",
    businessStage: "New",
    state: "",
    city: "",
  });
  const [responseText, setResponseText] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField(field) {
    return (event) => {
      setFormValues((current) => ({
        ...current,
        [field]: event.target.value,
      }));
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const normalizedValues = {
      industryType: formValues.industryType.trim(),
      natureOfBusiness: formValues.natureOfBusiness.trim(),
      businessStage: formValues.businessStage.trim(),
      state: formValues.state.trim(),
      city: formValues.city.trim(),
    };

    if (Object.values(normalizedValues).some((value) => !value)) {
      setSubmitError("Please fill in all business details before checking eligibility.");
      setResponseText("");
      return;
    }

    setLoading(true);
    setSubmitError("");
    setResponseText("");

    try {
      const res = await fetch("/api/msme-subsidy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: buildEligibilityPrompt(normalizedValues),
          history: [],
          threadId: null,
          conversationId: null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Unable to check eligibility right now.");
      }

      setResponseText(
        String(data?.reply || "No eligibility response was returned.")
      );
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Unable to check eligibility right now."
      );
      setResponseText("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(0,209,178,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(0,209,178,0.08),transparent_24%),#2b323a] px-4 py-10 text-[var(--text)] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center justify-center">
        <section className="w-full max-w-3xl rounded-[28px] border border-white/10 bg-[#232930]/95 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur sm:p-8">
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              MSME Subsidy Finder
            </h1>
            <p className="mt-3 text-sm text-[#9aa4b2] sm:text-base">
              Check eligible government schemes for your business
            </p>
          </div>

          <form
            className="mt-8 grid gap-5 sm:grid-cols-2"
            onSubmit={handleSubmit}
          >
            <div className="sm:col-span-2">
              <FormField label="Industry Type">
                <input
                  className={inputClassName}
                  type="text"
                  placeholder="e.g. Food Processing"
                  required
                  value={formValues.industryType}
                  onChange={updateField("industryType")}
                />
              </FormField>
            </div>

            <FormField label="Nature of Business">
              <select
                className={inputClassName}
                required
                value={formValues.natureOfBusiness}
                onChange={updateField("natureOfBusiness")}
              >
                <option>Manufacturing</option>
                <option>Trading</option>
                <option>Service</option>
              </select>
            </FormField>

            <FormField label="Business Stage">
              <select
                className={inputClassName}
                required
                value={formValues.businessStage}
                onChange={updateField("businessStage")}
              >
                <option>New</option>
                <option>Existing</option>
              </select>
            </FormField>

            <FormField label="State">
              <input
                className={inputClassName}
                type="text"
                placeholder="Enter state"
                required
                value={formValues.state}
                onChange={updateField("state")}
              />
            </FormField>

            <FormField label="City">
              <input
                className={inputClassName}
                type="text"
                placeholder="Enter city"
                required
                value={formValues.city}
                onChange={updateField("city")}
              />
            </FormField>

            <div className="sm:col-span-2">
              <button
                className="inline-flex w-full items-center justify-center rounded-2xl border border-[#18c2a5] bg-[#18c2a5] px-5 py-3 text-sm font-semibold text-[#0b0e11] shadow-[0_14px_28px_rgba(24,194,165,0.24)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#14aa92] hover:shadow-[0_18px_34px_rgba(24,194,165,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18c2a5]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#232930] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:bg-[#18c2a5] disabled:hover:shadow-[0_14px_28px_rgba(24,194,165,0.24)]"
                disabled={loading}
                type="submit"
              >
                {loading ? "Checking Eligibility..." : "Check Eligibility"}
              </button>
            </div>
          </form>

          {submitError ? (
            <div
              className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200"
              role="alert"
            >
              {submitError}
            </div>
          ) : null}

          {responseText ? (
            <section
              className="mt-6 rounded-[24px] border border-white/10 bg-[#1b2026] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]"
              aria-live="polite"
            >
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#18c2a5]">
                Eligibility Result
              </p>
              <MarkdownContent text={responseText} />
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}
