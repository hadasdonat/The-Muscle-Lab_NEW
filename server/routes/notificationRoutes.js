import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { listNotifications, markNotificationsRead } from "../services/notificationService.js";

const router = express.Router();

router.get("/", authMiddleware, async (req, res) => {
    try {
        res.json(await listNotifications(req.user.id));
    } catch (error) {
        console.error("Notifications failed:", error.message);
        res.status(500).json({ message: "Could not load notifications." });
    }
});

router.post("/read", authMiddleware, async (req, res) => {
    try {
        await markNotificationsRead(req.user.id, typeof req.body?.id === "string" ? req.body.id : null);
        res.json(await listNotifications(req.user.id));
    } catch (error) {
        console.error("Mark notifications failed:", error.message);
        res.status(500).json({ message: "Could not update notifications." });
    }
});

export default router;
