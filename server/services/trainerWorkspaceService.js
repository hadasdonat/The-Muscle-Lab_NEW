import pool from "../config/db.js";

function httpError(status, message) {
    return Object.assign(new Error(message), { status });
}

export async function getTrainerOverview(userId) {
    const [[trainer]] = await pool.execute(
        `SELECT t.id, t.specialization, t.experience_years, u.first_name, u.last_name
         FROM Trainers t INNER JOIN Users u ON u.id = t.user_id WHERE t.user_id = ?`,
        [userId]
    );
    if (!trainer) throw httpError(403, "Your account is not linked to a trainer profile.");

    const [[schedule], [[month]], [[ratings]], [recentRatings], [[attendance]]] = await Promise.all([
        pool.execute(
            `SELECT c.id, c.title, c.activity, c.intensity, c.class_date, c.start_time, c.end_time, c.room, c.capacity,
                    COUNT(cr.id) AS registered_count,
                    (SELECT COUNT(*) FROM ClassWaitlist w WHERE w.class_id = c.id AND w.status = 'Waiting') AS waitlist_count
             FROM Classes c
             LEFT JOIN ClassRegistrations cr ON cr.class_id = c.id AND cr.status = 'Registered'
             WHERE c.trainer_id = ? AND c.class_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL 6 DAY
             GROUP BY c.id, c.title, c.activity, c.intensity, c.class_date, c.start_time, c.end_time, c.room, c.capacity
             ORDER BY c.class_date, c.start_time`,
            [trainer.id]
        ),
        pool.execute(
            `SELECT COUNT(*) AS classes FROM Classes
             WHERE trainer_id = ? AND class_date >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') AND class_date <= CURRENT_DATE`,
            [trainer.id]
        ),
        pool.execute(
            `SELECT ROUND(AVG(r.rating), 1) AS average, COUNT(r.id) AS count
             FROM ClassRatings r
             INNER JOIN ClassRegistrations cr ON cr.id = r.class_registration_id
             INNER JOIN Classes c ON c.id = cr.class_id
             WHERE c.trainer_id = ?`,
            [trainer.id]
        ),
        pool.execute(
            `SELECT r.rating, r.comment, r.created_at, c.title, c.class_date, u.first_name
             FROM ClassRatings r
             INNER JOIN ClassRegistrations cr ON cr.id = r.class_registration_id
             INNER JOIN Classes c ON c.id = cr.class_id
             INNER JOIN Users u ON u.id = cr.user_id
             WHERE c.trainer_id = ?
             ORDER BY r.created_at DESC LIMIT 6`,
            [trainer.id]
        ),
        pool.execute(
            `SELECT COUNT(a.id) AS recorded, COALESCE(SUM(a.attended = TRUE), 0) AS attended,
                    SUM(a.id IS NULL AND TIMESTAMP(c.class_date, c.start_time) <= NOW()) AS unrecorded
             FROM Classes c
             INNER JOIN ClassRegistrations cr ON cr.class_id = c.id AND cr.status = 'Registered'
             LEFT JOIN Attendance a ON a.class_registration_id = cr.id
             WHERE c.trainer_id = ? AND c.class_date >= CURRENT_DATE - INTERVAL 30 DAY AND c.class_date <= CURRENT_DATE`,
            [trainer.id]
        )
    ]);

    const recorded = Number(attendance.recorded || 0);
    return {
        trainer: { name: `${trainer.first_name} ${trainer.last_name}`, specialization: trainer.specialization, experienceYears: trainer.experience_years },
        stats: {
            classesThisMonth: Number(month.classes || 0),
            averageRating: ratings.average === null ? null : Number(ratings.average),
            ratingCount: Number(ratings.count || 0),
            attendanceRate: recorded ? Math.round((Number(attendance.attended) / recorded) * 100) : null,
            bookingsToRecord: Number(attendance.unrecorded || 0)
        },
        schedule: schedule.map(row => ({ ...row, registered_count: Number(row.registered_count), waitlist_count: Number(row.waitlist_count) })),
        recentRatings
    };
}
