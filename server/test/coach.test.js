import { test, after } from "node:test";
import assert from "node:assert/strict";
import { generateJson, getLlmConfig, parseJsonReply } from "../services/llmClient.js";
import { buildPrompt, clearCoachCache, getCoachInsight, rankCandidates, validateLlmReply } from "../services/coachService.js";
import { validateRecords } from "../services/attendanceService.js";
import pool from "../config/db.js";

after(() => pool.end());

const yoga = { id: "c-yoga", title: "Yoga", description: "Flow", trainer_id: "t1", trainer_name: "Dana Levi", class_date: "2026-11-17", start_time: "18:00:00", end_time: "19:00:00", room: "Studio B", capacity: 15, available_spots: 6 };
const hiit = { id: "c-hiit", title: "HIIT", description: "", trainer_id: "t2", trainer_name: "Omer Katz", class_date: "2026-11-16", start_time: "07:00:00", end_time: "08:00:00", room: "Studio A", capacity: 20, available_spots: 2 };
const spin = { id: "c-spin", title: "Spinning", description: "", trainer_id: "t3", trainer_name: "Noa Bar", class_date: "2026-11-18", start_time: "18:30:00", end_time: "19:30:00", room: "Bike room", capacity: 12, available_spots: 12 };
// Two past Tuesday-evening yoga classes with Dana
const history = [
    { title: "Yoga", trainer_id: "t1", trainer_name: "Dana Levi", class_date: "2026-11-10", start_time: "18:00:00", end_time: "19:00:00", attended: 1 },
    { title: "Yoga", trainer_id: "t1", trainer_name: "Dana Levi", class_date: "2026-11-03", start_time: "18:00:00", end_time: "19:00:00", attended: null }
];
const context = { firstName: "Maya", membership: { name: "Premium", end_date: "2027-01-01" }, history, upcoming: [], candidates: [hiit, spin, yoga] };

test("ranking prefers the member's usual class, trainer, day and time", () => {
    const ranked = rankCandidates(context);
    assert.equal(ranked[0].candidate.id, "c-yoga");
    assert.ok(ranked[0].reasons.some(reason => reason.includes("Dana Levi")));
    assert.ok(ranked[0].reasons.some(reason => reason.includes("Tuesday")));
});

test("ranking skips classes that clash with an existing booking", () => {
    const upcoming = [{ id: "booked", title: "Pilates", class_date: "2026-11-17", start_time: "18:30:00", end_time: "19:30:00" }];
    const ranked = rankCandidates({ ...context, upcoming });
    assert.ok(!ranked.some(item => item.candidate.id === "c-yoga"));
});

test("with no history the soonest open class comes first", () => {
    const ranked = rankCandidates({ history: [], upcoming: [], candidates: [yoga, spin, hiit] });
    assert.equal(ranked[0].candidate.id, "c-hiit");
});

test("model replies are accepted only when they pick a listed option", () => {
    const shortlist = rankCandidates(context);
    assert.equal(validateLlmReply({ choice: "c9", summary: "x" }, shortlist), null);
    assert.equal(validateLlmReply({ choice: "c1", summary: "" }, shortlist), null);
    assert.equal(validateLlmReply("not json", shortlist), null);
    const valid = validateLlmReply({ choice: "c2", summary: "  Hi   Maya ", reasons: ["a", 5, "b", "c", "d"], tip: "Hydrate" }, shortlist);
    assert.equal(valid.picked, shortlist[1]);
    assert.equal(valid.summary, "Hi Maya");
    assert.deepEqual(valid.reasons, ["a", "b", "c"]);
});

test("the prompt lists only shortlisted classes and no email or ids", () => {
    const shortlist = rankCandidates(context);
    const { system, prompt } = buildPrompt(context, shortlist);
    assert.match(system, /Never invent classes/);
    assert.match(prompt, /c1: Yoga/);
    assert.doesNotMatch(prompt, /c-yoga|@/);
});

test("JSON replies are parsed even inside a code fence", () => {
    assert.deepEqual(parseJsonReply('```json\n{"choice":"c1"}\n```'), { choice: "c1" });
    assert.throws(() => parseJsonReply("no json here"));
});

