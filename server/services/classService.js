import pool from "../config/db.js";
import { ACTIVITY_NAMES, INTENSITIES } from "../config/activities.js";
import { createNotification } from "./notificationService.js";

function httpError(status, message) {
    return Object.assign(new Error(message), { status });
}

// Columns every class listing returns. Expects aliases c (Classes) and u (trainer's Users row),
// plus reg_count and, for a member, ur (their registration) and wl (their waitlist entry).
const CLASS_COLUMNS = `
    c.id, c.trainer_id, c.title, c.description, c.class_date, c.start_time, c.end_time,
    c.room, c.capacity, c.activity, c.intensity,
    CONCAT(u.first_name, ' ', u.last_name) AS trainer_name,
    COALESCE(reg_count.registered_count, 0) AS registered_count,
    c.capacity - COALESCE(reg_count.registered_count, 0) AS available_spots,
    TIMESTAMP(c.class_date, c.start_time) <= NOW() AS has_started`;

const REGISTRATION_COUNTS = `
    LEFT JOIN (
        SELECT class_id, COUNT(*) AS registered_count
        FROM ClassRegistrations
        WHERE status = 'Registered'
        GROUP BY class_id
    ) reg_count ON reg_count.class_id = c.id`;

const MEMBER_COLUMNS = `,
    CASE WHEN ur.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_registered,
    COALESCE(wl_count.waiting_count, 0) AS waitlist_count,
    (SELECT COUNT(*) FROM ClassWaitlist w2
       WHERE w2.class_id = c.id AND w2.status = 'Waiting' AND w2.created_at <= mine_wl.created_at) AS waitlist_position`;

const MEMBER_JOINS = `
    LEFT JOIN (
        SELECT class_id, user_id FROM ClassRegistrations WHERE user_id = ? AND status = 'Registered'
    ) ur ON ur.class_id = c.id
    LEFT JOIN (
        SELECT class_id, COUNT(*) AS waiting_count FROM ClassWaitlist WHERE status = 'Waiting' GROUP BY class_id
    ) wl_count ON wl_count.class_id = c.id
    LEFT JOIN ClassWaitlist mine_wl ON mine_wl.class_id = c.id AND mine_wl.user_id = ? AND mine_wl.status = 'Waiting'`;

function normalize(row) {
    const result = {
        ...row,
        registered_count: Number(row.registered_count),
        available_spots: Number(row.available_spots),
        has_started: Boolean(Number(row.has_started))
    };
    if ("waitlist_count" in row) {
        result.waitlist_count = Number(row.waitlist_count);
        // The position subquery returns 0 when the member isn't waiting.
        result.waitlist_position = Number(row.waitlist_position) || null;
    }
    return result;
}

// `when`: "upcoming" for classes that haven't started, anything else for all classes.
export async function getAllClasses(userId, { when } = {}) {
    const [rows] = await pool.execute(
        `SELECT ${CLASS_COLUMNS}${MEMBER_COLUMNS}
         FROM Classes c
         INNER JOIN Trainers t ON c.trainer_id = t.id
         INNER JOIN Users u ON t.user_id = u.id
         ${REGISTRATION_COUNTS}
         ${MEMBER_JOINS}
         ${when === "upcoming" ? "WHERE TIMESTAMP(c.class_date, c.start_time) > NOW()" : ""}
         ORDER BY c.class_date, c.start_time`,
        [userId, userId]
    );
    return rows.map(normalize);
}

export async function getClassDateCounts(startDate, endDate) {
    const [rows] = await pool.execute(
        `SELECT class_date, COUNT(*) AS count, GROUP_CONCAT(DISTINCT activity) AS activities
         FROM Classes
         WHERE class_date BETWEEN ? AND ?
         GROUP BY class_date`,
        [startDate, endDate]
    );
    return rows.map(row => ({ ...row, count: Number(row.count), activities: row.activities ? row.activities.split(",") : [] }));
}

export async function getClassesByDate(date, userId) {
    const [rows] = await pool.execute(
        `SELECT ${CLASS_COLUMNS}${MEMBER_COLUMNS}
         FROM Classes c
         INNER JOIN Trainers t ON c.trainer_id = t.id
         INNER JOIN Users u ON t.user_id = u.id
         ${REGISTRATION_COUNTS}
         ${MEMBER_JOINS}
         WHERE c.class_date = ?
         ORDER BY c.start_time`,
        [userId, userId, date]
    );
    return rows.map(normalize);
}

export async function getMyClasses(userId) {
    const [rows] = await pool.execute(
        `SELECT ${CLASS_COLUMNS}, cr.id AS registration_id, cr.registration_date, cr.status,
                a.attended, r.rating
         FROM Classes c
         INNER JOIN ClassRegistrations cr ON cr.class_id = c.id AND cr.user_id = ?
         INNER JOIN Trainers t ON c.trainer_id = t.id
         INNER JOIN Users u ON t.user_id = u.id
         ${REGISTRATION_COUNTS}
         LEFT JOIN Attendance a ON a.class_registration_id = cr.id
         LEFT JOIN ClassRatings r ON r.class_registration_id = cr.id
         WHERE cr.status = 'Registered'
         ORDER BY c.class_date, c.start_time`,
        [userId]
    );
    return rows.map(row => ({ ...normalize(row), attended: row.attended === null ? null : Boolean(row.attended), rating: row.rating ?? null }));
}

