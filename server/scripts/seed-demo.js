// Adds a realistic, date-relative demo data set to an initialized database:
// three trainers, ten members, five weeks of classes (three in the past, two ahead),
// bookings that follow each member's habits, and attendance for past classes.
// The two most recent days are left unrecorded so the attendance screen has work to show.
//
// Usage: DEMO_PASSWORD='<shared demo password>' npm run db:demo --prefix server
import pool from "../config/db.js";
import { hashPassword } from "../utils/hashPassword.js";

if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1") {
    throw new Error("Set ALLOW_DEMO_SEED=1 to add demo data to a production database on purpose.");
}
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 8) throw new Error("Set DEMO_PASSWORD (at least 8 characters) for the demo accounts.");

const DOMAIN = "musclelab.demo";
const trainers = [
    { first: "Dana", last: "Levi", email: `trainer@${DOMAIN}`, specialization: "Yoga and mobility", years: 7 },
    { first: "Omer", last: "Katz", email: `omer.katz@${DOMAIN}`, specialization: "Strength and HIIT", years: 9 },
    { first: "Noa", last: "Bar", email: `noa.bar@${DOMAIN}`, specialization: "Indoor cycling", years: 4 }
];
// Each member has a favourite class and a time of day; they book those far more often.
const members = [
    { first: "Maya", last: "Cohen", email: `member@${DOMAIN}`, likes: ["Yoga", "Pilates"], evening: true, plan: "Premium", joinedDaysAgo: 50 },
    { first: "Yonatan", last: "Mizrahi", likes: ["HIIT", "Strength"], evening: false, plan: "VIP", joinedDaysAgo: 40 },
    { first: "Shira", last: "Peretz", likes: ["Spinning"], evening: true, plan: "Basic", joinedDaysAgo: 12 },
    { first: "Itai", last: "Friedman", likes: ["Strength"], evening: true, plan: "Premium", joinedDaysAgo: 55 },
    { first: "Noga", last: "Azoulay", likes: ["Yoga"], evening: false, plan: "VIP", joinedDaysAgo: 6 },
    { first: "Eitan", last: "Shapiro", likes: ["HIIT", "Spinning"], evening: false, plan: null, joinedDaysAgo: 33 },
    { first: "Tamar", last: "Golan", likes: ["Pilates", "Yoga"], evening: true, plan: "Basic", joinedDaysAgo: 20 },
    { first: "Amit", last: "Ben David", likes: ["Strength", "HIIT"], evening: true, plan: "VIP", joinedDaysAgo: 2 },
    { first: "Lior", last: "Avraham", likes: ["Spinning", "Yoga"], evening: false, plan: null, joinedDaysAgo: 45 },
    { first: "Roni", last: "Klein", likes: ["Pilates"], evening: false, plan: "Premium", joinedDaysAgo: 9 }
].map((member, index) => ({ ...member, email: member.email || `${member.first.toLowerCase()}.${member.last.toLowerCase().replace(/\s+/g, "")}@${DOMAIN}`, seed: index + 1 }));

// Weekly timetable: [weekday (0 = Sunday), title, start, end, room, capacity, trainer index]
const timetable = [
    [0, "HIIT", "07:00", "07:45", "Studio A", 16, 1], [0, "Yoga", "18:30", "19:30", "Studio B", 14, 0],
    [1, "Spinning", "07:00", "07:45", "Bike Room", 12, 2], [1, "Strength", "19:00", "20:00", "Weights Hall", 10, 1],
    [2, "Pilates", "09:00", "10:00", "Studio B", 12, 0], [2, "HIIT", "18:00", "18:45", "Studio A", 16, 1],
    [3, "Yoga", "07:30", "08:30", "Studio B", 14, 0], [3, "Spinning", "19:00", "19:45", "Bike Room", 12, 2],
    [4, "Strength", "07:00", "08:00", "Weights Hall", 10, 1], [4, "Pilates", "18:30", "19:30", "Studio B", 12, 0],
    [5, "Yoga", "09:00", "10:00", "Studio B", 14, 0], [5, "Spinning", "10:30", "11:15", "Bike Room", 12, 2]
];
const descriptions = {
    HIIT: "Short, intense intervals with bodyweight and kettlebells.",
    Yoga: "Vinyasa flow with a focus on breath and mobility.",
    Spinning: "Indoor cycling set to music, with climbs and sprints.",
    Strength: "Coached barbell and dumbbell work in small groups.",
    Pilates: "Mat Pilates for core strength and posture."
};

