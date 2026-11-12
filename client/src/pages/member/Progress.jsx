import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award, Clock3, Flame, Dumbbell, CalendarCheck, Lock } from "lucide-react";
import { getProgress } from "../../services/api";
import ActivityIcon from "../../components/ui/ActivityIcon";
import { activityStyle, parseDateKey } from "../../utils/activities";
import "./Progress.css";

function Progress() {
    const [data, setData] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        getProgress().then(setData).catch(err => setError(err.message || "Your progress could not be loaded."));
    }, []);

    if (error) return <div className="progress-page"><p className="progress-error" role="alert">{error}</p></div>;
    if (!data) return <div className="progress-page"><div className="progress-tiles">{[0, 1, 2, 3].map(i => <div key={i} className="progress-tile skeleton" />)}</div></div>;

    const max = Math.max(1, ...data.weekly.map(w => w.count));
    const topActivity = Math.max(1, ...data.byActivity.map(a => a.count));
    const earned = data.badges.filter(b => b.earned).length;

    return (
        <div className="progress-page">
            <header>
                <p className="progress-eyebrow">Your training</p>
                <h1>Progress</h1>
                <p className="progress-sub">Every finished class counts, unless your trainer marked you absent.</p>
            </header>

            <div className="progress-tiles">
                <div className="progress-tile"><Dumbbell /><span>{data.total}</span><small>classes finished</small></div>
                <div className="progress-tile"><Clock3 /><span>{Math.round(data.minutes / 60 * 10) / 10}</span><small>hours trained</small></div>
                <div className="progress-tile hot"><Flame /><span>{data.streak}</span><small>week streak · best {data.bestStreak}</small></div>
                <div className="progress-tile"><CalendarCheck /><span>{data.thisMonth}</span><small>classes this month</small></div>
            </div>

            <div className="progress-grid">
                <section className="progress-card">
                    <h2>Classes per week</h2>
                    <p className="progress-sub">The last 12 weeks. Weeks start on Sunday.</p>
                    <div className="week-chart" role="img" aria-label={`Classes per week: ${data.weekly.map(w => w.count).join(", ")}`}>
                        {data.weekly.map((week, index) => (
                            <div key={week.weekStart} className={`week-bar ${index === data.weekly.length - 1 ? "current" : ""}`}>
                                <span className="week-value">{week.count || ""}</span>
                                <div className="week-fill" style={{ height: `${(week.count / max) * 100}%` }} />
                                <span className="week-label">{parseDateKey(week.weekStart).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="progress-card">
                    <h2>By activity</h2>
                    {data.byActivity.length === 0 ? (
                        <p className="progress-sub">Finish your first class to see your mix here. <Link to="/member/classes">Find a class</Link></p>
                    ) : (
                        <ul className="activity-bars">
                            {data.byActivity.map(({ activity, count }) => (
                                <li key={activity} style={{ "--accent": activityStyle(activity).color }}>
                                    <span className="activity-name"><ActivityIcon name={activity} size={15} /> {activity}</span>
                                    <span className="activity-track"><span style={{ width: `${(count / topActivity) * 100}%` }} /></span>
                                    <span className="activity-count">{count}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>

            <section className="progress-card">
                <h2>Badges <span className="badge-count">{earned} of {data.badges.length}</span></h2>
                <ul className="badges">
                    {data.badges.map(badge => (
                        <li key={badge.id} className={badge.earned ? "earned" : "locked"}>
                            <span className="badge-icon">{badge.earned ? <Award size={22} /> : <Lock size={18} />}</span>
                            <strong>{badge.title}</strong>
                            <small>{badge.description}</small>
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}

export default Progress;