async function registerWithConnection(connection, classId, userId) {
    const [classRows] = await connection.execute(
        `SELECT id, title, capacity, class_date, start_time, TIMESTAMP(class_date, start_time) <= NOW() AS has_started
         FROM Classes WHERE id = ? FOR UPDATE`,
        [classId]
    );
    const gymClass = classRows[0];
    if (!gymClass) throw httpError(404, "Class not found.");

    const [registeredRows] = await connection.execute(
        `SELECT COUNT(*) AS count FROM ClassRegistrations WHERE class_id = ? AND status = 'Registered'`,
        [classId]
    );
    if (Number(registeredRows[0].count) >= gymClass.capacity) throw httpError(409, "Class is full.");

    const [existingRows] = await connection.execute(
        `SELECT id, status FROM ClassRegistrations WHERE class_id = ? AND user_id = ?`,
        [classId, userId]
    );
    if (existingRows.length > 0) {
        if (existingRows[0].status === "Registered") throw httpError(409, "You are already registered for this class.");
        await connection.execute(
            `UPDATE ClassRegistrations SET status = 'Registered', registration_date = CURRENT_TIMESTAMP WHERE id = ?`,
            [existingRows[0].id]
        );
    } else {
        await connection.execute(
            `INSERT INTO ClassRegistrations (class_id, user_id, status) VALUES (?, ?, 'Registered')`,
            [classId, userId]
        );
    }
    // Registering removes the member from this class's waitlist.
    await connection.execute(
        `UPDATE ClassWaitlist SET status = 'Promoted' WHERE class_id = ? AND user_id = ? AND status = 'Waiting'`,
        [classId, userId]
    );
    return gymClass;
}

export async function registerToClass(classId, userId) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await registerWithConnection(connection, classId, userId);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

