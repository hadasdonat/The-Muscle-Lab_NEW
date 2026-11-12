import pool from "../config/db.js";

function count(rows, field = "count") {
    return Number(rows[0]?.[field] || 0);
}

function percent(part, whole) {
    return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export async function getAdminDashboardOverview(req, res) {
    try {
        const [
            [members],
            [newMembers],
            [activeMemberships],
            [upcomingClasses],
            [upcomingRegistrations],
            [attendance],
            [nextClasses],
            [recentRegistrations]
        ] = await Promise.all([
            pool.execute(
                `SELECT COUNT(*) AS count FROM Users u
                 INNER JOIN Roles r ON r.id = u.role_id WHERE r.name = 'Member'`
            ),
            pool.execute(
                `SELECT
                    COALESCE(SUM(u.created_at >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')), 0) AS this_month,
                    COALESCE(SUM(u.created_at >= DATE_FORMAT(CURRENT_DATE - INTERVAL 1 MONTH, '%Y-%m-01')
                        AND u.created_at < DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')), 0) AS last_month
                 FROM Users u
                 INNER JOIN Roles r ON r.id = u.role_id WHERE r.name = 'Member'`
            ),
            pool.execute(
                `SELECT COUNT(DISTINCT user_id) AS count FROM UserMemberships
                 WHERE status = 'Active' AND end_date >= CURRENT_DATE`
            ),
            pool.execute(
                `SELECT COUNT(*) AS count FROM Classes
                 WHERE class_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL 6 DAY`
            ),
            pool.execute(
                `SELECT COUNT(*) AS count FROM ClassRegistrations cr
                 INNER JOIN Classes c ON c.id = cr.class_id
                 WHERE cr.status = 'Registered'
                   AND c.class_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL 6 DAY`
            ),
            // Only classes where staff actually recorded attendance count toward the rate.
            pool.execute(
                `SELECT COUNT(*) AS recorded, COALESCE(SUM(a.attended = TRUE), 0) AS attended
                 FROM Attendance a
                 INNER JOIN ClassRegistrations cr ON cr.id = a.class_registration_id
                 INNER JOIN Classes c ON c.id = cr.class_id
                 WHERE cr.status = 'Registered' AND c.class_date >= CURRENT_DATE - INTERVAL 30 DAY`
            ),
            pool.execute(
                `SELECT c.id, c.title, c.class_date, c.start_time, c.room, c.capacity,
                        CONCAT(u.first_name, ' ', u.last_name) AS trainer_name,
                        COUNT(cr.id) AS registered_count
                 FROM Classes c
                 INNER JOIN Trainers t ON t.id = c.trainer_id
                 INNER JOIN Users u ON u.id = t.user_id
                 LEFT JOIN ClassRegistrations cr ON cr.class_id = c.id AND cr.status = 'Registered'
                 WHERE TIMESTAMP(c.class_date, c.start_time) >= NOW()
                 GROUP BY c.id, c.title, c.class_date, c.start_time, c.room, c.capacity, u.first_name, u.last_name
                 ORDER BY c.class_date, c.start_time
                 LIMIT 5`
            ),
            pool.execute(
                `SELECT cr.id, CONCAT(u.first_name, ' ', u.last_name) AS member_name,
                        c.title AS class_title, c.class_date, cr.registration_date
                 FROM ClassRegistrations cr
                 INNER JOIN Users u ON u.id = cr.user_id
                 INNER JOIN Classes c ON c.id = cr.class_id
                 WHERE cr.status = 'Registered'
                 ORDER BY cr.registration_date DESC
                 LIMIT 6`
            )
        ]);

        const memberCount = count(members);
        const newThisMonth = Number(newMembers[0]?.this_month || 0);
        const newLastMonth = Number(newMembers[0]?.last_month || 0);
        const activeMembershipCount = count(activeMemberships);
        const recorded = Number(attendance[0]?.recorded || 0);

        res.status(200).json({
            memberCount,
            activeMembershipCount,
            upcomingClassCount: count(upcomingClasses),
            upcomingRegistrationCount: count(upcomingRegistrations),
            memberGrowth: {
                thisMonth: newThisMonth,
                lastMonth: newLastMonth,
                // null when there is no previous month to compare with
                changePercent: newLastMonth > 0 ? Math.round(((newThisMonth - newLastMonth) / newLastMonth) * 100) : null
            },
            activeMembershipRate: percent(activeMembershipCount, memberCount),
            attendance: {
                recorded,
                attended: Number(attendance[0]?.attended || 0),
                rate: percent(Number(attendance[0]?.attended || 0), recorded)
            },
            nextClasses: nextClasses.map(row => ({ ...row, registered_count: Number(row.registered_count) })),
            recentRegistrations
        });
    } catch (error) {
        console.error("Admin dashboard failed:", error.message);
        res.status(500).json({ message: "Failed to load dashboard data." });
    }
}
