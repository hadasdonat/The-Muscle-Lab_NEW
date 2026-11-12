// Realistic, date-relative demo data. Everything here is idempotent: running it again only
// adds what is missing, so the API can call it on every start to keep the schedule rolling
// forward (classes up to two weeks ahead) without duplicating anything.
import { hashPassword } from "../utils/hashPassword.js";
import { findActivity } from "../config/activities.js";

export const DEMO_DOMAIN = "musclelab.demo";

const TRAINERS = [
    { first: "Dana", last: "Levi", email: `trainer@${DEMO_DOMAIN}`, specialization: "Yoga, Pilates and mobility", years: 7 },
    { first: "Omer", last: "Katz", email: `omer.katz@${DEMO_DOMAIN}`, specialization: "Strength and HIIT", years: 9 },
    { first: "Noa", last: "Bar", email: `noa.bar@${DEMO_DOMAIN}`, specialization: "Indoor cycling and dance", years: 4 },
    { first: "Yael", last: "Mor", email: `yael.mor@${DEMO_DOMAIN}`, specialization: "Boxing and kickboxing", years: 6 },
    { first: "Ido", last: "Sasson", email: `ido.sasson@${DEMO_DOMAIN}`, specialization: "CrossFit and functional training", years: 5 }
];

// Each member has favourite activities and a time of day; they book those far more often.
const MEMBERS = [
    { first: "Maya", last: "Cohen", email: `member@${DEMO_DOMAIN}`, likes: ["Yoga", "Pilates", "Barre"], evening: true, plan: "Premium", joinedDaysAgo: 50 },
    { first: "Yonatan", last: "Mizrahi", likes: ["HIIT", "Strength", "CrossFit"], evening: false, plan: "VIP", joinedDaysAgo: 40 },
    { first: "Shira", last: "Peretz", likes: ["Spinning", "Zumba"], evening: true, plan: "Basic", joinedDaysAgo: 12 },
    { first: "Itai", last: "Friedman", likes: ["Strength", "Boxing"], evening: true, plan: "Premium", joinedDaysAgo: 55 },
    { first: "Noga", last: "Azoulay", likes: ["Yoga", "Meditation"], evening: false, plan: "VIP", joinedDaysAgo: 6 },
    { first: "Eitan", last: "Shapiro", likes: ["HIIT", "Spinning", "Kickboxing"], evening: false, plan: null, joinedDaysAgo: 33 },
    { first: "Tamar", last: "Golan", likes: ["Pilates", "Yoga", "Barre"], evening: true, plan: "Basic", joinedDaysAgo: 20 },
    { first: "Amit", last: "Ben David", likes: ["Strength", "HIIT", "TRX"], evening: true, plan: "VIP", joinedDaysAgo: 2 },
    { first: "Lior", last: "Avraham", likes: ["Spinning", "Yoga", "Bootcamp"], evening: false, plan: null, joinedDaysAgo: 45 },
    { first: "Roni", last: "Klein", likes: ["Pilates", "Stretching", "Zumba", "Boxing"], evening: false, plan: "Premium", joinedDaysAgo: 9 }
].map(member => ({
    ...member,
    email: member.email || `${member.first.toLowerCase()}.${member.last.toLowerCase().replace(/\s+/g, "")}@${DEMO_DOMAIN}`
}));

