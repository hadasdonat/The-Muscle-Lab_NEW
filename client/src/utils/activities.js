import { Leaf, HeartPulse, Sparkles, StretchHorizontal, Moon, Flame, Bike, Music, Dumbbell, Zap, Link2, Trees, Swords, Target } from "lucide-react";

// Colors and icons for each activity type. The names match server/config/activities.js.
export const ACTIVITY_STYLES = {
    Yoga: { color: "#34d399", icon: Leaf, group: "Mind & body" },
    Pilates: { color: "#f472b6", icon: HeartPulse, group: "Mind & body" },
    Barre: { color: "#c084fc", icon: Sparkles, group: "Mind & body" },
    Stretching: { color: "#5eead4", icon: StretchHorizontal, group: "Mind & body" },
    Meditation: { color: "#93c5fd", icon: Moon, group: "Mind & body" },
    HIIT: { color: "#fb923c", icon: Flame, group: "Cardio" },
    Spinning: { color: "#38bdf8", icon: Bike, group: "Cardio" },
    Zumba: { color: "#facc15", icon: Music, group: "Cardio" },
    Strength: { color: "#a78bfa", icon: Dumbbell, group: "Strength" },
    CrossFit: { color: "#f87171", icon: Zap, group: "Strength" },
    TRX: { color: "#fbbf24", icon: Link2, group: "Strength" },
    Bootcamp: { color: "#86efac", icon: Trees, group: "Strength" },
    Boxing: { color: "#ef4444", icon: Swords, group: "Combat" },
    Kickboxing: { color: "#fb7185", icon: Target, group: "Combat" }
};

export const ACTIVITY_GROUPS = ["Mind & body", "Cardio", "Strength", "Combat"];
export const ACTIVITY_NAMES = Object.keys(ACTIVITY_STYLES);
const FALLBACK = { color: "#a1a1aa", icon: Dumbbell, group: "Other" };

export function activityStyle(name) {
    return ACTIVITY_STYLES[name] || FALLBACK;
}


// "YYYY-MM-DD" as a local calendar date.
export function parseDateKey(key) {
    const [year, month, day] = String(key).slice(0, 10).split("-").map(Number);
    return new Date(year, month - 1, day);
}

export function toDateKey(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function formatDay(key, options = { weekday: "short", day: "numeric", month: "short" }) {
    return parseDateKey(key).toLocaleDateString("en-GB", options);
}

export function formatTime(time) {
    return String(time || "").slice(0, 5);
}
