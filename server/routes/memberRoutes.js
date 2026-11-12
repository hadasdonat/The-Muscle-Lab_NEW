import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorizeRoles } from "../middlewares/roleMiddleware.js";
import { classesToRate, getProgress, listFavorites, setFavorite } from "../services/memberService.js";

const router = express.Router();
const member = [authMiddleware, authorizeRoles("Member")];

function handle(fn, fallback) {
    return async (req, res) => {
        try {
            res.json(await fn(req));
        } catch (error) {
            if (!error.status) console.error(`${fallback}:`, error.message);
            res.status(error.status || 500).json({ message: error.status ? error.message : `${fallback}.` });
        }
    };
}

router.get("/favorites", ...member, handle(req => listFavorites(req.user.id), "Could not load favourites"));
router.put("/favorites/:activity", ...member, handle(req => setFavorite(req.user.id, req.params.activity, true), "Could not save the favourite"));
router.delete("/favorites/:activity", ...member, handle(req => setFavorite(req.user.id, req.params.activity, false), "Could not remove the favourite"));
router.get("/progress", ...member, handle(req => getProgress(req.user.id), "Could not load your progress"));
router.get("/to-rate", ...member, handle(req => classesToRate(req.user.id), "Could not load classes to rate"));

export default router;
