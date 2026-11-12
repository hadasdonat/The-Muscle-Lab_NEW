import pool from "../config/db.js";
import { generateJson, getLlmConfig, providerLabel } from "./llmClient.js";

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_LLM_CANDIDATES = 8;
const cache = new Map();

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toMinutes(time) {
    const [hours, minutes] = String(time).split(":").map(Number);
    return hours * 60 + (minutes || 0);
}

function weekdayOf(date) {
    // class_date arrives as "YYYY-MM-DD" (dateStrings); parse as a calendar date, not UTC midnight.
    const [year, month, day] = String(date).split("-").map(Number);
    return new Date(year, month - 1, day).getDay();
}

function overlaps(a, b) {
    return a.class_date === b.class_date &&
        toMinutes(a.start_time) < toMinutes(b.end_time) &&
        toMinutes(b.start_time) < toMinutes(a.end_time);
}

function mostCommon(values) {
    const counts = new Map();
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    let best = null;
    for (const [value, count] of counts) if (!best || count > best.count) best = { value, count };
    return best;
}

export async function loadCoachContext(userId) {
    const [[profileRows], [membershipRows], [historyRows], [upcomingRows], [candidateRows]] = await Promise.all([
        pool.execute(`SELECT first_name FROM Users WHERE id = ?`, [userId]),
        pool.execute(
            `SELECT mp.name, um.end_date
             FROM UserMemberships um
             INNER JOIN MembershipPlans mp ON mp.id = um.membership_plan_id
             WHERE um.user_id = ? AND um.status = 'Active' AND um.end_date >= CURRENT_DATE
             ORDER BY um.end_date DESC LIMIT 1`,
            [userId]
        ),
        pool.execute(
            `SELECT c.title, c.trainer_id, CONCAT(u.first_name, ' ', u.last_name) AS trainer_name,
                    c.class_date, c.start_time, c.end_time, a.attended
             FROM ClassRegistrations cr
             INNER JOIN Classes c ON c.id = cr.class_id
             INNER JOIN Trainers t ON t.id = c.trainer_id
             INNER JOIN Users u ON u.id = t.user_id
             LEFT JOIN Attendance a ON a.class_registration_id = cr.id
             WHERE cr.user_id = ? AND cr.status = 'Registered'
               AND TIMESTAMP(c.class_date, c.start_time) < NOW()
             ORDER BY c.class_date DESC, c.start_time DESC
             LIMIT 30`,
            [userId]
        ),
        pool.execute(
            `SELECT c.id, c.title, c.class_date, c.start_time, c.end_time
             FROM ClassRegistrations cr
             INNER JOIN Classes c ON c.id = cr.class_id
             WHERE cr.user_id = ? AND cr.status = 'Registered'
               AND TIMESTAMP(c.class_date, c.start_time) >= NOW()
             ORDER BY c.class_date, c.start_time`,
            [userId]
        ),
        pool.execute(
            `SELECT c.id, c.title, c.description, c.trainer_id, c.class_date, c.start_time, c.end_time,
                    c.room, c.capacity, CONCAT(u.first_name, ' ', u.last_name) AS trainer_name,
                    c.capacity - COALESCE(rc.registered, 0) AS available_spots
             FROM Classes c
             INNER JOIN Trainers t ON t.id = c.trainer_id
             INNER JOIN Users u ON u.id = t.user_id
             LEFT JOIN (
                 SELECT class_id, COUNT(*) AS registered
                 FROM ClassRegistrations WHERE status = 'Registered' GROUP BY class_id
             ) rc ON rc.class_id = c.id
             WHERE TIMESTAMP(c.class_date, c.start_time) > NOW()
               AND c.class_date <= CURRENT_DATE + INTERVAL 14 DAY
               AND c.capacity - COALESCE(rc.registered, 0) > 0
               AND NOT EXISTS (
                   SELECT 1 FROM ClassRegistrations mine
                   WHERE mine.class_id = c.id AND mine.user_id = ? AND mine.status = 'Registered'
               )
             ORDER BY c.class_date, c.start_time
             LIMIT 40`,
            [userId]
        )
    ]);

    return {
        firstName: profileRows[0]?.first_name || "there",
        membership: membershipRows[0] || null,
        history: historyRows,
        upcoming: upcomingRows,
        candidates: candidateRows.map(row => ({ ...row, available_spots: Number(row.available_spots) }))
    };
}

