import pool from "../config/db.js";
import { ACTIVITY_NAMES } from "../config/activities.js";

function httpError(status, message) {
    return Object.assign(new Error(message), { status });
}

// ---------- favourites ----------
export async function listFavorites(userId) {
    const [rows] = await pool.execute("SELECT activity FROM FavoriteActivities WHERE user_id = ? ORDER BY created_at", [userId]);
    return rows.map(row => row.activity);
}

export async function setFavorite(userId, activity, favorite) {
    if (!ACTIVITY_NAMES.includes(activity)) throw httpError(400, "Unknown activity.");
    if (favorite) {
        await pool.execute("INSERT IGNORE INTO FavoriteActivities (user_id, activity) VALUES (?, ?)", [userId, activity]);
    } else {
        await pool.execute("DELETE FROM FavoriteActivities WHERE user_id = ? AND activity = ?", [userId, activity]);
    }
    return listFavorites(userId);
}

// ---------- ratings ----------
export async function classesToRate(userId) {
    const [rows] = await pool.execute(
        `SELECT c.id, c.title, c.activity, c.class_date, c.start_time, CONCAT(u.first_name, ' ', u.last_name) AS trainer_name
         FROM ClassRegistrations cr
         INNER JOIN Classes c ON c.id = cr.class_id
         INNER JOIN Trainers t ON t.id = c.trainer_id
         INNER JOIN Users u ON u.id = t.user_id
         LEFT JOIN Attendance a ON a.class_registration_id = cr.id
         LEFT JOIN ClassRatings r ON r.class_registration_id = cr.id
         WHERE cr.user_id = ? AND cr.status = 'Registered' AND r.id IS NULL
           AND (a.attended IS NULL OR a.attended = TRUE)
           AND TIMESTAMP(c.class_date, c.end_time) <= NOW()
           AND c.class_date >= CURRENT_DATE - INTERVAL 14 DAY
         ORDER BY c.class_date DESC, c.start_time DESC
         LIMIT 3`,
        [userId]
    );
    return rows;
}

export async function rateClass(userId, classId, { rating, comment }) {
    const score = Number(rating);
    if (!Number.isInteger(score) || score < 1 || score > 5) throw httpError(400, "Rating must be a whole number from 1 to 5.");
    const text = typeof comment === "string" ? comment.trim().slice(0, 500) : "";
    const [rows] = await pool.execute(
        `SELECT cr.id, a.attended, TIMESTAMP(c.class_date, c.end_time) <= NOW() AS ended
         FROM ClassRegistrations cr
         INNER JOIN Classes c ON c.id = cr.class_id
         LEFT JOIN Attendance a ON a.class_registration_id = cr.id
         WHERE cr.class_id = ? AND cr.user_id = ? AND cr.status = 'Registered'`,
        [classId, userId]
    );
    const registration = rows[0];
    if (!registration) throw httpError(404, "You weren't registered for this class.");
    if (!Number(registration.ended)) throw httpError(409, "You can rate a class after it ends.");
    if (registration.attended === 0) throw httpError(409, "Only classes you attended can be rated.");
    await pool.execute(
        `INSERT INTO ClassRatings (class_registration_id, rating, comment) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment)`,
        [registration.id, score, text || null]
    );
    return { rating: score, comment: text || null };
}

// ---------- progress ----------
function startOfWeek(date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    result.setDate(result.getDate() - result.getDay()); // weeks start on Sunday
    return result;
}

function parseLocal(dateString, time = "00:00:00") {
    const [year, month, day] = String(dateString).split("-").map(Number);
    const [hours, minutes] = String(time).split(":").map(Number);
    return new Date(year, month - 1, day, hours, minutes);
}

export const BADGES = [
    { id: "first-class", title: "First class", description: "Finish your first class", test: s => s.total >= 1 },
    { id: "five", title: "High five", description: "Finish 5 classes", test: s => s.total >= 5 },
    { id: "ten", title: "Double digits", description: "Finish 10 classes", test: s => s.total >= 10 },
    { id: "twenty-five", title: "Regular", description: "Finish 25 classes", test: s => s.total >= 25 },
    { id: "streak-3", title: "On a roll", description: "Train 3 weeks in a row", test: s => s.bestStreak >= 3 },
    { id: "explorer", title: "Explorer", description: "Try 4 different activities", test: s => s.activities >= 4 },
    { id: "early-bird", title: "Early bird", description: "3 classes that start before 9:00", test: s => s.early >= 3 },
    { id: "night-owl", title: "Night owl", description: "3 classes that start at 19:00 or later", test: s => s.late >= 3 },
    { id: "loyal", title: "Loyal", description: "5 classes with the same trainer", test: s => s.topTrainerCount >= 5 }
];

