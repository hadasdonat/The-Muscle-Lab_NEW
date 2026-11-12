import { generateJson, getLlmConfig, providerLabel } from "./llmClient.js";
import { loadCoachContext, rankCandidates, toSuggestion } from "./coachService.js";
import { ACTIVITIES } from "../config/activities.js";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MAX_MESSAGES = 12;
const MAX_LENGTH = 800;
const MAX_OPTIONS = 20;

// Hebrew names, so the offline fallback can still find classes for Hebrew questions.
const HEBREW_NAMES = {
    Yoga: ["יוגה"], Pilates: ["פילאטיס"], Barre: ["בר"], Stretching: ["מתיחות", "גמישות"], Meditation: ["מדיטציה"],
    HIIT: ["אינטרוולים", "hiit"], Spinning: ["ספינינג", "אופניים"], Zumba: ["זומבה"], Strength: ["כוח", "משקולות"],
    CrossFit: ["קרוספיט"], TRX: ["trx"], Bootcamp: ["בוטקאמפ"], Boxing: ["אגרוף", "איגרוף"], Kickboxing: ["קיקבוקס"]
};

function httpError(status, message) {
    return Object.assign(new Error(message), { status });
}

export function validateMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
        throw httpError(400, `Send between 1 and ${MAX_MESSAGES} messages.`);
    }
    const clean = messages.map(message => {
        if (!message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string" || !message.content.trim()) {
            throw httpError(400, "Each message needs a role (user or assistant) and text.");
        }
        return { role: message.role, content: message.content.trim().slice(0, MAX_LENGTH) };
    });
    if (clean[clean.length - 1].role !== "user") throw httpError(400, "The last message must be from the member.");
    return clean;
}

function weekday(date) {
    const [year, month, day] = String(date).split("-").map(Number);
    return WEEKDAYS[new Date(year, month - 1, day).getDay()];
}

export function isHebrew(text) {
    return /[֐-׿]/.test(text);
}

export function buildChatPrompt(context, options, messages) {
    const history = context.history.slice(0, 12).map(item => `- ${item.activity || item.title} with ${item.trainer_name}, ${weekday(item.class_date)} ${String(item.start_time).slice(0, 5)}`);
    const booked = context.upcoming.slice(0, 6).map(item => `- ${item.title}, ${weekday(item.class_date)} ${item.class_date} ${String(item.start_time).slice(0, 5)}`);
    const schedule = options.map(({ candidate }, index) =>
        `c${index + 1}: ${candidate.title} (${candidate.activity || "class"}, ${candidate.intensity || "?"} intensity) | ${weekday(candidate.class_date)} ${candidate.class_date} ` +
        `${String(candidate.start_time).slice(0, 5)}-${String(candidate.end_time).slice(0, 5)} | ${candidate.trainer_name} | ${candidate.available_spots} spots left`);
    const activities = ACTIVITIES.map(activity => `${activity.name}: ${activity.description}`).join("; ");

    const system = [
        "You are the AI coach of The Muscle Lab, a gym. You chat with one member inside the gym's app.",
        "Help with training questions, motivation, choosing classes and planning a week. Be warm, practical and brief: at most 120 words.",
        "Reply in the same language the member writes in (for example Hebrew or English).",
        "When you suggest classes, only use the numbered schedule options below, refer to them by their details, and list up to 3 keys in \"classes\". Never invent classes, times or trainers.",
        "You are not a doctor. For pain, injury, pregnancy or medical conditions, give general caution and suggest checking with a doctor or physiotherapist before training.",
        "Do not discuss topics unrelated to fitness, wellbeing or the gym; steer back politely.",
        `Activities the gym offers: ${activities}.`,
        'Reply with JSON only: {"reply":"your message","classes":["c2"]}. Use an empty list when no class fits.'
    ].join("\n");

    const prompt = [
        `Member first name: ${context.firstName}`,
        `Membership: ${context.membership ? `${context.membership.name}, active until ${context.membership.end_date}` : "none active"}`,
        `Favourite activities: ${context.favorites?.length ? context.favorites.join(", ") : "none set"}`,
        "Recent classes:", history.length ? history.join("\n") : "- none yet",
        "Already booked:", booked.length ? booked.join("\n") : "- nothing booked",
        "Schedule options (open places, next two weeks):", schedule.length ? schedule.join("\n") : "- no open classes",
        "Conversation so far:",
        ...messages.map(message => `${message.role === "user" ? "Member" : "Coach"}: ${message.content}`),
        "Write the coach's next reply."
    ].join("\n");
    return { system, prompt };
}

export function validateChatReply(reply, options) {
    const text = typeof reply?.reply === "string" ? reply.reply.trim().slice(0, 1500) : "";
    if (!text) return null;
    const keys = Array.isArray(reply.classes) ? reply.classes : [];
    const classes = [];
    for (const key of keys) {
        const match = /^c(\d+)$/.exec(String(key).trim());
        const option = match && options[Number(match[1]) - 1];
        if (option && !classes.includes(option)) classes.push(option);
        if (classes.length === 3) break;
    }
    return { reply: text, classes };
}

// Without a model: find the activity the member mentioned and list its next open classes.
export function fallbackReply(context, ranked, question) {
    const lower = question.toLowerCase();
    const hebrew = isHebrew(question);
    const activity = ACTIVITIES.find(({ name }) =>
        lower.includes(name.toLowerCase()) || (HEBREW_NAMES[name] || []).some(word => lower.includes(word)));
    const matching = activity ? ranked.filter(item => item.candidate.activity === activity.name) : ranked;
    const picks = matching.slice(0, 3);
    let reply;
    if (hebrew) {
        reply = picks.length
            ? `הצ'אט החכם לא מחובר כרגע, אבל מצאתי ${activity ? `שיעורי ${activity.name}` : "שיעורים"} פנויים שמתאימים לך:`
            : `הצ'אט החכם לא מחובר כרגע, ולא מצאתי ${activity ? `שיעורי ${activity.name}` : "שיעורים"} פנויים בשבועיים הקרובים.`;
    } else {
        reply = picks.length
            ? `The AI chat isn't connected right now, but here are open ${activity ? `${activity.name} ` : ""}classes that fit you:`
            : `The AI chat isn't connected right now, and I couldn't find open ${activity ? `${activity.name} ` : ""}classes in the next two weeks.`;
    }
    return { reply, classes: picks };
}

export async function chatWithCoach(userId, rawMessages, { config = getLlmConfig(), fetchImpl = fetch, loadContext = loadCoachContext } = {}) {
    const messages = validateMessages(rawMessages);
    const context = await loadContext(userId);
    const ranked = rankCandidates(context);
    const options = ranked.slice(0, MAX_OPTIONS);
    const question = messages[messages.length - 1].content;

    if (config.enabled) {
        try {
            const reply = validateChatReply(await generateJson(buildChatPrompt(context, options, messages), { config, fetchImpl }), options);
            if (reply) {
                return { source: "llm", model: providerLabel(config), reply: reply.reply, classes: reply.classes.map(item => toSuggestion(item.candidate)) };
            }
            console.warn("Coach chat: model reply failed validation; using fallback.");
        } catch (error) {
            console.warn(`Coach chat: ${error.message}; using fallback.`);
        }
    }
    const fallback = fallbackReply(context, ranked, question);
    return { source: "rules", reply: fallback.reply, classes: fallback.classes.map(item => toSuggestion(item.candidate)) };
}