// Deterministic ranking. It is the fallback when no LLM is configured, and it also
// shortlists the classes the LLM chooses from, so the model never sees the whole schedule.
export function rankCandidates({ history = [], upcoming = [], candidates = [] }) {
    const titles = new Map();
    const trainers = new Map();
    for (const item of history) {
        titles.set(item.title, (titles.get(item.title) || 0) + 1);
        trainers.set(item.trainer_id, (trainers.get(item.trainer_id) || 0) + 1);
    }
    const favouriteDay = mostCommon(history.map(item => weekdayOf(item.class_date)));
    const usualStart = history.length
        ? history.reduce((sum, item) => sum + toMinutes(item.start_time), 0) / history.length
        : null;

    return candidates
        .filter(candidate => !upcoming.some(booked => overlaps(booked, candidate)))
        .map(candidate => {
            let score = 0;
            const reasons = [];
            const timesTaken = titles.get(candidate.title) || 0;
            if (timesTaken > 0) {
                // Weight by share of history, so one HIIT class doesn't count as much as weekly yoga.
                score += 1 + 4 * (timesTaken / history.length);
                reasons.push(`You've taken ${candidate.title} ${timesTaken} time${timesTaken === 1 ? "" : "s"} before.`);
            } else if (history.length > 0) {
                score += 0.5; // a little variety
            }
            if (trainers.has(candidate.trainer_id)) {
                score += 0.5 + 1.5 * (trainers.get(candidate.trainer_id) / history.length);
                reasons.push(`It's with ${candidate.trainer_name}, a trainer you already know.`);
            }
            if (favouriteDay && favouriteDay.count >= 2 && weekdayOf(candidate.class_date) === favouriteDay.value) {
                score += 1;
                reasons.push(`${WEEKDAYS[favouriteDay.value]} is the day you train most often.`);
            }
            if (usualStart !== null && Math.abs(toMinutes(candidate.start_time) - usualStart) <= 120) {
                score += 1;
                reasons.push("It starts around the time you usually train.");
            }
            const fillRatio = candidate.capacity > 0 ? candidate.available_spots / candidate.capacity : 0;
            if (fillRatio <= 0.2) reasons.push(`Only ${candidate.available_spots} spot${candidate.available_spots === 1 ? "" : "s"} left.`);
            return { candidate, score, reasons };
        })
        .sort((a, b) =>
            b.score - a.score ||
            a.candidate.class_date.localeCompare(b.candidate.class_date) ||
            a.candidate.start_time.localeCompare(b.candidate.start_time));
}

function toSuggestion(candidate) {
    return {
        classId: candidate.id,
        title: candidate.title,
        trainer: candidate.trainer_name,
        date: candidate.class_date,
        startTime: String(candidate.start_time).slice(0, 5),
        endTime: String(candidate.end_time).slice(0, 5),
        room: candidate.room,
        spotsLeft: candidate.available_spots
    };
}

export function buildRuleInsight(context, ranked = rankCandidates(context)) {
    const best = ranked[0];
    const membershipNote = context.membership
        ? null
        : "You don't have an active membership yet. Pick a plan on the Membership page.";
    if (!best) {
        return {
            source: "rules",
            summary: `Hi ${context.firstName}, there are no open classes in the next two weeks that fit your schedule.`,
            suggestion: null,
            reasons: membershipNote ? [membershipNote] : [],
            tip: null
        };
    }
    const reasons = best.reasons.length
        ? best.reasons.slice(0, 3)
        : [context.history.length ? "It's a class you haven't tried yet." : "It's the next open class on the schedule, a good first step."];
    if (membershipNote) reasons.push(membershipNote);
    return {
        source: "rules",
        summary: context.history.length
            ? `Hi ${context.firstName}, based on your last ${context.history.length} class${context.history.length === 1 ? "" : "es"}, this one fits you best.`
            : `Hi ${context.firstName}, here's a good class to start with.`,
        suggestion: toSuggestion(best.candidate),
        reasons,
        tip: null
    };
}

