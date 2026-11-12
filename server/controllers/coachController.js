import { getCoachInsight } from "../services/coachService.js";
import { chatWithCoach } from "../services/coachChatService.js";

export async function getCoachInsightController(req, res) {
    try {
        const insight = await getCoachInsight(req.user.id, { refresh: req.query.refresh === "1" });
        res.status(200).json(insight);
    } catch (error) {
        console.error("Coach insight failed:", error.message);
        res.status(500).json({ message: "Could not load a class suggestion right now." });
    }
}

export async function coachChatController(req, res) {
    try {
        res.status(200).json(await chatWithCoach(req.user.id, req.body?.messages));
    } catch (error) {
        if (!error.status) console.error("Coach chat failed:", error.message);
        res.status(error.status || 500).json({ message: error.status ? error.message : "The coach couldn't answer right now." });
    }
}