function formatSlot(gymClass) {
    const [year, month, day] = String(gymClass.class_date).split("-").map(Number);
    const date = new Date(year, month - 1, day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    return `${date} at ${String(gymClass.start_time).slice(0, 5)}`;
}

// Cancels a registration and, in the same transaction, gives the place to the first person
// on the waitlist (if the class hasn't started). Returns the promoted user id, if any.
export async function cancelClassRegistration(classId, userId) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [classRows] = await connection.execute(
            `SELECT id, title, class_date, start_time, TIMESTAMP(class_date, start_time) <= NOW() AS has_started
             FROM Classes WHERE id = ? FOR UPDATE`,
            [classId]
        );
        const gymClass = classRows[0];
        const [rows] = await connection.execute(
            `SELECT id FROM ClassRegistrations WHERE class_id = ? AND user_id = ? AND status = 'Registered'`,
            [classId, userId]
        );
        if (!gymClass || rows.length === 0) throw httpError(404, "No active registration found for this class.");
        await connection.execute(`UPDATE ClassRegistrations SET status = 'Cancelled' WHERE id = ?`, [rows[0].id]);

        let promoted = null;
        if (!Number(gymClass.has_started)) {
            const [waiting] = await connection.execute(
                `SELECT id, user_id FROM ClassWaitlist WHERE class_id = ? AND status = 'Waiting' ORDER BY created_at, id LIMIT 1 FOR UPDATE`,
                [classId]
            );
            if (waiting[0]) {
                await registerWithConnection(connection, classId, waiting[0].user_id);
                await createNotification(connection, waiting[0].user_id, {
                    type: "waitlist",
                    title: `You're in: ${gymClass.title}`,
                    body: `A place opened up in ${gymClass.title} on ${formatSlot(gymClass)}. You've been registered from the waitlist.`,
                    link: "/member/classes"
                });
                promoted = waiting[0].user_id;
            }
        }
        await connection.commit();
        return { promoted };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export async function joinWaitlist(classId, userId) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [classRows] = await connection.execute(
            `SELECT id, capacity, TIMESTAMP(class_date, start_time) <= NOW() AS has_started FROM Classes WHERE id = ? FOR UPDATE`,
            [classId]
        );
        const gymClass = classRows[0];
        if (!gymClass) throw httpError(404, "Class not found.");
        if (Number(gymClass.has_started)) throw httpError(409, "This class has already started.");
        const [[count]] = await connection.execute(
            `SELECT COUNT(*) AS n FROM ClassRegistrations WHERE class_id = ? AND status = 'Registered'`,
            [classId]
        );
        if (Number(count.n) < gymClass.capacity) throw httpError(409, "There's still room in this class, so you can register directly.");
        const [mine] = await connection.execute(
            `SELECT 1 FROM ClassRegistrations WHERE class_id = ? AND user_id = ? AND status = 'Registered'`,
            [classId, userId]
        );
        if (mine.length) throw httpError(409, "You are already registered for this class.");
        await connection.execute(
            `INSERT INTO ClassWaitlist (class_id, user_id, status) VALUES (?, ?, 'Waiting')
             ON DUPLICATE KEY UPDATE status = 'Waiting', created_at = CURRENT_TIMESTAMP`,
            [classId, userId]
        );
        const [[position]] = await connection.execute(
            `SELECT COUNT(*) AS n FROM ClassWaitlist WHERE class_id = ? AND status = 'Waiting'`,
            [classId]
        );
        await connection.commit();
        return { position: Number(position.n) };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export async function leaveWaitlist(classId, userId) {
    const [result] = await pool.execute(
        `UPDATE ClassWaitlist SET status = 'Left' WHERE class_id = ? AND user_id = ? AND status = 'Waiting'`,
        [classId, userId]
    );
    if (result.affectedRows === 0) throw httpError(404, "You're not on the waitlist for this class.");
}

export async function getAllClassesAdmin() {
    const [rows] = await pool.execute(
        `SELECT ${CLASS_COLUMNS},
                COALESCE(wl_count.waiting_count, 0) AS waitlist_count
         FROM Classes c
         INNER JOIN Trainers t ON c.trainer_id = t.id
         INNER JOIN Users u ON t.user_id = u.id
         ${REGISTRATION_COUNTS}
         LEFT JOIN (
             SELECT class_id, COUNT(*) AS waiting_count FROM ClassWaitlist WHERE status = 'Waiting' GROUP BY class_id
         ) wl_count ON wl_count.class_id = c.id
         ORDER BY c.class_date, c.start_time`
    );
    return rows.map(row => ({ ...normalize(row), waitlist_count: Number(row.waitlist_count) }));
}

export async function findClassById(id) {
    const [rows] = await pool.execute(
        `SELECT ${CLASS_COLUMNS}
         FROM Classes c
         INNER JOIN Trainers t ON c.trainer_id = t.id
         INNER JOIN Users u ON t.user_id = u.id
         ${REGISTRATION_COUNTS}
         WHERE c.id = ?`,
        [id]
    );
    if (rows.length === 0) throw new Error("Class not found.");
    return normalize(rows[0]);
}

function validateClass(gymClass) {
    if (!gymClass.trainer_id || typeof gymClass.title !== "string" || !gymClass.title.trim() ||
        !/^\d{4}-\d{2}-\d{2}$/.test(gymClass.class_date || "") ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(gymClass.start_time || "") ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(gymClass.end_time || "") ||
        !Number.isInteger(Number(gymClass.capacity)) || Number(gymClass.capacity) <= 0) {
        throw new Error("A trainer, title, valid schedule, and positive integer capacity are required.");
    }
    const date = new Date(`${gymClass.class_date}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== gymClass.class_date ||
        gymClass.end_time.padEnd(8, ":00") <= gymClass.start_time.padEnd(8, ":00")) {
        throw new Error("Class date must be valid and end time must be after start time.");
    }
    if (gymClass.activity && !ACTIVITY_NAMES.includes(gymClass.activity)) {
        throw new Error("Choose an activity from the list.");
    }
    if (gymClass.intensity && !INTENSITIES.includes(gymClass.intensity)) {
        throw new Error("Intensity must be Low, Medium or High.");
    }
}

function classValues(gymClass) {
    return [
        gymClass.trainer_id,
        gymClass.title,
        gymClass.description ?? null,
        gymClass.class_date,
        gymClass.start_time,
        gymClass.end_time,
        gymClass.room ?? null,
        gymClass.capacity,
        gymClass.activity || null,
        gymClass.intensity || null
    ];
}

export async function createClass(gymClass) {
    validateClass(gymClass);
    await pool.execute(
        `INSERT INTO Classes (trainer_id, title, description, class_date, start_time, end_time, room, capacity, activity, intensity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        classValues(gymClass)
    );
}

export async function updateClass(id, gymClass) {
    validateClass(gymClass);
    const [result] = await pool.execute(
        `UPDATE Classes
         SET trainer_id = ?, title = ?, description = ?, class_date = ?, start_time = ?, end_time = ?,
             room = ?, capacity = ?, activity = ?, intensity = ?
         WHERE id = ?`,
        [...classValues(gymClass), id]
    );
    if (result.affectedRows === 0) throw new Error("Class not found.");
}

export async function deleteClass(id) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [[registrations]] = await connection.execute(
            `SELECT COUNT(*) AS n FROM ClassRegistrations WHERE class_id = ?`,
            [id]
        );
        if (Number(registrations.n) > 0) {
            throw new Error("This class has bookings, so it can't be deleted. Edit it instead.");
        }
        await connection.execute(`DELETE FROM ClassWaitlist WHERE class_id = ?`, [id]);
        const [result] = await connection.execute(`DELETE FROM Classes WHERE id = ?`, [id]);
        if (result.affectedRows === 0) throw new Error("Class not found.");
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

export async function getClassParticipants(classId) {
    const [rows] = await pool.execute(
        `SELECT u.id, u.first_name, u.last_name, u.email, cr.registration_date, cr.status
         FROM ClassRegistrations cr
         INNER JOIN Users u ON cr.user_id = u.id
         WHERE cr.class_id = ?
         ORDER BY cr.registration_date DESC`,
        [classId]
    );
    return rows;
}