// Weekly timetable: [weekday (0 = Sunday), activity, start, end, room, capacity, trainer index]
const TIMETABLE = [
    [0, "HIIT", "07:00", "07:45", "Studio A", 16, 1], [0, "Boxing", "12:00", "13:00", "Combat Zone", 10, 3],
    [0, "Yoga", "18:30", "19:30", "Studio B", 14, 0], [0, "CrossFit", "19:30", "20:30", "The Box", 12, 4],
    [1, "Spinning", "07:00", "07:45", "Bike Room", 12, 2], [1, "TRX", "08:30", "09:15", "Studio A", 10, 4],
    [1, "Kickboxing", "18:00", "19:00", "Combat Zone", 12, 3], [1, "Strength", "19:00", "20:00", "Weights Hall", 10, 1],
    [2, "Pilates", "09:00", "10:00", "Studio B", 12, 0], [2, "Zumba", "16:45", "17:45", "Studio A", 20, 2],
    [2, "HIIT", "18:00", "18:45", "Studio A", 16, 1], [2, "Meditation", "20:30", "21:00", "Studio B", 15, 0],
    [3, "Yoga", "07:30", "08:30", "Studio B", 14, 0], [3, "Bootcamp", "17:00", "18:00", "Outdoor Court", 16, 4],
    [3, "Spinning", "19:00", "19:45", "Bike Room", 12, 2], [3, "Boxing", "20:00", "21:00", "Combat Zone", 8, 3],
    [4, "Strength", "07:00", "08:00", "Weights Hall", 10, 1], [4, "Barre", "10:00", "10:50", "Studio B", 12, 0],
    [4, "Pilates", "18:30", "19:30", "Studio B", 12, 0], [4, "CrossFit", "19:30", "20:30", "The Box", 12, 4],
    [5, "Yoga", "09:00", "10:00", "Studio B", 14, 0], [5, "Spinning", "10:30", "11:15", "Bike Room", 12, 2],
    [5, "Stretching", "12:00", "12:45", "Studio B", 15, 0], [5, "Zumba", "12:00", "13:00", "Studio A", 20, 2],
    [6, "Bootcamp", "09:00", "10:00", "Outdoor Court", 16, 4], [6, "Stretching", "10:30", "11:15", "Studio B", 15, 0]
];

const DESCRIPTIONS = {
    Yoga: "Vinyasa flow with a focus on breath and mobility.",
    Pilates: "Mat Pilates for core strength and posture.",
    Barre: "Ballet-inspired toning with small, precise movements.",
    Stretching: "Slow mobility work to recover and loosen up.",
    Meditation: "Guided breathing to wind down the day.",
    HIIT: "Short, intense intervals with bodyweight and kettlebells.",
    Spinning: "Indoor cycling set to music, with climbs and sprints.",
    Zumba: "Dance cardio to Latin rhythms. No experience needed.",
    Strength: "Coached barbell and dumbbell work in small groups.",
    CrossFit: "Functional movements at high intensity, scaled to your level.",
    TRX: "Suspension training that builds strength with your own body weight.",
    Bootcamp: "Team circuits outdoors: sprints, sleds and carries.",
    Boxing: "Pads, bags and footwork drills. Gloves provided.",
    Kickboxing: "Punch and kick combinations for full-body conditioning."
};

const COMMENTS = [
    "Great energy, loved it!", "Challenging but fun.", "Clear instructions, felt safe the whole time.",
    "Perfect way to start the day.", "Music was amazing.", "Would love a longer cool-down.", "Best class this week."
];

// Deterministic pseudo-random number from a string, so every run makes the same choices.
function chance(key) {
    let hash = 2166136261;
    for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    return (hash % 10000) / 10000;
}

function dateKey(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function daysFromToday(offset) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return date;
}

function sqlDateTime(date) {
    return `${dateKey(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:00`;
}