// Small deterministic generator so every run produces the same pattern.
function random(seed) {
    let state = seed * 9301 + 49297;
    return () => {
        state = (state * 9301 + 49297) % 233280;
        return state / 233280;
    };
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

const connection = await pool.getConnection();
try {
    const [existing] = await connection.execute("SELECT id FROM Users WHERE email = ?", [`member@${DOMAIN}`]);
    if (existing.length) throw new Error("Demo data already exists in this database.");

    await connection.beginTransaction();
    const passwordHash = await hashPassword(password);
    const [[trainerRole]] = await connection.execute("SELECT id FROM Roles WHERE name = 'Trainer'");
    const [[memberRole]] = await connection.execute("SELECT id FROM Roles WHERE name = 'Member'");
    const [plans] = await connection.execute("SELECT id, name, duration_months FROM MembershipPlans");
    const planByName = new Map(plans.map(plan => [plan.name, plan]));

    async function createUser(person, roleId, joinedDaysAgo = 60) {
        const joined = daysFromToday(-joinedDaysAgo);
        await connection.execute(
            `INSERT INTO Users (role_id, first_name, last_name, email, password_hash, join_date, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [roleId, person.first, person.last, person.email, passwordHash, dateKey(joined), `${dateKey(joined)} 10:00:00`]
        );
        const [[row]] = await connection.execute("SELECT id FROM Users WHERE email = ?", [person.email]);
        return row.id;
    }

    const trainerIds = [];
    for (const trainer of trainers) {
        const userId = await createUser(trainer, trainerRole.id, 400);
        await connection.execute(
            "INSERT INTO Trainers (user_id, specialization, experience_years, biography) VALUES (?, ?, ?, ?)",
            [userId, trainer.specialization, trainer.years, `${trainer.first} coaches ${trainer.specialization.toLowerCase()} at The Muscle Lab.`]
        );
        const [[row]] = await connection.execute("SELECT id FROM Trainers WHERE user_id = ?", [userId]);
        trainerIds.push(row.id);
    }

    for (const member of members) {
        member.id = await createUser(member, memberRole.id, member.joinedDaysAgo);
        const plan = member.plan && planByName.get(member.plan);
        if (plan) {
            const start = daysFromToday(-Math.min(member.joinedDaysAgo, 25));
            const end = new Date(start);
            end.setMonth(end.getMonth() + plan.duration_months);
            await connection.execute(
                "INSERT INTO UserMemberships (user_id, membership_plan_id, start_date, end_date, status) VALUES (?, ?, ?, ?, 'Active')",
                [member.id, plan.id, dateKey(start), dateKey(end)]
            );
        }
    }

    const now = new Date();
    let classCount = 0;
    let bookingCount = 0;
    for (let offset = -21; offset <= 14; offset += 1) {
        const day = daysFromToday(offset);
        for (const [weekday, title, start, end, room, capacity, trainerIndex] of timetable) {
            if (day.getDay() !== weekday) continue;
            await connection.execute(
                `INSERT INTO Classes (trainer_id, title, description, class_date, start_time, end_time, room, capacity)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [trainerIds[trainerIndex], title, descriptions[title], dateKey(day), `${start}:00`, `${end}:00`, room, capacity]
            );
            const [[gymClass]] = await connection.execute(
                "SELECT id FROM Classes WHERE trainer_id = ? AND class_date = ? AND start_time = ?",
                [trainerIds[trainerIndex], dateKey(day), `${start}:00`]
            );
            classCount += 1;

            const startsAt = new Date(`${dateKey(day)}T${start}:00`);
            const isEvening = Number(start.slice(0, 2)) >= 16;
            const joinedBefore = member => offset >= -member.joinedDaysAgo;
            let booked = 0;
            for (const member of members) {
                if (!joinedBefore(member) || booked >= capacity - 1) continue;
                const roll = random(member.seed * 1000 + offset * 13 + weekday)();
                const likes = member.likes.includes(title);
                const fitsTime = member.evening === isEvening;
                const chance = likes ? (fitsTime ? 0.75 : 0.35) : 0.05;
                // Future classes get fewer bookings so the coach has open places to suggest.
                if (roll > (offset > 0 ? chance * 0.5 : chance)) continue;
                const bookedAt = new Date(startsAt);
                bookedAt.setDate(bookedAt.getDate() - 2);
                bookedAt.setHours(8 + Math.floor(roll * 12));
                // Bookings for upcoming classes happened during the last few days, never in the future.
                const bookedAtValue = bookedAt > now ? new Date(now.getTime() - Math.floor(roll * 72) * 3600 * 1000) : bookedAt;
                await connection.execute(
                    "INSERT INTO ClassRegistrations (class_id, user_id, registration_date) VALUES (?, ?, ?)",
                    [gymClass.id, member.id, `${dateKey(bookedAtValue)} ${String(bookedAtValue.getHours()).padStart(2, "0")}:00:00`]
                );
                booked += 1;
                bookingCount += 1;
                if (startsAt < now && offset < -2) {
                    const [[registration]] = await connection.execute(
                        "SELECT id FROM ClassRegistrations WHERE class_id = ? AND user_id = ?",
                        [gymClass.id, member.id]
                    );
                    await connection.execute(
                        "INSERT INTO Attendance (class_registration_id, attended) VALUES (?, ?)",
                        [registration.id, roll < chance * 0.85]
                    );
                }
            }
        }
    }

    await connection.commit();
    console.log(`Added ${trainers.length} trainers, ${members.length} members, ${classCount} classes and ${bookingCount} bookings.`);
    console.log(`Demo logins: member@${DOMAIN} (member), trainer@${DOMAIN} (trainer), password from DEMO_PASSWORD.`);
} catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
} finally {
    connection.release();
    await pool.end();
}
