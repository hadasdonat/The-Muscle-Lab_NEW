import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Calendar, Clock3, Heart, MapPin, Search, User, Users } from "lucide-react";
import { getFavorites, getUpcomingClasses, setFavorite } from "../../services/api";
import ActivityIcon from "../../components/ui/ActivityIcon";
import ClassActions from "../../components/classes/ClassActions";
import useClassBooking from "../../hooks/useClassBooking";
import { activityStyle, ACTIVITY_NAMES, formatDay, formatTime, parseDateKey, toDateKey } from "../../utils/activities";
import "./Classes.css";

function dayLabel(key) {
    const today = toDateKey(new Date());
    const tomorrow = toDateKey(new Date(Date.now() + 86400000));
    if (key === today) return "Today";
    if (key === tomorrow) return "Tomorrow";
    return formatDay(key, { weekday: "long", day: "numeric", month: "short" });
}

function Classes() {
    const [classes, setClasses] = useState([]);
    const [favorites, setFavorites] = useState([]);
    const [status, setStatus] = useState("loading");
    const [query, setQuery] = useState("");
    const [day, setDay] = useState("all");
    const [activity, setActivity] = useState("all");
    const [openOnly, setOpenOnly] = useState(false);

    const load = useCallback(async () => {
        try {
            const [classData, favoriteData] = await Promise.all([getUpcomingClasses(), getFavorites().catch(() => [])]);
            setClasses(classData);
            setFavorites(favoriteData);
            setStatus("ready");
        } catch (error) {
            setStatus(error.message || "Classes could not be loaded.");
        }
    }, []);

    useEffect(() => { load(); }, [load]);
    const booking = useClassBooking(load);

    async function toggleFavorite(name) {
        const next = !favorites.includes(name);
        setFavorites(current => next ? [...current, name] : current.filter(item => item !== name));
        try {
            setFavorites(await setFavorite(name, next));
            toast.success(next ? `${name} added to favourites` : `${name} removed from favourites`);
        } catch (error) {
            toast.error(error.message || "Could not update favourites.");
            load();
        }
    }

    const days = useMemo(() => {
        const result = [];
        for (let i = 0; i < 14; i += 1) {
            const key = toDateKey(new Date(Date.now() + i * 86400000));
            result.push({ key, count: classes.filter(c => c.class_date === key).length });
        }
        return result;
    }, [classes]);

    const activitiesOnSchedule = useMemo(
        () => ACTIVITY_NAMES.filter(name => classes.some(c => c.activity === name)),
        [classes]
    );

    const filtered = useMemo(() => {
        const text = query.trim().toLowerCase();
        return classes.filter(c =>
            (day === "all" || c.class_date === day) &&
            (activity === "all" || (activity === "favorites" ? favorites.includes(c.activity) : c.activity === activity)) &&
            (!openOnly || c.available_spots > 0 || c.is_registered) &&
            (!text || [c.title, c.trainer_name, c.room, c.activity].some(value => String(value || "").toLowerCase().includes(text))));
    }, [classes, day, activity, openOnly, favorites, query]);

    const grouped = useMemo(() => {
        const map = new Map();
        for (const c of filtered) {
            if (!map.has(c.class_date)) map.set(c.class_date, []);
            map.get(c.class_date).push(c);
        }
        return [...map.entries()];
    }, [filtered]);

    const bookedCount = classes.filter(c => c.is_registered).length;

    return (
        <div className="classes-page">
            <header className="classes-header">
                <div>
                    <p className="classes-eyebrow">Book a class</p>
                    <h1>Classes</h1>
                    <p className="classes-subtitle">
                        {classes.length} upcoming classes across {activitiesOnSchedule.length} activities.
                        {bookedCount ? ` You're booked into ${bookedCount}.` : ""} Full classes have a waitlist.
                    </p>
                </div>
                <label className="classes-search">
                    <Search size={16} aria-hidden="true" />
                    <input id="class-search" type="search" placeholder="Search class, trainer or room" value={query} onChange={e => setQuery(e.target.value)} />
                </label>
            </header>

            <div className="day-strip" role="group" aria-label="Filter by day">
                <button type="button" className={`day-chip ${day === "all" ? "active" : ""}`} aria-pressed={day === "all"} onClick={() => setDay("all")}>
                    <span className="day-chip-top">All</span><span className="day-chip-main">2 weeks</span>
                </button>
                {days.map(({ key, count }) => (
                    <button key={key} type="button" className={`day-chip ${day === key ? "active" : ""}`} aria-pressed={day === key} disabled={!count} onClick={() => setDay(key)}>
                        <span className="day-chip-top">{parseDateKey(key).toLocaleDateString("en-GB", { weekday: "short" })}</span>
                        <span className="day-chip-main">{parseDateKey(key).getDate()}</span>
                        <span className="day-chip-count">{count ? `${count} classes` : "none"}</span>
                    </button>
                ))}
            </div>

            <div className="activity-filter" role="group" aria-label="Filter by activity">
                <button type="button" className={`activity-chip ${activity === "all" ? "active" : ""}`} aria-pressed={activity === "all"} onClick={() => setActivity("all")}>All activities</button>
                <button type="button" className={`activity-chip ${activity === "favorites" ? "active" : ""}`} aria-pressed={activity === "favorites"} onClick={() => setActivity("favorites")}>
                    <Heart size={14} fill="currentColor" /> Favourites{favorites.length ? ` (${favorites.length})` : ""}
                </button>
                {activitiesOnSchedule.map(name => (
                    <button key={name} type="button" className={`activity-chip ${activity === name ? "active" : ""}`} aria-pressed={activity === name}
                        style={{ "--chip-color": activityStyle(name).color }} onClick={() => setActivity(name)}>
                        <ActivityIcon name={name} size={14} /> {name}
                    </button>
                ))}
                <label className="open-toggle">
                    <input id="open-only" type="checkbox" checked={openOnly} onChange={e => setOpenOnly(e.target.checked)} />
                    Only with open places
                </label>
            </div>

            {status === "loading" && <div className="classes-skeleton" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <div key={i} className="class-card skeleton" />)}</div>}
            {status !== "loading" && status !== "ready" && (
                <div className="classes-empty" role="alert"><p>{status}</p><button type="button" className="class-button" onClick={load}>Try again</button></div>
            )}
            {status === "ready" && grouped.length === 0 && (
                <div className="classes-empty">
                    <p>{activity === "favorites" && !favorites.length ? "Tap the heart on any class to save that activity as a favourite." : "No classes match these filters."}</p>
                    <button type="button" className="class-button secondary" onClick={() => { setDay("all"); setActivity("all"); setOpenOnly(false); setQuery(""); }}>Clear filters</button>
                </div>
            )}

            {grouped.map(([date, items]) => (
                <section key={date} className="class-day" aria-labelledby={`day-${date}`}>
                    <h2 id={`day-${date}`}>{dayLabel(date)} <span>{items.length} {items.length === 1 ? "class" : "classes"}</span></h2>
                    <div className="classes-grid">
                        {items.map(gymClass => {
                            const style = activityStyle(gymClass.activity);
                            const fill = Math.min(100, Math.round((gymClass.registered_count / gymClass.capacity) * 100));
                            const favorite = favorites.includes(gymClass.activity);
                            return (
                                <article key={gymClass.id} className={`class-card ${gymClass.is_registered ? "is-booked" : ""}`} style={{ "--accent": style.color }}>
                                    <div className="class-card-top">
                                        <div className="class-icon"><ActivityIcon name={gymClass.activity} size={22} /></div>
                                        <div className="class-heading">
                                            <h3>{gymClass.title}</h3>
                                            <span className="class-tags">
                                                {gymClass.activity && <span>{style.group}</span>}
                                                {gymClass.intensity && <span className={`intensity ${gymClass.intensity.toLowerCase()}`}>{gymClass.intensity} intensity</span>}
                                            </span>
                                        </div>
                                        {gymClass.activity && (
                                            <button type="button" className={`favorite-button ${favorite ? "on" : ""}`} aria-pressed={favorite}
                                                aria-label={favorite ? `Remove ${gymClass.activity} from favourites` : `Save ${gymClass.activity} as a favourite`}
                                                onClick={() => toggleFavorite(gymClass.activity)}>
                                                <Heart size={18} fill={favorite ? "currentColor" : "none"} />
                                            </button>
                                        )}
                                    </div>
                                    {gymClass.description && <p className="class-description">{gymClass.description}</p>}
                                    <ul className="class-meta">
                                        <li><Clock3 size={15} />{formatTime(gymClass.start_time)}–{formatTime(gymClass.end_time)}</li>
                                        <li><Calendar size={15} />{formatDay(gymClass.class_date)}</li>
                                        <li><User size={15} />{gymClass.trainer_name}</li>
                                        {gymClass.room && <li><MapPin size={15} />{gymClass.room}</li>}
                                    </ul>
                                    <div className="class-capacity">
                                        <div className="capacity-label">
                                            <span><Users size={14} /> {gymClass.registered_count}/{gymClass.capacity} booked</span>
                                            <span className={gymClass.available_spots <= 0 ? "full" : gymClass.available_spots <= 3 ? "low" : ""}>
                                                {gymClass.available_spots <= 0 ? "Full" : `${gymClass.available_spots} left`}
                                            </span>
                                        </div>
                                        <div className="capacity-track"><div style={{ width: `${fill}%` }} /></div>
                                    </div>
                                    <ClassActions gymClass={gymClass} busy={booking.busyId === gymClass.id} {...booking} />
                                </article>
                            );
                        })}
                    </div>
                </section>
            ))}
        </div>
    );
}

export default Classes;
