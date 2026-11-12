import express from "express";
import { rateLimit } from "express-rate-limit";
import { getCoachInsightController, coachChatController } from "../controllers/coachController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorizeRoles } from "../middlewares/roleMiddleware.js";

const router = express.Router();

// Each uncached request can call a paid model, so limit it per signed-in user.
const coachLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 6,
    keyGenerator: req => `user:${req.user.id}`,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many suggestion requests. Try again in a minute." }
});

router.get("/insight", authMiddleware, authorizeRoles("Member"), coachLimit, getCoachInsightController);

const chatLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    keyGenerator: req => `chat:${req.user.id}`,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "You're sending messages quickly. Wait a minute and try again." }
});

router.post("/chat", authMiddleware, authorizeRoles("Member"), chatLimit, coachChatController);

export default router;