// Pure function over a member's finished classes, so it can be tested without a database.
export function computeProgress(sessions, now = new Date(), weeks = 12) {
    const thisWeek = startOfWeek(now);
    const weekly = [];
    for (let i = weeks - 1; i >= 0; i -= 1) {
        const start = new Date(thisWeek);
        start.setDate(start.getDate() - i * 7);
        weekly.push({ weekStart: start, count: 0 });
    }
    const byActivity = new Map();
    const trainers = new Map();
    // Weeks are keyed by their Sunday's calendar date, so DST changes can't shift them.
    const keyOf = date => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const weeksWithClass = new Set();
    let early = 0;
    let late = 0;
    for (const session of sessions) {
        const startsAt = parseLocal(session.class_date, session.start_time);
        const week = startOfWeek(startsAt);
        weeksWithClass.add(keyOf(week));
        const bucket = weekly.find(entry => keyOf(entry.weekStart) === keyOf(week));
        if (bucket) bucket.count += 1;
        const activity = session.activity || session.title;
        byActivity.set(activity, (byActivity.get(activity) || 0) + 1);
        trainers.set(session.trainer_name, (trainers.get(session.trainer_name) || 0) + 1);
        if (startsAt.getHours() < 9) early += 1;
        if (startsAt.getHours() >= 19) late += 1;
    }
    const previousWeek = date => { const d = new Date(date); d.setDate(d.getDate() - 7); return d; };

    // Current streak: consecutive weeks with a class, counting back from this week
    // (or last week, so the streak doesn't drop to zero on Sunday morning).
    let streak = 0;
    let cursor = new Date(thisWeek);
    if (!weeksWithClass.has(keyOf(cursor))) cursor = previousWeek(cursor);
    while (weeksWithClass.has(keyOf(cursor))) {
        streak += 1;
        cursor = previousWeek(cursor);
    }
    let bestStreak = 0;
    for (const session of sessions) {
        // Walk back from each week that has a class; the longest run is the best streak.
        let run = 0;
        let week = startOfWeek(parseLocal(session.class_date));
        while (weeksWithClass.has(keyOf(week))) {
            run += 1;
            week = previousWeek(week);
        }
        bestStreak = Math.max(bestStreak, run);
    }

    const stats = {
        total: sessions.length,
        activities: byActivity.size,
        early,
        late,
        bestStreak,
        topTrainerCount: Math.max(0, ...trainers.values())
    };
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
        total: sessions.length,
        thisMonth: sessions.filter(s => parseLocal(s.class_date) >= monthStart).length,
        streak,
        bestStreak,
        minutes: sessions.reduce((sum, s) => {
            const start = parseLocal(s.class_date, s.start_time);
            const end = parseLocal(s.class_date, s.end_time);
            return sum + Math.max(0, Math.round((end - start) / 60000));
        }, 0),
        weekly: weekly.map(entry => ({
            weekStart: [entry.weekStart.getFullYear(), String(entry.weekStart.getMonth() + 1).padStart(2, "0"), String(entry.weekStart.getDate()).padStart(2, "0")].join("-"),
            count: entry.count
        })),
        byActivity: [...byActivity.entries()].map(([activity, count]) => ({ activity, count })).sort((a, b) => b.count - a.count),
        badges: BADGES.map(({ test, ...badge }) => ({ ...badge, earned: test(stats) }))
    };
}

export async function getProgress(userId) {
    // A finished class counts unless staff marked the member absent.
    const [sessions] = await pool.execute(
        `SELECT c.title, c.activity, c.class_date, c.start_time, c.end_time,
                CONCAT(u.first_name, ' ', u.last_name) AS trainer_name
         FROM ClassRegistrations cr
         INNER JOIN Classes c ON c.id = cr.class_id
         INNER JOIN Trainers t ON t.id = c.trainer_id
         INNER JOIN Users u ON u.id = t.user_id
         LEFT JOIN Attendance a ON a.class_registration_id = cr.id
         WHERE cr.user_id = ? AND cr.status = 'Registered'
           AND TIMESTAMP(c.class_date, c.end_time) <= NOW()
           AND (a.attended IS NULL OR a.attended = TRUE)`,
        [userId]
    );
    return computeProgress(sessions);
}
