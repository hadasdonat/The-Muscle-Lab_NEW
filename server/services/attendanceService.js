import pool from "../config/db.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function httpError(status, message) {
    return Object.assign(new Error(message), { status });
}

// Admins see every class. Trainers see only classes they teach.
async function trainerIdFor(user) {
    if (user.role === "Admin") return null;
    const [rows] = await pool.execute(`SELECT id FROM Trainers WHERE user_id = ?`, [user.id]);
    if (!rows[0]) throw httpError(403, "Your account is not linked to a trainer profile.");
    return rows[0].id;
}

function defaultRange() {
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - 14);
    const to = new Date(today);
    to.setDate(today.getDate() + 7);
    const key = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
    return { from: key(from), to: key(to) };
}

export async function listAttendanceClasses(user, { from, to } = {}) {
    const range = defaultRange();
    const start = from || range.from;
    const end = to || range.to;
    if (!DATE_PATTERN.test(start) || !DATE_PATTERN.test(end) || start > end) {
        throw httpError(400, "from and to must be dates in YYYY-MM-DD format, with from before to.");
    }
    const trainerId = await trainerIdFor(user);
    const [rows] = await pool.execute(
        `SELECT c.id, c.title, c.class_date, c.start_time, c.end_time, c.room, c.capacity,
                CONCAT(u.first_name, ' ', u.last_name) AS trainer_name,
                COUNT(cr.id) AS registered_count,
                COUNT(a.id) AS recorded_count,
                COALESCE(SUM(a.attended = TRUE), 0) AS attended_count,
                TIMESTAMP(c.class_date, c.start_time) <= NOW() AS has_started
         FROM Classes c
         INNER JOIN Trainers t ON t.id = c.trainer_id
         INNER JOIN Users u ON u.id = t.user_id
         LEFT JOIN ClassRegistrations cr ON cr.class_id = c.id AND cr.status = 'Registered'
         LEFT JOIN Attendance a ON a.class_registration_id = cr.id
         WHERE c.class_date BETWEEN ? AND ?
           AND (? IS NULL OR c.trainer_id = ?)
         GROUP BY c.id, c.title, c.class_date, c.start_time, c.end_time, c.room, c.capacity, u.first_name, u.last_name
         ORDER BY c.class_date DESC, c.start_time DESC`,
        [start, end, trainerId, trainerId]
    );
    return {
        from: start,
        to: end,
        classes: rows.map(row => ({
            ...row,
            registered_count: Number(row.registered_count),
            recorded_count: Number(row.recorded_count),
            attended_count: Number(row.attended_count),
            has_started: Boolean(row.has_started)
        }))
    };
}

async function loadClassForUser(connection, user, classId, lock = false) {
    const trainerId = await trainerIdFor(user);
    const [rows] = await connection.execute(
        `SELECT c.id, c.title, c.class_date, c.start_time, c.end_time, c.room, c.capacity, c.trainer_id,
                CONCAT(u.first_name, ' ', u.last_name) AS trainer_name,
                TIMESTAMP(c.class_date, c.start_time) <= NOW() AS has_started
         FROM Classes c
         INNER JOIN Trainers t ON t.id = c.trainer_id
         INNER JOIN Users u ON u.id = t.user_id
         WHERE c.id = ?${lock ? " FOR UPDATE" : ""}`,
        [classId]
    );
    const gymClass = rows[0];
    // Same 404 for "missing" and "not yours", so trainers can't probe other trainers' classes.
    if (!gymClass || (trainerId && gymClass.trainer_id !== trainerId)) throw httpError(404, "Class not found.");
    return { ...gymClass, has_started: Boolean(gymClass.has_started) };
}

async function loadRoster(connection, classId) {
    const [rows] = await connection.execute(
        `SELECT cr.id AS registration_id, u.id AS user_id, u.first_name, u.last_name, a.attended
         FROM ClassRegistrations cr
         INNER JOIN Users u ON u.id = cr.user_id
         LEFT JOIN Attendance a ON a.class_registration_id = cr.id
         WHERE cr.class_id = ? AND cr.status = 'Registered'
         ORDER BY u.first_name, u.last_name`,
        [classId]
    );
    return rows.map(row => ({ ...row, attended: row.attended === null ? null : Boolean(row.attended) }));
}

export async function getClassAttendance(user, classId) {
    const gymClass = await loadClassForUser(pool, user, classId);
    const roster = await loadRoster(pool, classId);
    return { class: gymClass, roster };
}

export function validateRecords(records) {
    if (!Array.isArray(records) || records.length === 0 || records.length > 500) {
        throw httpError(400, "Send a non-empty records list.");
    }
    const seen = new Set();
    for (const record of records) {
        if (typeof record?.registrationId !== "string" || typeof record.attended !== "boolean") {
            throw httpError(400, "Each record needs a registrationId and a true or false attended value.");
        }
        if (seen.has(record.registrationId)) throw httpError(400, "Each registration can appear only once.");
        seen.add(record.registrationId);
    }
}

export async function saveClassAttendance(user, classId, records) {
    validateRecords(records);
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const gymClass = await loadClassForUser(connection, user, classId, true);
        if (!gymClass.has_started) throw httpError(409, "Attendance can be recorded once the class has started.");

        const [registrations] = await connection.execute(
            `SELECT cr.id, a.id AS attendance_id
             FROM ClassRegistrations cr
             LEFT JOIN Attendance a ON a.class_registration_id = cr.id
             WHERE cr.class_id = ? AND cr.status = 'Registered'
             FOR UPDATE`,
            [classId]
        );
        const byId = new Map(registrations.map(row => [row.id, row]));
        for (const record of records) {
            if (!byId.has(record.registrationId)) {
                throw httpError(400, "One or more members are not registered for this class.");
            }
        }
        for (const record of records) {
            const existing = byId.get(record.registrationId);
            if (existing.attendance_id) {
                await connection.execute(`UPDATE Attendance SET attended = ? WHERE id = ?`, [record.attended, existing.attendance_id]);
            } else {
                await connection.execute(`INSERT INTO Attendance (class_registration_id, attended) VALUES (?, ?)`, [record.registrationId, record.attended]);
            }
        }
        await connection.commit();
        return { class: gymClass, roster: await loadRoster(connection, classId) };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}
