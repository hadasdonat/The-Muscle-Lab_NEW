import { activityStyle } from "../../utils/activities";

function ActivityIcon({ name, size = 18, ...props }) {
    const { icon: Icon } = activityStyle(name);
    return <Icon size={size} aria-hidden="true" {...props} />;
}

export default ActivityIcon;
