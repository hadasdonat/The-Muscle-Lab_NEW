import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorizeRoles } from "../middlewares/roleMiddleware.js";
import { getTrainerOverview } from "../services/trainerWorkspaceService.js";

const router = express.Router();

router.get("/overview", authMiddleware, authorizeRoles("Trainer"), async (req, res) => {
    try {
        res.json(await getTrainerOverview(req.user.id));
    } catch (error) {
        if (!error.status) console.error("Trainer overview failed:", error.message);
        res.status(error.status || 500).json({ message: error.status ? error.message : "Could not load your overview." });
    }
});

export default router;
