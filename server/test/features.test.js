import { test, after } from "node:test";
import assert from "node:assert/strict";
import { computeProgress } from "../services/memberService.js";
import { buildChatPrompt, chatWithCoach, fallbackReply, isHebrew, validateChatReply, validateMessages } from "../services/coachChatService.js";
import { rankCandidates } from "../services/coachService.js";
import { getLlmConfig } from "../services/llmClient.js";
import pool from "../config/db.js";

after(() => pool.end());

const session = (date, start, activity = "Yoga", trainer = "Dana Levi", end = null) => ({
    class_date: date, start_time: start, end_time: end || `${String(Number(start.slice(0, 2)) + 1).padStart(2, "0")}:00:00`, activity, title: activity, trainer_name: trainer
});

test("progress counts weekly sessions, streaks and badges", () => {
    const now = new Date(2026, 10, 12, 12, 0); // Thursday 12 Nov 2026
    const sessions = [
        session("2026-11-10", "07:00:00"), session("2026-11-03", "19:30:00", "Boxing", "Yael Mor"),
        session("2026-10-27", "08:00:00", "Spinning", "Noa Bar"), session("2026-10-20", "18:00:00", "HIIT", "Omer Katz"),
        session("2026-09-01", "07:30:00")
    ];
    const progress = computeProgress(sessions, now);
    assert.equal(progress.total, 5);
    assert.equal(progress.streak, 4, "four consecutive weeks up to this one");
    assert.equal(progress.thisMonth, 2);
    assert.equal(progress.minutes, 240);
    assert.equal(progress.weekly.length, 12);
    assert.equal(progress.weekly.at(-1).count, 1);
    const earned = Object.fromEntries(progress.badges.map(b => [b.id, b.earned]));
    assert.equal(earned["first-class"], true);
    assert.equal(earned.five, true);
    assert.equal(earned.ten, false);
    assert.equal(earned["streak-3"], true);
    assert.equal(earned.explorer, true);
    assert.equal(earned["early-bird"], true);
    assert.equal(earned["night-owl"], false);
});

test("a streak survives until the current week ends, then resets", () => {
    const sessions = [session("2026-11-03", "07:00:00"), session("2026-10-27", "07:00:00")];
    assert.equal(computeProgress(sessions, new Date(2026, 10, 12)).streak, 2);
    assert.equal(computeProgress(sessions, new Date(2026, 10, 19)).streak, 0);
    assert.equal(computeProgress([], new Date(2026, 10, 12)).streak, 0);
});

test("chat messages are validated and trimmed", () => {
    assert.throws(() => validateMessages([]), /between 1 and/);
    assert.throws(() => validateMessages([{ role: "system", content: "hi" }]), /role/);
    assert.throws(() => validateMessages([{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }]), /last message/);
    const clean = validateMessages([{ role: "user", content: ` ${"x".repeat(900)} ` }]);
    assert.equal(clean[0].content.length, 800);
});

const candidates = [
    { id: "a", title: "Boxing", activity: "Boxing", intensity: "High", trainer_id: "t4", trainer_name: "Yael Mor", class_date: "2026-11-15", start_time: "12:00:00", end_time: "13:00:00", room: "Combat Zone", capacity: 10, available_spots: 4 },
    { id: "b", title: "Yoga", activity: "Yoga", intensity: "Low", trainer_id: "t1", trainer_name: "Dana Levi", class_date: "2026-11-16", start_time: "18:30:00", end_time: "19:30:00", room: "Studio B", capacity: 14, available_spots: 9 }
];
const context = { firstName: "Maya", membership: null, history: [], upcoming: [], candidates, favorites: ["Yoga"] };

test("favourite activities rank higher", () => {
    assert.equal(rankCandidates(context)[0].candidate.id, "b");
});

test("chat replies may only reference listed classes", () => {
    const options = rankCandidates(context);
    assert.equal(validateChatReply({ reply: "" }, options), null);
    const valid = validateChatReply({ reply: "Try yoga", classes: ["c1", "c1", "c9", "nope"] }, options);
    assert.equal(valid.classes.length, 1);
    assert.equal(valid.classes[0], options[0]);
});

test("the chat prompt carries the schedule and the conversation but no ids", () => {
    const { system, prompt } = buildChatPrompt(context, rankCandidates(context), [{ role: "user", content: "מה מומלץ לגב?" }]);
    assert.match(system, /same language/);
    assert.match(system, /not a doctor/);
    assert.match(prompt, /Member: מה מומלץ לגב\?/);
    assert.match(prompt, /c1: Yoga/);
    assert.doesNotMatch(prompt, /\| a |"a"/);
});

test("without a model the fallback finds the activity the member asked about, in English or Hebrew", () => {
    const ranked = rankCandidates(context);
    const english = fallbackReply(context, ranked, "Any boxing this week?");
    assert.equal(english.classes[0].candidate.id, "a");
    assert.match(english.reply, /isn't connected/);
    const hebrew = fallbackReply(context, ranked, "יש אגרוף השבוע?");
    assert.ok(isHebrew(hebrew.reply));
    assert.equal(hebrew.classes[0].candidate.id, "a");
});

test("chat uses the model reply and returns class cards from the database", async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"reply":"Boxing on Sunday is a great start.","classes":["c2"]}' }] } }] }) });
    const result = await chatWithCoach("u1", [{ role: "user", content: "I want something intense" }], {
        config: getLlmConfig({ AI_API_KEY: "k" }), fetchImpl, loadContext: async () => context
    });
    assert.equal(result.source, "llm");
    assert.equal(result.classes[0].classId, "a");
    assert.equal(result.classes[0].trainer, "Yael Mor");
});

test("chat falls back when the model fails", async () => {
    const result = await chatWithCoach("u1", [{ role: "user", content: "yoga?" }], {
        config: getLlmConfig({ AI_API_KEY: "k" }), fetchImpl: async () => { throw new Error("down"); }, loadContext: async () => context
    });
    assert.equal(result.source, "rules");
    assert.equal(result.classes[0].classId, "b");
});
