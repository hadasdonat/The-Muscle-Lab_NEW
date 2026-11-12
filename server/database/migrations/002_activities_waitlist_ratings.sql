-- Activity types, waitlists, favourites, notifications and class ratings.
ALTER TABLE Classes ADD COLUMN activity VARCHAR(40) NULL, ADD COLUMN intensity ENUM('Low', 'Medium', 'High') NULL;

-- Existing classes whose title is an activity name get that activity.
UPDATE Classes SET activity = title
WHERE title IN ('Yoga', 'Pilates', 'Barre', 'Stretching', 'Meditation', 'HIIT', 'Spinning', 'Zumba',
                'Strength', 'CrossFit', 'TRX', 'Bootcamp', 'Boxing', 'Kickboxing');
UPDATE Classes SET intensity = CASE
    WHEN activity IN ('Yoga', 'Stretching', 'Meditation') THEN 'Low'
    WHEN activity IN ('HIIT', 'Spinning', 'CrossFit', 'Bootcamp', 'Boxing', 'Kickboxing') THEN 'High'
    WHEN activity IS NOT NULL THEN 'Medium'
END;

CREATE TABLE ClassWaitlist (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    class_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    status ENUM('Waiting', 'Promoted', 'Left') NOT NULL DEFAULT 'Waiting',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (class_id, user_id),
    FOREIGN KEY (class_id) REFERENCES Classes(id),
    FOREIGN KEY (user_id) REFERENCES Users(id)
);

CREATE TABLE FavoriteActivities (
    user_id CHAR(36) NOT NULL,
    activity VARCHAR(40) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, activity),
    FOREIGN KEY (user_id) REFERENCES Users(id)
);

CREATE TABLE Notifications (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id CHAR(36) NOT NULL,
    type VARCHAR(40) NOT NULL,
    title VARCHAR(120) NOT NULL,
    body VARCHAR(400),
    link VARCHAR(120),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP NULL,
    INDEX idx_notifications_user (user_id, created_at),
    FOREIGN KEY (user_id) REFERENCES Users(id)
);

CREATE TABLE ClassRatings (
    id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    class_registration_id CHAR(36) NOT NULL UNIQUE,
    rating TINYINT NOT NULL,
    comment VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_registration_id) REFERENCES ClassRegistrations(id)
);