async function ensureUser(connection, person, roleId, passwordHash, joinedDaysAgo) {
    const [rows] = await connection.execute("SELECT id FROM Users WHERE email = ?", [person.email]);
    if (rows[0]) return { id: rows[0].id, created: false };
    const joined = daysFromToday(-joinedDaysAgo);
    await connection.execute(
        `INSERT INTO Users (role_id, first_name, last_name, email, password_hash, join_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [roleId, person.first, person.last, person.email, passwordHash, dateKey(joined), `${dateKey(joined)} 10:00:00`]
    );
    const [[row]] = await connection.execute("SELECT id FROM Users WHERE email = ?", [person.email]);
    return { id: row.id, created: true };
}

export async function ensureDemoData(connection, { password, log = console.log } = {}) {
    const [[trainerRole]] = await connection.execute("SELECT id FROM Roles WHERE name = 'Trainer'");
    const [[memberRole]] = await connection.execute("SELECT id FROM Roles WHERE name = 'Member'");
    const [plans] = await connection.execute("SELECT id, name, duration_months FROM MembershipPlans");
    const planByName = new Map(plans.map(plan => [plan.name, plan]));
    let passwordHash = null;
    const needHash = async () => (passwordHash ??= await hashPassword(password));
    const added = { trainers: 0, members: 0, classes: 0, bookings: 0, ratings: 0 };

    // People
    const trainerIds = [];
    for (const trainer of TRAINERS) {
        const [existing] = await connection.execute("SELECT id FROM Users WHERE email = ?", [trainer.email]);
        if (!existing[0] && !password) throw new Error("DEMO_PASSWORD is needed to create demo accounts.");
        const user = await ensureUser(connection, trainer, trainerRole.id, existing[0] ? null : await needHash(), 400);
        let [[row]] = await connection.execute("SELECT id FROM Trainers WHERE user_id = ?", [user.id]);
        if (!row) {
            await connection.execute(
                "INSERT INTO Trainers (user_id, specialization, experience_years, biography) VALUES (?, ?, ?, ?)",
                [user.id, trainer.specialization, trainer.years, `${trainer.first} coaches ${trainer.specialization.toLowerCase()} at The Muscle Lab.`]
            );
            [[row]] = await connection.execute("SELECT id FROM Trainers WHERE user_id = ?", [user.id]);
            added.trainers += 1;
        }
        trainerIds.push(row.id);
    }
    for (const member of MEMBERS) {
        const [existing] = await connection.execute("SELECT id FROM Users WHERE email = ?", [member.email]);
        const user = await ensureUser(connection, member, memberRole.id, existing[0] ? null : await needHash(), member.joinedDaysAgo);
        member.id = user.id;
        const plan = member.plan && planByName.get(member.plan);
        if (user.created && plan) {
            const start = daysFromToday(-Math.min(member.joinedDaysAgo, 25));
            const end = new Date(start);
            end.setMonth(end.getMonth() + plan.duration_months);
            await connection.execute(
                "INSERT INTO UserMemberships (user_id, membership_plan_id, start_date, end_date, status) VALUES (?, ?, ?, ?, 'Active')",
                [member.id, plan.id, dateKey(start), dateKey(end)]
            );
        }
        if (user.created) added.members += 1;
    }

    // Schedule: three weeks back, two weeks ahead. Only missing slots are added.
    const now = new Date();
    const newClasses = [];
    for (let offset = -21; offset <= 14; offset += 1) {
        const day = daysFromToday(offset);
        for (const [weekday, activity, start, end, room, capacity, trainerIndex] of TIMETABLE) {
            if (day.getDay() !== weekday) continue;
            const [found] = await connection.execute(
                "SELECT id FROM Classes WHERE trainer_id = ? AND class_date = ? AND start_time = ?",
                [trainerIds[trainerIndex], dateKey(day), `${start}:00`]
            );
            if (found[0]) continue;
            await connection.execute(
                `INSERT INTO Classes (trainer_id, title, description, class_date, start_time, end_time, room, capacity, activity, intensity)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [trainerIds[trainerIndex], activity, DESCRIPTIONS[activity], dateKey(day), `${start}:00`, `${end}:00`, room, capacity, activity, findActivity(activity)?.intensity || null]
            );
            const [[row]] = await connection.execute(
                "SELECT id FROM Classes WHERE trainer_id = ? AND class_date = ? AND start_time = ?",
                [trainerIds[trainerIndex], dateKey(day), `${start}:00`]
            );
            newClasses.push({ id: row.id, activity, day, offset, start, capacity, startsAt: new Date(`${dateKey(day)}T${start}:00`) });
            added.classes += 1;
        }
    }

    // Bookings and attendance for the new classes, following each member's habits.
    for (const gymClass of newClasses) {
        const isEvening = Number(gymClass.start.slice(0, 2)) >= 16;
        let booked = 0;
        for (const member of MEMBERS) {
            if (gymClass.offset < -member.joinedDaysAgo || booked >= gymClass.capacity - 1) continue;
            const roll = chance(`${member.email}|${dateKey(gymClass.day)}|${gymClass.start}`);
            const likes = member.likes.includes(gymClass.activity);
            const fitsTime = member.evening === isEvening;
            const probability = likes ? (fitsTime ? 0.75 : 0.35) : 0.04;
            // Upcoming classes get fewer bookings so there are open places to suggest.
            if (roll > (gymClass.offset > 0 ? probability * 0.5 : probability)) continue;
            let bookedAt = new Date(gymClass.startsAt);
            bookedAt.setDate(bookedAt.getDate() - 2);
            bookedAt.setHours(8 + Math.floor(roll * 12));
            if (bookedAt > now) bookedAt = new Date(now.getTime() - Math.floor(roll * 72) * 3600 * 1000);
            await connection.execute(
                "INSERT INTO ClassRegistrations (class_id, user_id, registration_date) VALUES (?, ?, ?)",
                [gymClass.id, member.id, sqlDateTime(bookedAt)]
            );
            booked += 1;
            added.bookings += 1;
            // Attendance is recorded for classes older than two days; the most recent ones are left to record.
            if (gymClass.startsAt < now && gymClass.offset < -2) {
                const [[registration]] = await connection.execute(
                    "SELECT id FROM ClassRegistrations WHERE class_id = ? AND user_id = ?",
                    [gymClass.id, member.id]
                );
                await connection.execute(
                    "INSERT INTO Attendance (class_registration_id, attended) VALUES (?, ?)",
                    [registration.id, roll < probability * 0.85]
                );
            }
        }
    }

    // Ratings for some attended classes that don't have one yet.
    const [toRate] = await connection.execute(
        `SELECT cr.id, u.email, c.class_date
         FROM ClassRegistrations cr
         INNER JOIN Users u ON u.id = cr.user_id
         INNER JOIN Classes c ON c.id = cr.class_id
         INNER JOIN Attendance a ON a.class_registration_id = cr.id AND a.attended = TRUE
         LEFT JOIN ClassRatings r ON r.class_registration_id = cr.id
         WHERE u.email LIKE ? AND r.id IS NULL`,
        [`%@${DEMO_DOMAIN}`]
    );
    for (const row of toRate) {
        const roll = chance(`rating|${row.id}`);
        if (roll > 0.55) continue;
        const rating = roll < 0.35 ? 5 : roll < 0.5 ? 4 : 3;
        const comment = roll < 0.3 ? COMMENTS[Math.floor(roll * 100) % COMMENTS.length] : null;
        await connection.execute(
            "INSERT INTO ClassRatings (class_registration_id, rating, comment, created_at) VALUES (?, ?, ?, ?)",
            [row.id, rating, comment, `${row.class_date} 21:00:00`]
        );
        added.ratings += 1;
    }

    // A full class with a waitlist, so the waitlist can be seen in the demo.
    const [[waiting]] = await connection.execute("SELECT COUNT(*) AS n FROM ClassWaitlist WHERE status = 'Waiting'");
    if (Number(waiting.n) === 0) {
        const [[boxing]] = await connection.execute(
            `SELECT c.id, c.capacity FROM Classes c
             WHERE c.activity = 'Boxing' AND c.capacity <= 8 AND TIMESTAMP(c.class_date, c.start_time) > NOW() + INTERVAL 1 DAY
             ORDER BY c.class_date LIMIT 1`
        );
        if (boxing) {
            const others = MEMBERS.filter(member => member.email !== `member@${DEMO_DOMAIN}`);
            const [current] = await connection.execute("SELECT user_id FROM ClassRegistrations WHERE class_id = ? AND status = 'Registered'", [boxing.id]);
            const taken = new Set(current.map(row => row.user_id));
            let count = taken.size;
            for (const member of others) {
                if (count >= boxing.capacity) break;
                if (taken.has(member.id)) continue;
                await connection.execute(
                    "INSERT INTO ClassRegistrations (class_id, user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE status = 'Registered'",
                    [boxing.id, member.id]
                );
                taken.add(member.id);
                count += 1;
            }
            const waitlisters = others.filter(member => !taken.has(member.id)).slice(0, 2);
            for (const member of waitlisters) {
                await connection.execute("INSERT IGNORE INTO ClassWaitlist (class_id, user_id) VALUES (?, ?)", [boxing.id, member.id]);
            }
        }
    }

    // The demo member starts with favourites and a welcome message.
    const maya = MEMBERS[0];
    const [[favourites]] = await connection.execute("SELECT COUNT(*) AS n FROM FavoriteActivities WHERE user_id = ?", [maya.id]);
    if (Number(favourites.n) === 0) {
        for (const activity of ["Yoga", "Pilates"]) {
            await connection.execute("INSERT INTO FavoriteActivities (user_id, activity) VALUES (?, ?)", [maya.id, activity]);
        }
    }
    const [[notes]] = await connection.execute("SELECT COUNT(*) AS n FROM Notifications WHERE user_id = ?", [maya.id]);
    if (Number(notes.n) === 0) {
        await connection.execute(
            "INSERT INTO Notifications (user_id, type, title, body, link) VALUES (?, 'welcome', ?, ?, ?)",
            [maya.id, "Welcome to The Muscle Lab", "Ask the AI Coach anything about training, or let it pick your next class.", "/member/coach"]
        );
    }

    log(`Demo data: added ${added.trainers} trainers, ${added.members} members, ${added.classes} classes, ${added.bookings} bookings and ${added.ratings} ratings.`);
    return added;
}
