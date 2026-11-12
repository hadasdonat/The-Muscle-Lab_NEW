// Minimal provider-agnostic LLM client.
// AI_PROVIDER selects the wire format: "gemini" (default), "openai" (any OpenAI-compatible
// endpoint: OpenAI, Groq, OpenRouter, a local Ollama) or "anthropic".
// The API key stays on the server and is never sent to the browser.

const DEFAULT_MODELS = {
    gemini: "gemini-flash-latest",
    openai: "gpt-4o-mini",
    anthropic: "claude-haiku-5-5"
};

export function getLlmConfig(env = process.env) {
    const provider = (env.AI_PROVIDER || "gemini").trim().toLowerCase();
    const apiKey = env.AI_API_KEY?.trim() || "";
    const enabled = Boolean(apiKey) || (provider === "openai" && Boolean(env.AI_BASE_URL));
    return {
        enabled,
        provider,
        apiKey,
        model: env.AI_MODEL?.trim() || DEFAULT_MODELS[provider] || "",
        baseUrl: (env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
        timeoutMs: Number(env.AI_TIMEOUT_MS) > 0 ? Number(env.AI_TIMEOUT_MS) : 10000
    };
}

export function providerLabel(config) {
    return { gemini: "Gemini", openai: "OpenAI-compatible model", anthropic: "Claude" }[config.provider] || config.provider;
}

function buildRequest(config, { system, prompt }) {
    if (config.provider === "gemini") {
        return {
            url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
            headers: { "x-goog-api-key": config.apiKey },
            body: {
                systemInstruction: { parts: [{ text: system }] },
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.4, responseMimeType: "application/json" }
            },
            extract: data => data?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("")
        };
    }
    if (config.provider === "anthropic") {
        return {
            url: "https://api.anthropic.com/v1/messages",
            headers: { "x-api-key": config.apiKey, "anthropic-version": "2023-06-01" },
            body: {
                model: config.model,
                max_tokens: 600,
                temperature: 0.4,
                system,
                messages: [{ role: "user", content: prompt }]
            },
            extract: data => data?.content?.filter(part => part.type === "text").map(part => part.text).join("")
        };
    }
    if (config.provider === "openai") {
        return {
            url: `${config.baseUrl}/chat/completions`,
            headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
            body: {
                model: config.model,
                temperature: 0.4,
                response_format: { type: "json_object" },
                messages: [{ role: "system", content: system }, { role: "user", content: prompt }]
            },
            extract: data => data?.choices?.[0]?.message?.content
        };
    }
    throw new Error(`Unsupported AI_PROVIDER "${config.provider}"`);
}

// Models sometimes wrap JSON in a code fence even when asked not to.
export function parseJsonReply(text) {
    if (typeof text !== "string" || !text.trim()) throw new Error("Empty model reply");
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("Model reply did not contain a JSON object");
    return JSON.parse(cleaned.slice(start, end + 1));
}

export async function generateJson(messages, { config = getLlmConfig(), fetchImpl = fetch } = {}) {
    if (!config.enabled) throw new Error("LLM is not configured");
    const request = buildRequest(config, messages);
    const response = await fetchImpl(request.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...request.headers },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(config.timeoutMs)
    });
    if (!response.ok) {
        // Do not log the response body: some providers echo request details.
        throw new Error(`LLM request failed with status ${response.status}`);
    }
    return parseJsonReply(request.extract(await response.json()));
}
