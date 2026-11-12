// The activity types a class can have. The client keeps the matching colors and icons.
export const ACTIVITIES = [
    { name: "Yoga", group: "Mind & body", intensity: "Low", description: "Flow, balance and breath." },
    { name: "Pilates", group: "Mind & body", intensity: "Medium", description: "Core strength and posture." },
    { name: "Barre", group: "Mind & body", intensity: "Medium", description: "Ballet-inspired toning with small, precise moves." },
    { name: "Stretching", group: "Mind & body", intensity: "Low", description: "Mobility and recovery for tight muscles." },
    { name: "Meditation", group: "Mind & body", intensity: "Low", description: "Guided breathing and focus." },
    { name: "HIIT", group: "Cardio", intensity: "High", description: "Short, intense intervals." },
    { name: "Spinning", group: "Cardio", intensity: "High", description: "Indoor cycling with climbs and sprints." },
    { name: "Zumba", group: "Cardio", intensity: "Medium", description: "Dance cardio to Latin music." },
    { name: "Strength", group: "Strength", intensity: "Medium", description: "Coached barbell and dumbbell work." },
    { name: "CrossFit", group: "Strength", intensity: "High", description: "Functional movements at high intensity." },
    { name: "TRX", group: "Strength", intensity: "Medium", description: "Suspension training with your own body weight." },
    { name: "Bootcamp", group: "Strength", intensity: "High", description: "Outdoor-style circuits in teams." },
    { name: "Boxing", group: "Combat", intensity: "High", description: "Pads, bags and footwork." },
    { name: "Kickboxing", group: "Combat", intensity: "High", description: "Punches and kicks for conditioning." }
];

export const ACTIVITY_NAMES = ACTIVITIES.map(activity => activity.name);
export const INTENSITIES = ["Low", "Medium", "High"];

export function findActivity(name) {
    return ACTIVITIES.find(activity => activity.name === name) || null;
}