export function buildPrompt(context, shortlist) {
    const attendedCount = context.history.filter(item => item.attended === 1 || item.attended === true).length;
    const history = context.history.slice(0, 15).map(item =>
        `- ${item.title} with ${item.trainer_name}, ${WEEKDAYS[weekdayOf(item.class_date)]} ${String(item.start_time).slice(0, 5)}`);
    const upcoming = context.upcoming.slice(0, 5).map(item =>
        `- ${item.title}, ${item.class_date} ${String(item.start_time).slice(0, 5)}`);
    const options = shortlist.map(({ candidate }, index) =>
        `c${index + 1}: ${candidate.title} | ${WEEKDAYS[weekdayOf(candidate.class_date)]} ${candidate.class_date} ` +
        `${String(candidate.start_time).slice(0, 5)}-${String(candidate.end_time).slice(0, 5)} | trainer ${candidate.trainer_name} | ` +
        `${candidate.available_spots}/${candidate.capacity} spots left${candidate.description ? ` | ${candidate.description}` : ""}`);

    const system = [
        "You are the class coach inside The Muscle Lab, a gym app.",
        "Recommend exactly one class for this member from the numbered options. Never invent classes, times or trainers.",
        "Base the choice on the member's history: consistency, variety, recovery between similar sessions, and schedule fit.",
        "Write in a warm, concise tone. Address the member by first name in the summary.",
        "Reply with JSON only, in this shape:",
        '{"choice":"c1","summary":"one or two sentences","reasons":["short reason","short reason"],"tip":"one short practical tip"}',
        "Give 2 or 3 reasons, each under 20 words. Do not give medical advice."
    ].join("\n");

    const prompt = [
        `Member first name: ${context.firstName}`,
        `Membership: ${context.membership ? `${context.membership.name}, active until ${context.membership.end_date}` : "none active"}`,
        `Past classes (most recent first, ${attendedCount} confirmed attended):`,
        history.length ? history.join("\n") : "- none yet",
        "Already booked:",
        upcoming.length ? upcoming.join("\n") : "- nothing booked",
        "Options:",
        options.join("\n")
    ].join("\n");

    return { system, prompt };
}

function cleanText(value, max) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function validateLlmReply(reply, shortlist) {
    const match = /^c(\d+)$/.exec(String(reply?.choice || "").trim());
    const index = match ? Number(match[1]) - 1 : -1;
    const picked = shortlist[index];
    const summary = cleanText(reply?.summary, 400);
    if (!picked || !summary) return null;
    const reasons = Array.isArray(reply.reasons)
        ? reply.reasons.map(reason => cleanText(reason, 160)).filter(Boolean).slice(0, 3)
        : [];
    return { picked, summary, reasons, tip: cleanText(reply.tip, 200) || null };
}

export async function getCoachInsight(userId, { refresh = false, config = getLlmConfig(), fetchImpl = fetch, loadContext = loadCoachContext } = {}) {
    const context = await loadContext(userId);
    const ranked = rankCandidates(context);
    const shortlist = ranked.slice(0, MAX_LLM_CANDIDATES);
    const cacheKey = [config.enabled, context.history.length, context.membership?.name, ...context.upcoming.map(c => c.id), ...shortlist.map(s => s.candidate.id)].join("|");

    const cached = cache.get(userId);
    if (!refresh && cached && cached.key === cacheKey && Date.now() - cached.at < CACHE_TTL_MS) {
        return cached.insight;
    }

    let insight = buildRuleInsight(context, ranked);
    if (config.enabled && shortlist.length > 0) {
        try {
            const reply = await generateJson(buildPrompt(context, shortlist), { config, fetchImpl });
            const valid = validateLlmReply(reply, shortlist);
            if (valid) {
                insight = {
                    source: "llm",
                    model: providerLabel(config),
                    summary: valid.summary,
                    suggestion: toSuggestion(valid.picked.candidate),
                    reasons: valid.reasons.length ? valid.reasons : valid.picked.reasons.slice(0, 3),
                    tip: valid.tip
                };
                if (!context.membership) insight.reasons.push("You don't have an active membership yet. Pick a plan on the Membership page.");
            } else {
                console.warn("Coach: model reply failed validation; using rule-based suggestion.");
            }
        } catch (error) {
            console.warn(`Coach: ${error.message}; using rule-based suggestion.`);
        }
    }

    cache.set(userId, { key: cacheKey, at: Date.now(), insight });
    if (cache.size > 1000) cache.delete(cache.keys().next().value);
    return insight;
}

export function clearCoachCache() {
    cache.clear();
}
