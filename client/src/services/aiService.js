import apiRequest from "./api.js";

// The coach runs on the server: it reads the member's history from the database and,
// when an LLM key is configured there, asks the model to choose. The browser never
// holds a model key and never sends profile data to a third party.
export async function getCoachInsight({ refresh = false } = {}) {
    return apiRequest(`/coach/insight${refresh ? "?refresh=1" : ""}`);
}

export function formatClassTime(suggestion) {
    if (!suggestion) return "";
    const [year, month, day] = String(suggestion.date).split("-").map(Number);
    const label = new Date(year, month - 1, day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    return `${label} · ${suggestion.startTime}–${suggestion.endTime}`;
}
