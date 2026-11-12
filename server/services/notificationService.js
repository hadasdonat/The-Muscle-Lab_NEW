import pool from "../config/db.js";

// `db` is the pool or a connection inside a transaction.
export async function createNotification(db, userId, { type, title, body = null, link = null }) {
    await db.execute(
        "INSERT INTO Notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)",
        [userId, type, title.slice(0, 120), body ? body.slice(0, 400) : null, link]
    );
}

export async function listNotifications(userId) {
    const [rows] = await pool.execute(
        `SELECT id, type, title, body, link, created_at, read_at
         FROM Notifications WHERE user_id = ?
         ORDER BY created_at DESC, id DESC LIMIT 20`,
        [userId]
    );
    const [[unread]] = await pool.execute(
        "SELECT COUNT(*) AS n FROM Notifications WHERE user_id = ? AND read_at IS NULL",
        [userId]
    );
    return { unread: Number(unread.n), items: rows };
}

export async function markNotificationsRead(userId, id = null) {
    if (id) {
        await pool.execute("UPDATE Notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND read_at IS NULL", [id, userId]);
    } else {
        await pool.execute("UPDATE Notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL", [userId]);
    }
}