for (const [provider, reply, check] of [
    ["gemini", { candidates: [{ content: { parts: [{ text: '{"choice":"c1","summary":"ok"}' }] } }] },
        (url, init) => { assert.match(url, /generativelanguage\.googleapis\.com.*gemini-flash-latest:generateContent$/); assert.equal(init.headers["x-goog-api-key"], "test-key"); }],
    ["openai", { choices: [{ message: { content: '{"choice":"c1","summary":"ok"}' } }] },
        (url, init) => { assert.equal(url, "https://api.openai.com/v1/chat/completions"); assert.equal(init.headers.Authorization, "Bearer test-key"); }],
    ["anthropic", { content: [{ type: "text", text: '{"choice":"c1","summary":"ok"}' }] },
        (url, init) => { assert.equal(url, "https://api.anthropic.com/v1/messages"); assert.equal(init.headers["x-api-key"], "test-key"); }]
]) {
    test(`${provider} requests use the right endpoint and key header`, async () => {
        const config = getLlmConfig({ AI_PROVIDER: provider, AI_API_KEY: "test-key" });
        const result = await generateJson({ system: "s", prompt: "p" }, {
            config,
            fetchImpl: async (url, init) => { check(url, init); return { ok: true, json: async () => reply }; }
        });
        assert.deepEqual(result, { choice: "c1", summary: "ok" });
    });
}

test("the LLM is off without a key and errors never expose the response body", async () => {
    assert.equal(getLlmConfig({}).enabled, false);
    const config = getLlmConfig({ AI_API_KEY: "k" });
    await assert.rejects(
        generateJson({ system: "s", prompt: "p" }, { config, fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ secret: "x" }) }) }),
        error => error.message === "LLM request failed with status 429"
    );
});

test("coach uses the model's pick but keeps class facts from the database", async () => {
    clearCoachCache();
    const config = getLlmConfig({ AI_API_KEY: "k" });
    const fetchImpl = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ choice: "c2", summary: "Maya, try something new.", reasons: ["Variety helps"], tip: "Bring water" }) }] } }] }) });
    const insight = await getCoachInsight("user-1", { config, fetchImpl, loadContext: async () => context });
    const second = rankCandidates(context)[1].candidate;
    assert.equal(insight.source, "llm");
    assert.equal(insight.model, "Gemini");
    assert.equal(insight.suggestion.classId, second.id);
    assert.equal(insight.suggestion.trainer, second.trainer_name);
    assert.equal(insight.tip, "Bring water");
});

test("coach falls back to rules when the model fails, and caches the result", async () => {
    clearCoachCache();
    const config = getLlmConfig({ AI_API_KEY: "k" });
    let calls = 0;
    const fetchImpl = async () => { calls += 1; throw new Error("network down"); };
    const insight = await getCoachInsight("user-2", { config, fetchImpl, loadContext: async () => context });
    assert.equal(insight.source, "rules");
    assert.equal(insight.suggestion.classId, "c-yoga");
    await getCoachInsight("user-2", { config, fetchImpl, loadContext: async () => context });
    assert.equal(calls, 1);
});

test("coach explains when nothing is open and skips the model", async () => {
    clearCoachCache();
    const insight = await getCoachInsight("user-3", {
        config: getLlmConfig({ AI_API_KEY: "k" }),
        fetchImpl: () => assert.fail("no model call without candidates"),
        loadContext: async () => ({ ...context, membership: null, candidates: [] })
    });
    assert.equal(insight.suggestion, null);
    assert.match(insight.reasons[0], /membership/);
});

test("attendance records are validated before touching the database", () => {
    assert.throws(() => validateRecords([]), /non-empty/);
    assert.throws(() => validateRecords([{ registrationId: "a", attended: "yes" }]), /true or false/);
    assert.throws(() => validateRecords([{ registrationId: "a", attended: true }, { registrationId: "a", attended: false }]), /once/);
    assert.doesNotThrow(() => validateRecords([{ registrationId: "a", attended: true }]));
});
