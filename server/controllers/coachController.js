import { getCoachInsight } from "../services/coachService.js";

export async function getCoachInsightController(req, res) {
    try {
        const insight = await getCoachInsight(req.user.id, { refresh: req.query.refresh === "1" });
        res.status(200).json(insight);
    } catch (error) {
        console.error("Coach insight failed:", error.message);
        res.status(500).json({ message: "Could not load a class suggestion right now." });
    }
}
