USE master;
GO

IF DB_ID('ChronoCampus') IS NOT NULL
    DROP DATABASE ChronoCampus;
GO

CREATE DATABASE ChronoCampus
    COLLATE Latin1_General_CI_AI;
GO

USE ChronoCampus;
GO


CREATE TABLE Faculty (
    id            INT           IDENTITY(1,1) PRIMARY KEY,
    name          NVARCHAR(150) NOT NULL,
    code          NVARCHAR(20)  NOT NULL,
    CONSTRAINT uq_faculty_code UNIQUE (code)
);
GO

CREATE TABLE Department (
    id         INT           IDENTITY(1,1) PRIMARY KEY,
    faculty_id INT           NOT NULL,
    name       NVARCHAR(150) NOT NULL,
    CONSTRAINT fk_dept_faculty
        FOREIGN KEY (faculty_id) REFERENCES Faculty(id),
    CONSTRAINT uq_dept_name_faculty
        UNIQUE (faculty_id, name)
);
GO

CREATE TABLE Major (
    id           INT           IDENTITY(1,1) PRIMARY KEY,
    faculty_id   INT           NOT NULL,
    name         NVARCHAR(150) NOT NULL,
    major_code   INT           NOT NULL,
    study_form   NVARCHAR(10)  NOT NULL,
    duration_yrs INT           NOT NULL,
    CONSTRAINT fk_major_faculty
        FOREIGN KEY (faculty_id) REFERENCES Faculty(id),
    CONSTRAINT uq_major_code_form
        UNIQUE (major_code, study_form),
    CONSTRAINT chk_major_form
        CHECK (study_form IN ('present','remote')),
    CONSTRAINT chk_major_duration
        CHECK (duration_yrs IN (4,5)),
    CONSTRAINT chk_major_form_duration
        CHECK (
            (study_form = 'present' AND duration_yrs = 4) OR
            (study_form = 'remote'  AND duration_yrs = 5)
        )
);
GO

CREATE TABLE LessonBlock (
    id             INT          IDENTITY(1,1) PRIMARY KEY,
    label          NVARCHAR(10) NOT NULL,
    start_time     TIME         NOT NULL,
    end_time       TIME         NOT NULL,
    is_remote_only BIT          NOT NULL DEFAULT 0,
    CONSTRAINT uq_lessonblock_label UNIQUE (label),
    CONSTRAINT chk_lessonblock_time CHECK (end_time > start_time)
);
GO

CREATE TABLE WeekParity (
    id    INT          IDENTITY(1,1) PRIMARY KEY,
    label NVARCHAR(15) NOT NULL,
    CONSTRAINT uq_weekparity UNIQUE (label),
    CONSTRAINT chk_weekparity
        CHECK (label IN ('every','numerator','denominator'))
);
GO

CREATE TABLE LessonType (
    id    INT          IDENTITY(1,1) PRIMARY KEY,
    label NVARCHAR(20) NOT NULL,
    CONSTRAINT uq_lessontype UNIQUE (label),
    CONSTRAINT chk_lessontype
        CHECK (label IN ('lecture','practical','lab','language_lab'))
);
GO

CREATE TABLE EquipmentType (
    id          INT           IDENTITY(1,1) PRIMARY KEY,
    name        NVARCHAR(100) NOT NULL,
    description NVARCHAR(500),
    CONSTRAINT uq_equip_name UNIQUE (name)
);
GO

CREATE TABLE Building (
    id              INT           IDENTITY(1,1) PRIMARY KEY,
    building_number INT           NOT NULL,
    name            NVARCHAR(100),
    address         NVARCHAR(200),
    CONSTRAINT uq_building_number UNIQUE (building_number)
);
GO

CREATE TABLE Room (
    id            INT           IDENTITY(1,1) PRIMARY KEY,
    building_id   INT           NOT NULL,
    room_number   NVARCHAR(20)  NOT NULL,
    floor_number  INT           NOT NULL,
    room_on_floor INT           NOT NULL,
    capacity      INT           NOT NULL,
    room_type     NVARCHAR(20)  NOT NULL,
    CONSTRAINT uq_room_number   UNIQUE (room_number),
    CONSTRAINT fk_room_building FOREIGN KEY (building_id) REFERENCES Building(id),
    CONSTRAINT chk_room_capacity CHECK (capacity > 0),
    CONSTRAINT chk_room_type
        CHECK (room_type IN ('lecture_hall','classroom','lab','language_lab'))
);
GO

CREATE TABLE RoomEquipment (
    room_id           INT NOT NULL,
    equipment_type_id INT NOT NULL,
    quantity          INT NOT NULL,
    CONSTRAINT pk_roomequipment
        PRIMARY KEY (room_id, equipment_type_id),
    CONSTRAINT fk_roomequip_room
        FOREIGN KEY (room_id) REFERENCES Room(id),
    CONSTRAINT fk_roomequip_equip
        FOREIGN KEY (equipment_type_id) REFERENCES EquipmentType(id),
    CONSTRAINT chk_roomequip_qty CHECK (quantity > 0)
);
GO

CREATE TABLE CourseGroup (
    id             INT           IDENTITY(1,1) PRIMARY KEY,
    major_id       INT           NOT NULL,
    admission_year INT           NOT NULL,
    group_code     NVARCHAR(20)  NOT NULL,
    capacity       INT           NOT NULL,
    CONSTRAINT fk_cg_major     FOREIGN KEY (major_id) REFERENCES Major(id),
    CONSTRAINT uq_cg_code      UNIQUE (group_code),
    CONSTRAINT chk_cg_capacity CHECK (capacity > 0),
    CONSTRAINT chk_cg_year     CHECK (admission_year >= 2000)
);
GO

CREATE TABLE SmallGroup (
    id              INT           IDENTITY(1,1) PRIMARY KEY,
    course_group_id INT           NOT NULL,
    label           NVARCHAR(50)  NOT NULL,
    capacity        INT           NOT NULL,
    CONSTRAINT fk_sg_cg       FOREIGN KEY (course_group_id) REFERENCES CourseGroup(id),
    CONSTRAINT uq_sg_label    UNIQUE (course_group_id, label),
    CONSTRAINT chk_sg_capacity CHECK (capacity > 0)
);
GO

CREATE TABLE LabGroup (
    id             INT          IDENTITY(1,1) PRIMARY KEY,
    small_group_id INT          NOT NULL,
    label          NVARCHAR(50) NOT NULL,
    capacity       INT          NOT NULL,
    CONSTRAINT fk_lg_sg       FOREIGN KEY (small_group_id) REFERENCES SmallGroup(id),
    CONSTRAINT uq_lg_label    UNIQUE (small_group_id, label),
    CONSTRAINT chk_lg_capacity CHECK (capacity > 0)
);
GO

CREATE TABLE Role (
    id          INT           IDENTITY(1,1) PRIMARY KEY,
    name        NVARCHAR(50)  NOT NULL,
    description NVARCHAR(250) NULL,
    CONSTRAINT uq_role_name UNIQUE (name)
);
GO

CREATE TABLE [User] (
    id            INT           IDENTITY(1,1) PRIMARY KEY,
    email         NVARCHAR(255) NOT NULL,
    password_hash NVARCHAR(255) NOT NULL,
    is_active     BIT           NOT NULL DEFAULT 1,
    created_at    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    last_login    DATETIME2,
    CONSTRAINT uq_user_email UNIQUE (email)
);
GO

CREATE TABLE UserRole (
    user_id INT NOT NULL,
    role_id INT NOT NULL,
    CONSTRAINT pk_userrole PRIMARY KEY (user_id, role_id),
    CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES [User](id),
    CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES Role(id)
);
GO

CREATE TABLE UserProfile (
    id              INT           IDENTITY(1,1) PRIMARY KEY,
    user_id         INT           NULL,
    full_name       NVARCHAR(150) NOT NULL,
    department_id   INT           NULL,
    faculty_id      INT           NULL,
    course_group_id INT           NULL,
    small_group_id  INT           NULL,
    lab_group_id    INT           NULL,

    CONSTRAINT fk_profile_user
        FOREIGN KEY (user_id)         REFERENCES [User](id),
    CONSTRAINT fk_profile_dept
        FOREIGN KEY (department_id)   REFERENCES Department(id),
    CONSTRAINT fk_profile_faculty
        FOREIGN KEY (faculty_id)      REFERENCES Faculty(id),
    CONSTRAINT fk_profile_cg
        FOREIGN KEY (course_group_id) REFERENCES CourseGroup(id),
    CONSTRAINT fk_profile_sg
        FOREIGN KEY (small_group_id)  REFERENCES SmallGroup(id),
    CONSTRAINT fk_profile_lg
        FOREIGN KEY (lab_group_id)    REFERENCES LabGroup(id)
);
GO

CREATE UNIQUE INDEX uq_profile_user_nn
    ON UserProfile (user_id)
    WHERE user_id IS NOT NULL;
GO

CREATE TABLE PasswordResetToken (
    id         INT           IDENTITY(1,1) PRIMARY KEY,
    user_id    INT           NOT NULL,
    token      NVARCHAR(255) NOT NULL,
    expires_at DATETIME2     NOT NULL,
    used       BIT           NOT NULL DEFAULT 0,
    created_at DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT uq_prt_token UNIQUE (token),
    CONSTRAINT fk_prt_user  FOREIGN KEY (user_id) REFERENCES [User](id)
);
GO

CREATE TABLE UserSession (
    id            INT           IDENTITY(1,1) PRIMARY KEY,
    user_id       INT           NOT NULL,
    session_token NVARCHAR(500) NOT NULL,
    ip_address    NVARCHAR(45),
    user_agent    NVARCHAR(500),
    created_at    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    expires_at    DATETIME2     NOT NULL,
    is_revoked    BIT           NOT NULL DEFAULT 0,
    CONSTRAINT uq_session_token UNIQUE (session_token),
    CONSTRAINT fk_session_user  FOREIGN KEY (user_id) REFERENCES [User](id)
);
GO

CREATE TABLE Subject (
    id             INT           IDENTITY(1,1) PRIMARY KEY,
    name           NVARCHAR(150) NOT NULL,
    lesson_type_id INT           NOT NULL,
    CONSTRAINT fk_subject_lessontype FOREIGN KEY (lesson_type_id) REFERENCES LessonType(id),
    CONSTRAINT uq_subject_name_type  UNIQUE (name, lesson_type_id)
);
GO

CREATE TABLE SubjectConstraint (
    id               INT          IDENTITY(1,1) PRIMARY KEY,
    subject_a_id     INT          NOT NULL,
    subject_b_id     INT          NOT NULL,
    constraint_type  NVARCHAR(20) NOT NULL,
    min_value        INT          NULL,
    CONSTRAINT fk_sc_a FOREIGN KEY (subject_a_id) REFERENCES Subject(id),
    CONSTRAINT fk_sc_b FOREIGN KEY (subject_b_id) REFERENCES Subject(id),
    CONSTRAINT chk_sc_type
        CHECK (constraint_type IN ('BEFORE','NOT_SAME_DAY','MIN_BLOCKS_GAP')),
    CONSTRAINT chk_sc_different
        CHECK (subject_a_id <> subject_b_id),
    CONSTRAINT uq_sc_pair
        UNIQUE (subject_a_id, subject_b_id, constraint_type)
);
GO

CREATE TRIGGER trg_sc_acyclic
ON SubjectConstraint
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM inserted WHERE constraint_type = 'BEFORE')
        RETURN;

    DECLARE @bad_count INT;

    ;WITH reach AS (
        SELECT i.subject_a_id AS origin, sc.subject_b_id AS node
        FROM inserted i
        JOIN SubjectConstraint sc
            ON sc.subject_a_id   = i.subject_b_id
           AND sc.constraint_type = 'BEFORE'
        WHERE i.constraint_type = 'BEFORE'

        UNION ALL

        SELECT r.origin, sc.subject_b_id
        FROM reach r
        JOIN SubjectConstraint sc
            ON sc.subject_a_id   = r.node
           AND sc.constraint_type = 'BEFORE'
    )
    SELECT @bad_count = COUNT(*)
    FROM reach
    WHERE node = origin
    OPTION (MAXRECURSION 1000);

    IF @bad_count > 0
    BEGIN
        RAISERROR(
            'FIX-X: BEFORE constraint would create a cycle in the prerequisite graph.',
            16, 1
        );
        ROLLBACK TRANSACTION;
        RETURN;
    END;
END;
GO

CREATE TRIGGER trg_sc_min_value_check
ON SubjectConstraint
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM inserted
        WHERE constraint_type = 'MIN_BLOCKS_GAP'
          AND min_value IS NULL
    )
    BEGIN
        RAISERROR(
            'BUG-D FIX: min_value must be NOT NULL when constraint_type = ''MIN_BLOCKS_GAP''.',
            16, 1
        );
        ROLLBACK TRANSACTION;
        RETURN;
    END;
END;
GO

CREATE TABLE SubjectEquipmentReq (
    subject_id        INT NOT NULL,
    equipment_type_id INT NOT NULL,
    min_quantity      INT NOT NULL,
    CONSTRAINT pk_subjequip
        PRIMARY KEY (subject_id, equipment_type_id),
    CONSTRAINT fk_subjequip_subject
        FOREIGN KEY (subject_id)        REFERENCES Subject(id),
    CONSTRAINT fk_subjequip_equip
        FOREIGN KEY (equipment_type_id) REFERENCES EquipmentType(id),
    CONSTRAINT chk_subjequip_qty
        CHECK (min_quantity > 0)
);
GO

CREATE TABLE ScheduleEntry (
    id              INT       IDENTITY(1,1) PRIMARY KEY,
    week_parity_id  INT       NOT NULL,
    lesson_block_id INT       NOT NULL,
    day_of_week     INT       NOT NULL,
    semester        INT       NOT NULL,
    subject_id      INT       NOT NULL,
    profile_id      INT       NOT NULL,
    room_id         INT       NOT NULL,
    course_group_id INT,
    small_group_id  INT,
    lab_group_id    INT,
    effective_from  DATE      NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    effective_to    DATE      NULL,

    CONSTRAINT fk_se_parity   FOREIGN KEY (week_parity_id)  REFERENCES WeekParity(id),
    CONSTRAINT fk_se_block    FOREIGN KEY (lesson_block_id) REFERENCES LessonBlock(id),
    CONSTRAINT fk_se_subject  FOREIGN KEY (subject_id)      REFERENCES Subject(id),
    CONSTRAINT fk_se_profile  FOREIGN KEY (profile_id)      REFERENCES UserProfile(id),
    CONSTRAINT fk_se_room     FOREIGN KEY (room_id)         REFERENCES Room(id),
    CONSTRAINT fk_se_cg       FOREIGN KEY (course_group_id) REFERENCES CourseGroup(id),
    CONSTRAINT fk_se_sg       FOREIGN KEY (small_group_id)  REFERENCES SmallGroup(id),
    CONSTRAINT fk_se_lg       FOREIGN KEY (lab_group_id)    REFERENCES LabGroup(id),

    CONSTRAINT chk_se_day      CHECK (day_of_week BETWEEN 1 AND 6),
    CONSTRAINT chk_se_semester CHECK (semester BETWEEN 1 AND 10),
    CONSTRAINT chk_se_validity CHECK (effective_to IS NULL OR effective_to >= effective_from),

    CONSTRAINT chk_se_group_xor CHECK (
        (CASE WHEN course_group_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN small_group_id  IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN lab_group_id    IS NOT NULL THEN 1 ELSE 0 END) = 1
    )
);
GO

CREATE UNIQUE INDEX uq_profile_slot
    ON ScheduleEntry (profile_id, semester, day_of_week, lesson_block_id, week_parity_id);
GO

CREATE UNIQUE INDEX uq_room_slot
    ON ScheduleEntry (room_id, semester, day_of_week, lesson_block_id, week_parity_id);
GO

CREATE UNIQUE INDEX uq_cg_slot
    ON ScheduleEntry (course_group_id, semester, day_of_week, lesson_block_id, week_parity_id)
    WHERE course_group_id IS NOT NULL;
GO

CREATE UNIQUE INDEX uq_sg_slot
    ON ScheduleEntry (small_group_id, semester, day_of_week, lesson_block_id, week_parity_id)
    WHERE small_group_id IS NOT NULL;
GO

CREATE UNIQUE INDEX uq_lg_slot
    ON ScheduleEntry (lab_group_id, semester, day_of_week, lesson_block_id, week_parity_id)
    WHERE lab_group_id IS NOT NULL;
GO

CREATE INDEX ix_se_slot
    ON ScheduleEntry (semester, day_of_week, lesson_block_id, week_parity_id)
    INCLUDE (profile_id, room_id, course_group_id, small_group_id, lab_group_id);
GO

CREATE INDEX ix_se_active
    ON ScheduleEntry (semester, day_of_week, lesson_block_id)
    WHERE effective_to IS NULL;
GO

CREATE INDEX ix_se_cg_semester
    ON ScheduleEntry (course_group_id, semester)
    INCLUDE (week_parity_id, lesson_block_id, day_of_week, subject_id, profile_id, room_id)
    WHERE course_group_id IS NOT NULL AND effective_to IS NULL;
GO

CREATE INDEX ix_se_sg_semester
    ON ScheduleEntry (small_group_id, semester)
    INCLUDE (week_parity_id, lesson_block_id, day_of_week, subject_id, profile_id, room_id)
    WHERE small_group_id IS NOT NULL AND effective_to IS NULL;
GO

CREATE INDEX ix_se_lg_semester
    ON ScheduleEntry (lab_group_id, semester)
    INCLUDE (week_parity_id, lesson_block_id, day_of_week, subject_id, profile_id, room_id)
    WHERE lab_group_id IS NOT NULL AND effective_to IS NULL;
GO

CREATE INDEX ix_se_profile_semester
    ON ScheduleEntry (profile_id, semester)
    INCLUDE (week_parity_id, lesson_block_id, day_of_week, subject_id, room_id)
    WHERE effective_to IS NULL;
GO

CREATE INDEX ix_se_room_semester
    ON ScheduleEntry (room_id, semester)
    INCLUDE (week_parity_id, lesson_block_id, day_of_week, subject_id, profile_id)
    WHERE effective_to IS NULL;
GO

-- FIX-Q
CREATE INDEX ix_sc_b
    ON SubjectConstraint (subject_b_id, constraint_type)
    INCLUDE (subject_a_id, min_value);
GO

CREATE INDEX ix_sc_a
    ON SubjectConstraint (subject_a_id, constraint_type)
    INCLUDE (subject_b_id, min_value);
GO

CREATE INDEX ix_ur_role
    ON UserRole (role_id, user_id);
GO

CREATE INDEX ix_session_user_active
    ON UserSession (user_id, expires_at)
    WHERE is_revoked = 0;
GO

CREATE INDEX ix_prt_expiry
    ON PasswordResetToken (expires_at, used)
    WHERE used = 0;
GO

CREATE TRIGGER trg_se_room_type_check
ON ScheduleEntry
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN Subject    s  ON s.id  = i.subject_id
        JOIN LessonType lt ON lt.id = s.lesson_type_id
        JOIN Room       r  ON r.id  = i.room_id
        WHERE
            (lt.label = 'lecture'      AND r.room_type != 'lecture_hall') OR
            (lt.label = 'practical'    AND r.room_type != 'classroom')    OR
            (lt.label = 'lab'          AND r.room_type != 'lab')          OR
            (lt.label = 'language_lab' AND r.room_type != 'language_lab')
    )
    BEGIN
        RAISERROR('Room type does not match the lesson type of the subject.', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END;
END;
GO

CREATE TRIGGER trg_se_group_type_check
ON ScheduleEntry
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN Subject    s  ON s.id  = i.subject_id
        JOIN LessonType lt ON lt.id = s.lesson_type_id
        WHERE
            (lt.label = 'lecture'      AND i.course_group_id IS NULL) OR
            (lt.label = 'practical'    AND i.small_group_id  IS NULL) OR
            (lt.label = 'lab'          AND i.lab_group_id    IS NULL) OR
            (lt.label = 'language_lab' AND i.lab_group_id    IS NULL)
    )
    BEGIN
        RAISERROR('Group column does not match the lesson type of the subject.', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END;
END;
GO

CREATE TRIGGER trg_se_remote_block_check
ON ScheduleEntry
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN LessonBlock lb ON lb.id = i.lesson_block_id
        JOIN CourseGroup cg ON cg.id = i.course_group_id
        JOIN Major       m  ON m.id  = cg.major_id
        WHERE i.course_group_id IS NOT NULL
          AND lb.is_remote_only = 1
          AND m.study_form      = 'present'
    )
    BEGIN
        RAISERROR('Block 9-10 is restricted to remote-study groups (lecture path).', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN LessonBlock lb ON lb.id  = i.lesson_block_id
        JOIN SmallGroup  sg ON sg.id  = i.small_group_id
        JOIN CourseGroup cg ON cg.id  = sg.course_group_id
        JOIN Major       m  ON m.id   = cg.major_id
        WHERE i.small_group_id IS NOT NULL
          AND lb.is_remote_only = 1
          AND m.study_form      = 'present'
    )
    BEGIN
        RAISERROR('Block 9-10 is restricted to remote-study groups (practical path).', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN LessonBlock lb ON lb.id  = i.lesson_block_id
        JOIN LabGroup    lg ON lg.id  = i.lab_group_id
        JOIN SmallGroup  sg ON sg.id  = lg.small_group_id
        JOIN CourseGroup cg ON cg.id  = sg.course_group_id
        JOIN Major       m  ON m.id   = cg.major_id
        WHERE i.lab_group_id IS NOT NULL
          AND lb.is_remote_only = 1
          AND m.study_form      = 'present'
    )
    BEGIN
        RAISERROR('Block 9-10 is restricted to remote-study groups (lab path).', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END;
END;
GO

CREATE TRIGGER trg_se_parity_conflict_check
ON ScheduleEntry
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @every_id INT = (SELECT id FROM WeekParity WHERE label = 'every');

    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN ScheduleEntry se
            ON  se.id              <> i.id
            AND se.semester        =  i.semester
            AND se.day_of_week     =  i.day_of_week
            AND se.lesson_block_id =  i.lesson_block_id
            AND se.effective_to    IS NULL
            AND (
                i.week_parity_id  = se.week_parity_id
                OR i.week_parity_id  = @every_id
                OR se.week_parity_id = @every_id
            )
            AND (
                i.profile_id      = se.profile_id
                OR i.room_id      = se.room_id
                OR (i.course_group_id = se.course_group_id AND i.course_group_id IS NOT NULL)
                OR (i.small_group_id  = se.small_group_id  AND i.small_group_id  IS NOT NULL)
                OR (i.lab_group_id    = se.lab_group_id    AND i.lab_group_id    IS NOT NULL)
            )
        WHERE i.effective_to IS NULL
    )
    BEGIN
        DECLARE @msg_r NVARCHAR(500) =
            'FIX-R: Cross-parity schedule conflict detected. '
            + 'An overlapping entry already exists for the same slot with a conflicting week parity.';
        RAISERROR(@msg_r, 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END;
END;
GO

CREATE TRIGGER trg_student_group_membership
ON UserProfile
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1 FROM inserted
        WHERE lab_group_id IS NOT NULL
          AND small_group_id IS NULL
    )
    BEGIN
        RAISERROR(
            'FIX-S: lab_group_id requires small_group_id to also be set on the profile.',
            16, 1
        );
        ROLLBACK TRANSACTION;
        RETURN;
    END;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN SmallGroup sg ON sg.id = i.small_group_id
        WHERE i.small_group_id  IS NOT NULL
          AND i.course_group_id IS NOT NULL
          AND sg.course_group_id <> i.course_group_id
    )
    BEGIN
        RAISERROR('small_group_id does not belong to the profile''s course_group_id.', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN LabGroup lg ON lg.id = i.lab_group_id
        WHERE i.lab_group_id IS NOT NULL
          AND lg.small_group_id <> i.small_group_id
    )
    BEGIN
        RAISERROR('lab_group_id does not belong to the profile''s small_group_id.', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END;
END;
GO

CREATE TRIGGER trg_se_cohort_overlap_check
ON ScheduleEntry
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @every_id INT = (SELECT id FROM WeekParity WHERE label = 'every');

    IF EXISTS (
        SELECT 1
        FROM inserted i
        CROSS APPLY (
            SELECT sg.id AS sg_id
            FROM SmallGroup sg
            WHERE (i.small_group_id IS NOT NULL AND sg.id = i.small_group_id)
               OR (i.course_group_id IS NOT NULL AND sg.course_group_id = i.course_group_id)
               OR (i.lab_group_id IS NOT NULL
                   AND sg.id = (SELECT lg.small_group_id
                                FROM LabGroup lg
                                WHERE lg.id = i.lab_group_id))
        ) i_sgs
        JOIN ScheduleEntry se
            ON  se.id              <> i.id
            AND se.semester        =  i.semester
            AND se.day_of_week     =  i.day_of_week
            AND se.lesson_block_id =  i.lesson_block_id
            AND se.effective_to    IS NULL
            AND (
                i.week_parity_id  = se.week_parity_id
                OR i.week_parity_id  = @every_id
                OR se.week_parity_id = @every_id
            )
        CROSS APPLY (
            SELECT sg.id AS sg_id
            FROM SmallGroup sg
            WHERE (se.small_group_id IS NOT NULL AND sg.id = se.small_group_id)
               OR (se.course_group_id IS NOT NULL AND sg.course_group_id = se.course_group_id)
               OR (se.lab_group_id IS NOT NULL
                   AND sg.id = (SELECT lg.small_group_id
                                FROM LabGroup lg
                                WHERE lg.id = se.lab_group_id))
        ) se_sgs
        WHERE i.effective_to IS NULL
          AND i_sgs.sg_id = se_sgs.sg_id
          AND NOT (
              i.lab_group_id  IS NOT NULL
              AND se.lab_group_id IS NOT NULL
              AND i.lab_group_id <> se.lab_group_id
          )
    )
    BEGIN
        DECLARE @msg_w NVARCHAR(500) =
            'FIX-W: Cross-hierarchy cohort conflict -- a parent or child cohort '
            + 'of this group is already scheduled at this slot.';
        RAISERROR(@msg_w, 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END;
END;
GO

CREATE TRIGGER trg_se_capacity_check
ON ScheduleEntry
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN Room r ON r.id = i.room_id
        OUTER APPLY (
            SELECT COALESCE(
                (SELECT capacity FROM CourseGroup WHERE id = i.course_group_id),
                (SELECT capacity FROM SmallGroup  WHERE id = i.small_group_id),
                (SELECT capacity FROM LabGroup    WHERE id = i.lab_group_id)
            ) AS cohort_capacity
        ) c
        WHERE c.cohort_capacity IS NOT NULL
          AND c.cohort_capacity > r.capacity
    )
    BEGIN
        RAISERROR(
            'FIX-Z: Room capacity is smaller than the cohort being scheduled.',
            16, 1
        );
        ROLLBACK TRANSACTION;
        RETURN;
    END;
END;
GO

CREATE TRIGGER trg_se_equipment_check
ON ScheduleEntry
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN SubjectEquipmentReq req ON req.subject_id = i.subject_id
        LEFT JOIN RoomEquipment re
            ON  re.room_id           = i.room_id
            AND re.equipment_type_id = req.equipment_type_id
        WHERE ISNULL(re.quantity, 0) < req.min_quantity
    )
    BEGIN
        RAISERROR(
            'FIX-AA: Assigned room does not satisfy subject equipment requirements.',
            16, 1
        );
        ROLLBACK TRANSACTION;
        RETURN;
    END;
END;
GO

CREATE TRIGGER trg_profile_faculty_consistency
ON UserProfile
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted i
        JOIN Department d ON d.id = i.department_id
        WHERE i.department_id IS NOT NULL
          AND i.faculty_id    IS NOT NULL
          AND d.faculty_id   <> i.faculty_id
    )
    BEGIN
        RAISERROR(
            'FIX-AB: UserProfile.faculty_id must match department.faculty_id.',
            16, 1
        );
        ROLLBACK TRANSACTION;
        RETURN;
    END;
END;
GO

CREATE TABLE LecturerAvailability (
    id              INT  IDENTITY(1,1) PRIMARY KEY,
    profile_id      INT  NOT NULL,
    day_of_week     INT  NOT NULL,
    lesson_block_id INT  NOT NULL,
    is_available    BIT  NOT NULL DEFAULT 1,
    CONSTRAINT fk_la_profile FOREIGN KEY (profile_id)      REFERENCES UserProfile(id),
    CONSTRAINT fk_la_block   FOREIGN KEY (lesson_block_id) REFERENCES LessonBlock(id),
    CONSTRAINT chk_la_day    CHECK (day_of_week BETWEEN 1 AND 6),
    CONSTRAINT uq_la_slot    UNIQUE (profile_id, day_of_week, lesson_block_id)
);
GO

CREATE TABLE RoomAvailability (
    id              INT  IDENTITY(1,1) PRIMARY KEY,
    room_id         INT  NOT NULL,
    day_of_week     INT  NOT NULL,
    lesson_block_id INT  NOT NULL,
    is_available    BIT  NOT NULL DEFAULT 1,
    CONSTRAINT fk_ra_room  FOREIGN KEY (room_id)         REFERENCES Room(id),
    CONSTRAINT fk_ra_block FOREIGN KEY (lesson_block_id) REFERENCES LessonBlock(id),
    CONSTRAINT chk_ra_day  CHECK (day_of_week BETWEEN 1 AND 6),
    CONSTRAINT uq_ra_slot  UNIQUE (room_id, day_of_week, lesson_block_id)
);
GO

CREATE TABLE LecturerPreference (
    id                 INT  IDENTITY(1,1) PRIMARY KEY,
    profile_id         INT  NOT NULL,
    preferred_day      INT,
    preferred_block_id INT,
    preference_weight  INT  NOT NULL DEFAULT 1,
    CONSTRAINT fk_lp_profile FOREIGN KEY (profile_id)        REFERENCES UserProfile(id),
    CONSTRAINT fk_lp_block   FOREIGN KEY (preferred_block_id) REFERENCES LessonBlock(id),
    CONSTRAINT chk_lp_day    CHECK (preferred_day IS NULL OR preferred_day BETWEEN 1 AND 6),
    CONSTRAINT chk_lp_weight CHECK (preference_weight > 0)
);
GO

CREATE TABLE SchedulingTask (
    id                  INT           IDENTITY(1,1) PRIMARY KEY,
    subject_id          INT           NOT NULL,
    profile_id          INT           NOT NULL,
    week_parity_id      INT           NOT NULL,
    semester            INT           NOT NULL,
    course_group_id     INT,
    small_group_id      INT,
    lab_group_id        INT,
    lessons_per_week    INT           NOT NULL DEFAULT 1,
    preferred_room_type NVARCHAR(20)  NOT NULL,
    duration_blocks     INT           NOT NULL DEFAULT 1,
    priority_score      INT           NOT NULL DEFAULT 1,
    is_scheduled        BIT           NOT NULL DEFAULT 0,
    schedule_entry_id   INT           NULL,
    failed_reason       NVARCHAR(200) NULL,
    created_at          DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT fk_st_subject  FOREIGN KEY (subject_id)        REFERENCES Subject(id),
    CONSTRAINT fk_st_profile  FOREIGN KEY (profile_id)        REFERENCES UserProfile(id),
    CONSTRAINT fk_st_parity   FOREIGN KEY (week_parity_id)    REFERENCES WeekParity(id),
    CONSTRAINT fk_st_cg       FOREIGN KEY (course_group_id)   REFERENCES CourseGroup(id),
    CONSTRAINT fk_st_sg       FOREIGN KEY (small_group_id)    REFERENCES SmallGroup(id),
    CONSTRAINT fk_st_lg       FOREIGN KEY (lab_group_id)      REFERENCES LabGroup(id),
    CONSTRAINT fk_st_entry    FOREIGN KEY (schedule_entry_id) REFERENCES ScheduleEntry(id),
    CONSTRAINT chk_st_semester CHECK (semester BETWEEN 1 AND 10),
    CONSTRAINT chk_st_group_xor CHECK (
        (CASE WHEN course_group_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN small_group_id  IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN lab_group_id    IS NOT NULL THEN 1 ELSE 0 END) = 1
    )
);
GO

CREATE INDEX ix_st_unscheduled
    ON SchedulingTask (is_scheduled, priority_score DESC)
    INCLUDE (subject_id, profile_id, week_parity_id, semester,
             course_group_id, small_group_id, lab_group_id,
             preferred_room_type, failed_reason);
GO

CREATE UNIQUE INDEX uq_task_identity
    ON SchedulingTask (subject_id, profile_id, week_parity_id, semester,
                       course_group_id, small_group_id, lab_group_id)
    WHERE is_scheduled = 0;
GO

CREATE TABLE SchedulingAttempt (
    id                 INT       IDENTITY(1,1) PRIMARY KEY,
    task_id            INT       NOT NULL,
    attempted_day      INT       NOT NULL,
    attempted_block_id INT       NOT NULL,
    attempted_room_id  INT       NOT NULL,
    was_successful     BIT       NOT NULL,
    conflict_type      NVARCHAR(30),
    created_at         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_sa_task  FOREIGN KEY (task_id)            REFERENCES SchedulingTask(id),
    CONSTRAINT fk_sa_block FOREIGN KEY (attempted_block_id) REFERENCES LessonBlock(id),
    CONSTRAINT fk_sa_room  FOREIGN KEY (attempted_room_id)  REFERENCES Room(id)
);
GO

CREATE INDEX ix_sa_task ON SchedulingAttempt (task_id, created_at DESC);
GO

GO
CREATE VIEW vw_schedule_conflicts AS
SELECT
    se1.id              AS entry_1,
    se2.id              AS entry_2,
    se1.semester,
    se1.day_of_week,
    se1.lesson_block_id,
    wp1.label           AS parity_1,
    wp2.label           AS parity_2,
    CASE
        WHEN se1.profile_id      = se2.profile_id                                          THEN 'LECTURER_CONFLICT'
        WHEN se1.room_id         = se2.room_id                                             THEN 'ROOM_CONFLICT'
        WHEN se1.course_group_id = se2.course_group_id AND se1.course_group_id IS NOT NULL THEN 'COURSE_GROUP_CONFLICT'
        WHEN se1.small_group_id  = se2.small_group_id  AND se1.small_group_id  IS NOT NULL THEN 'SMALL_GROUP_CONFLICT'
        WHEN se1.lab_group_id    = se2.lab_group_id    AND se1.lab_group_id    IS NOT NULL THEN 'LAB_GROUP_CONFLICT'
    END AS conflict_type
FROM ScheduleEntry se1
CROSS APPLY (SELECT id AS every_id FROM WeekParity WHERE label = 'every') p
JOIN ScheduleEntry se2
    ON  se1.id              <  se2.id
    AND se1.semester        =  se2.semester
    AND se1.day_of_week     =  se2.day_of_week
    AND se1.lesson_block_id =  se2.lesson_block_id
    AND se1.effective_to    IS NULL
    AND se2.effective_to    IS NULL
    AND (
        se1.week_parity_id = se2.week_parity_id
        OR se1.week_parity_id = p.every_id
        OR se2.week_parity_id = p.every_id
    )
    AND (
        se1.profile_id      = se2.profile_id
        OR se1.room_id      = se2.room_id
        OR (se1.course_group_id = se2.course_group_id AND se1.course_group_id IS NOT NULL)
        OR (se1.small_group_id  = se2.small_group_id  AND se1.small_group_id  IS NOT NULL)
        OR (se1.lab_group_id    = se2.lab_group_id    AND se1.lab_group_id    IS NOT NULL)
    )
JOIN WeekParity wp1 ON wp1.id = se1.week_parity_id
JOIN WeekParity wp2 ON wp2.id = se2.week_parity_id;
GO

CREATE FUNCTION fn_available_rooms
(
    @semester       INT,
    @week_parity_id INT
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        r.id          AS room_id,
        r.room_number,
        r.room_type,
        r.capacity,
        lb.id         AS lesson_block_id,
        lb.label      AS block_label,
        lb.start_time,
        lb.end_time,
        d.day_of_week
    FROM Room r
    CROSS JOIN LessonBlock lb
    CROSS JOIN (
        SELECT 1 AS day_of_week UNION SELECT 2 UNION SELECT 3
        UNION SELECT 4           UNION SELECT 5 UNION SELECT 6
    ) d
    LEFT JOIN (
        SELECT se.room_id, se.day_of_week, se.lesson_block_id
        FROM ScheduleEntry se
        CROSS APPLY (SELECT id AS every_id FROM WeekParity WHERE label = 'every') p
        WHERE se.semester        = @semester
          AND se.effective_to    IS NULL
          AND (
              se.week_parity_id = @week_parity_id
              OR se.week_parity_id = p.every_id
              OR @week_parity_id   = p.every_id
          )
    ) booked
        ON booked.room_id         = r.id
        AND booked.day_of_week     = d.day_of_week
        AND booked.lesson_block_id = lb.id
    LEFT JOIN RoomAvailability ra
        ON ra.room_id         = r.id
        AND ra.day_of_week     = d.day_of_week
        AND ra.lesson_block_id = lb.id
        AND ra.is_available    = 0
    WHERE booked.room_id IS NULL
      AND ra.room_id     IS NULL
);
GO

CREATE VIEW vw_full_schedule AS
SELECT
    se.id,
    CASE se.day_of_week
        WHEN 1 THEN 'Monday'    WHEN 2 THEN 'Tuesday'
        WHEN 3 THEN 'Wednesday' WHEN 4 THEN 'Thursday'
        WHEN 5 THEN 'Friday'    WHEN 6 THEN 'Saturday'
    END                 AS day_name,
    lb.label            AS block_label,
    lb.start_time,
    lb.end_time,
    wp.label            AS week_parity,
    lt.label            AS lesson_type,
    s.name              AS subject_name,
    up.full_name        AS lecturer,
    r.room_number,
    r.room_type,
    cg.group_code       AS course_group,
    sg.label            AS small_group,
    lgr.label           AS lab_group,
    se.semester,
    se.effective_from,
    se.effective_to
FROM ScheduleEntry se
JOIN WeekParity   wp  ON wp.id  = se.week_parity_id
JOIN LessonBlock  lb  ON lb.id  = se.lesson_block_id
JOIN Subject      s   ON s.id   = se.subject_id
JOIN LessonType   lt  ON lt.id  = s.lesson_type_id
JOIN UserProfile  up  ON up.id  = se.profile_id
JOIN Room         r   ON r.id   = se.room_id
LEFT JOIN CourseGroup cg  ON cg.id  = se.course_group_id
LEFT JOIN SmallGroup  sg  ON sg.id  = se.small_group_id
LEFT JOIN LabGroup    lgr ON lgr.id = se.lab_group_id
WHERE se.effective_to IS NULL;
GO

CREATE VIEW vw_lecturer_workload AS
SELECT
    up.full_name,
    d.name          AS department,
    se.semester,
    wp.label        AS week_parity,
    lt.label        AS lesson_type,
    COUNT(*)        AS total_lessons
FROM ScheduleEntry se
JOIN UserProfile  up ON up.id  = se.profile_id
JOIN WeekParity   wp ON wp.id  = se.week_parity_id
JOIN Subject      s  ON s.id   = se.subject_id
JOIN LessonType   lt ON lt.id  = s.lesson_type_id
LEFT JOIN Department d ON d.id = up.department_id
WHERE se.effective_to IS NULL
GROUP BY up.full_name, d.name, se.semester, wp.label, lt.label;
GO

GO
CREATE PROCEDURE sp_check_schedule_conflict
    @profile_id      INT,
    @room_id         INT,
    @semester        INT,
    @course_group_id INT = NULL,
    @small_group_id  INT = NULL,
    @lab_group_id    INT = NULL,
    @day_of_week     INT,
    @lesson_block_id INT,
    @week_parity_id  INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @every_id INT = (SELECT id FROM WeekParity WHERE label = 'every');

    SELECT TOP 1
        se.id AS conflicting_schedule_id,
        CASE
            WHEN se.profile_id      = @profile_id                                         THEN 'LECTURER_CONFLICT'
            WHEN se.room_id         = @room_id                                            THEN 'ROOM_CONFLICT'
            WHEN se.course_group_id = @course_group_id AND @course_group_id IS NOT NULL   THEN 'COURSE_GROUP_CONFLICT'
            WHEN se.small_group_id  = @small_group_id  AND @small_group_id  IS NOT NULL   THEN 'SMALL_GROUP_CONFLICT'
            WHEN se.lab_group_id    = @lab_group_id    AND @lab_group_id    IS NOT NULL   THEN 'LAB_GROUP_CONFLICT'
        END AS conflict_type
    FROM ScheduleEntry se
    WHERE
        se.semester        = @semester
        AND se.day_of_week     = @day_of_week
        AND se.lesson_block_id = @lesson_block_id
        AND se.effective_to    IS NULL
        AND (
            se.week_parity_id = @week_parity_id
            OR se.week_parity_id = @every_id
            OR @week_parity_id   = @every_id
        )
        AND (
            se.profile_id      = @profile_id
            OR se.room_id      = @room_id
            OR (se.course_group_id = @course_group_id AND @course_group_id IS NOT NULL)
            OR (se.small_group_id  = @small_group_id  AND @small_group_id  IS NOT NULL)
            OR (se.lab_group_id    = @lab_group_id    AND @lab_group_id    IS NOT NULL)
        );
END;
GO

CREATE PROCEDURE sp_check_subject_constraints
    @subject_id      INT,
    @course_group_id INT = NULL,
    @small_group_id  INT = NULL,
    @lab_group_id    INT = NULL,
    @semester        INT,
    @proposed_day    INT,
    @proposed_block  INT,
    @violation       BIT OUTPUT,
    @violation_desc  NVARCHAR(200) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @violation       = 0;
    SET @violation_desc  = NULL;

    IF EXISTS (
        SELECT 1
        FROM SubjectConstraint sc
        JOIN ScheduleEntry se
            ON se.subject_id  = sc.subject_a_id
            AND se.semester    = @semester
            AND se.effective_to IS NULL
            AND (
                (se.course_group_id = @course_group_id AND @course_group_id IS NOT NULL) OR
                (se.small_group_id  = @small_group_id  AND @small_group_id  IS NOT NULL) OR
                (se.lab_group_id    = @lab_group_id    AND @lab_group_id    IS NOT NULL)
            )
        WHERE sc.subject_b_id   = @subject_id
          AND sc.constraint_type = 'BEFORE'
          AND se.day_of_week    >= @proposed_day
    )
    BEGIN
        SET @violation = 1;
        SET @violation_desc = 'BEFORE constraint: prerequisite subject not yet scheduled before this subject.';
        RETURN;
    END;

    IF EXISTS (
        SELECT 1
        FROM SubjectConstraint sc
        JOIN ScheduleEntry se
            ON se.subject_id = CASE WHEN sc.subject_a_id = @subject_id THEN sc.subject_b_id
                                    ELSE sc.subject_a_id END
            AND se.semester   = @semester
            AND se.day_of_week = @proposed_day
            AND se.effective_to IS NULL
            AND (
                (se.course_group_id = @course_group_id AND @course_group_id IS NOT NULL) OR
                (se.small_group_id  = @small_group_id  AND @small_group_id  IS NOT NULL) OR
                (se.lab_group_id    = @lab_group_id    AND @lab_group_id    IS NOT NULL)
            )
        WHERE (sc.subject_a_id = @subject_id OR sc.subject_b_id = @subject_id)
          AND sc.constraint_type = 'NOT_SAME_DAY'
    )
    BEGIN
        SET @violation = 1;
        SET @violation_desc = 'NOT_SAME_DAY constraint violated.';
        RETURN;
    END;

    IF EXISTS (
        SELECT 1
        FROM SubjectConstraint sc
        JOIN ScheduleEntry se
            ON se.subject_id = CASE WHEN sc.subject_a_id = @subject_id THEN sc.subject_b_id
                                    ELSE sc.subject_a_id END
            AND se.semester   = @semester
            AND se.effective_to IS NULL
            AND (
                (se.course_group_id = @course_group_id AND @course_group_id IS NOT NULL) OR
                (se.small_group_id  = @small_group_id  AND @small_group_id  IS NOT NULL) OR
                (se.lab_group_id    = @lab_group_id    AND @lab_group_id    IS NOT NULL)
            )
        CROSS APPLY (
            SELECT
                (SELECT COUNT(*) FROM LessonBlock lb2 WHERE lb2.start_time <= lb_exist.start_time) AS pos_exist,
                (SELECT COUNT(*) FROM LessonBlock lb2 WHERE lb2.start_time <= lb_prop.start_time)  AS pos_prop
            FROM LessonBlock lb_exist
            CROSS JOIN LessonBlock lb_prop
            WHERE lb_exist.id = se.lesson_block_id
              AND lb_prop.id  = @proposed_block
        ) ord
        WHERE (sc.subject_a_id = @subject_id OR sc.subject_b_id = @subject_id)
          AND sc.constraint_type = 'MIN_BLOCKS_GAP'
          AND se.day_of_week = @proposed_day
          AND ABS(ord.pos_exist - ord.pos_prop) < sc.min_value
    )
    BEGIN
        SET @violation = 1;
        SET @violation_desc = 'MIN_BLOCKS_GAP constraint violated.';
        RETURN;
    END;
END;
GO

CREATE PROCEDURE sp_schedule_task
    @task_id INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE
        @subject_id          INT,
        @profile_id          INT,
        @week_parity_id      INT,
        @semester            INT,
        @course_group_id     INT,
        @small_group_id      INT,
        @lab_group_id        INT,
        @preferred_room_type NVARCHAR(20),
        @every_id            INT;

    SELECT @every_id = id FROM WeekParity WHERE label = 'every';

    SELECT
        @subject_id          = subject_id,
        @profile_id          = profile_id,
        @week_parity_id      = week_parity_id,
        @semester            = semester,
        @course_group_id     = course_group_id,
        @small_group_id      = small_group_id,
        @lab_group_id        = lab_group_id,
        @preferred_room_type = preferred_room_type
    FROM SchedulingTask
    WHERE id = @task_id;

    IF @subject_id IS NULL
    BEGIN
        RAISERROR('SchedulingTask %d not found.', 16, 1, @task_id);
        RETURN;
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM UserProfile up
        WHERE up.id = @profile_id
          AND (
              (
                  up.user_id IS NOT NULL
                  AND EXISTS (
                      SELECT 1
                      FROM UserRole ur
                      JOIN Role ro ON ro.id = ur.role_id
                      WHERE ur.user_id = up.user_id
                        AND ro.name    = 'lecturer'
                  )
              )
              OR (up.user_id IS NULL AND up.department_id IS NOT NULL)
          )
    )
    BEGIN
        UPDATE SchedulingTask
        SET failed_reason = 'STRUCTURAL: Profile does not hold the ''lecturer'' role.'
        WHERE id = @task_id;

        RAISERROR(
            'sp_schedule_task: profile_id %d does not hold the ''lecturer'' role. Task %d aborted.',
            16, 1, @profile_id, @task_id
        );
        RETURN;
    END;

    CREATE TABLE #pref (
        day_of_week     INT NOT NULL,
        lesson_block_id INT NOT NULL,
        total_weight    INT NOT NULL DEFAULT 0,
        PRIMARY KEY (day_of_week, lesson_block_id)
    );

    INSERT INTO #pref (day_of_week, lesson_block_id, total_weight)
    SELECT
        d.day_of_week,
        lb.id,
        ISNULL(SUM(lp.preference_weight), 0)
    FROM (
        SELECT 1 AS day_of_week UNION SELECT 2 UNION SELECT 3
        UNION SELECT 4           UNION SELECT 5 UNION SELECT 6
    ) d
    CROSS JOIN LessonBlock lb
    LEFT JOIN LecturerPreference lp
        ON  lp.profile_id          = @profile_id
        AND (lp.preferred_day      = d.day_of_week OR lp.preferred_day      IS NULL)
        AND (lp.preferred_block_id = lb.id          OR lp.preferred_block_id IS NULL)
    GROUP BY d.day_of_week, lb.id;

    DECLARE @any_candidate_exists BIT = 0;

    DECLARE
        @day          INT,
        @block        INT,
        @room_id      INT,
        @conflict_id  INT,
        @new_entry_id INT,
        @sc_violation BIT,
        @sc_desc      NVARCHAR(200);

    DECLARE
        @bk_subject       INT,
        @bk_profile       INT,
        @bk_parity        INT,
        @bk_semester      INT,
        @bk_cg            INT,
        @bk_sg            INT,
        @bk_lg            INT,
        @bk_room_type     NVARCHAR(20),
        @swap_day         INT,
        @swap_block       INT,
        @swap_room        INT,
        @swap_sc_violate  BIT,
        @swap_sc_desc     NVARCHAR(200),
        @our_sc_violate   BIT,
        @our_sc_desc      NVARCHAR(200);

    DECLARE slot_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT
        d.day_of_week,
        lb.id   AS lesson_block_id,
        r.id    AS room_id
    FROM (
        SELECT 1 AS day_of_week UNION SELECT 2 UNION SELECT 3
        UNION SELECT 4           UNION SELECT 5 UNION SELECT 6
    ) d
    CROSS JOIN LessonBlock lb
    CROSS JOIN Room r
    JOIN #pref p
        ON p.day_of_week      = d.day_of_week
        AND p.lesson_block_id = lb.id
    WHERE NOT EXISTS (
        SELECT 1 FROM LecturerAvailability la
        WHERE la.profile_id      = @profile_id
          AND la.day_of_week     = d.day_of_week
          AND la.lesson_block_id = lb.id
          AND la.is_available    = 0
    )
    AND NOT EXISTS (
        SELECT 1 FROM RoomAvailability ra
        WHERE ra.room_id         = r.id
          AND ra.day_of_week     = d.day_of_week
          AND ra.lesson_block_id = lb.id
          AND ra.is_available    = 0
    )
    AND r.room_type = @preferred_room_type
    ORDER BY
        p.total_weight DESC,
        d.day_of_week,
        lb.id;

    OPEN slot_cursor;
    FETCH NEXT FROM slot_cursor INTO @day, @block, @room_id;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @any_candidate_exists = 1;
        SET @conflict_id          = NULL;
        SET @new_entry_id         = NULL;
        SET @sc_violation         = 0;
        SET @sc_desc              = NULL;

        BEGIN TRANSACTION;

        BEGIN TRY
            SELECT TOP 1 @conflict_id = se.id
            FROM ScheduleEntry se WITH (UPDLOCK, HOLDLOCK)
            WHERE
                se.semester        = @semester
                AND se.day_of_week     = @day
                AND se.lesson_block_id = @block
                AND se.effective_to    IS NULL
                AND (
                    se.week_parity_id = @week_parity_id
                    OR se.week_parity_id = @every_id
                    OR @week_parity_id   = @every_id
                )
                AND (
                    se.profile_id      = @profile_id
                    OR se.room_id      = @room_id
                    OR (se.course_group_id = @course_group_id AND @course_group_id IS NOT NULL)
                    OR (se.small_group_id  = @small_group_id  AND @small_group_id  IS NOT NULL)
                    OR (se.lab_group_id    = @lab_group_id    AND @lab_group_id    IS NOT NULL)
                );

            IF @conflict_id IS NULL
            BEGIN
                EXEC sp_check_subject_constraints
                    @subject_id      = @subject_id,
                    @course_group_id = @course_group_id,
                    @small_group_id  = @small_group_id,
                    @lab_group_id    = @lab_group_id,
                    @semester        = @semester,
                    @proposed_day    = @day,
                    @proposed_block  = @block,
                    @violation       = @sc_violation OUTPUT,
                    @violation_desc  = @sc_desc OUTPUT;

                IF @sc_violation = 1
                BEGIN
                    ROLLBACK TRANSACTION;

                    INSERT INTO SchedulingAttempt
                        (task_id, attempted_day, attempted_block_id,
                         attempted_room_id, was_successful, conflict_type)
                    VALUES (@task_id, @day, @block, @room_id, 0, 'SUBJECT_CONSTRAINT');
                END
                ELSE
                BEGIN
                    INSERT INTO ScheduleEntry (
                        week_parity_id, lesson_block_id, day_of_week, semester,
                        subject_id, profile_id, room_id,
                        course_group_id, small_group_id, lab_group_id
                    )
                    VALUES (
                        @week_parity_id, @block, @day, @semester,
                        @subject_id, @profile_id, @room_id,
                        @course_group_id, @small_group_id, @lab_group_id
                    );

                    SET @new_entry_id = SCOPE_IDENTITY();

                    UPDATE SchedulingTask
                    SET is_scheduled      = 1,
                        schedule_entry_id = @new_entry_id,
                        failed_reason     = NULL
                    WHERE id = @task_id;

                    COMMIT TRANSACTION;

                    INSERT INTO SchedulingAttempt
                        (task_id, attempted_day, attempted_block_id,
                         attempted_room_id, was_successful, conflict_type)
                    VALUES (@task_id, @day, @block, @room_id, 1, NULL);

                    DROP TABLE #pref;
                    CLOSE slot_cursor;
                    DEALLOCATE slot_cursor;
                    RETURN;
                END;
            END
            ELSE
            BEGIN
                SET @swap_day        = NULL;
                SET @swap_block      = NULL;
                SET @swap_room       = NULL;
                SET @swap_sc_violate = 0;
                SET @our_sc_violate  = 0;

                SELECT
                    @bk_subject   = se.subject_id,
                    @bk_profile   = se.profile_id,
                    @bk_parity    = se.week_parity_id,
                    @bk_semester  = se.semester,
                    @bk_cg        = se.course_group_id,
                    @bk_sg        = se.small_group_id,
                    @bk_lg        = se.lab_group_id,
                    @bk_room_type = r.room_type
                FROM ScheduleEntry se
                JOIN Room r ON r.id = se.room_id
                WHERE se.id = @conflict_id;

                SELECT TOP 1
                    @swap_day   = d.day_of_week,
                    @swap_block = lb.id,
                    @swap_room  = r.id
                FROM (
                    SELECT 1 AS day_of_week UNION SELECT 2 UNION SELECT 3
                    UNION SELECT 4           UNION SELECT 5 UNION SELECT 6
                ) d
                CROSS JOIN LessonBlock lb
                CROSS JOIN Room r
                WHERE r.room_type = @bk_room_type
                  AND NOT (d.day_of_week = @day AND lb.id = @block)
                  AND NOT EXISTS (
                      SELECT 1 FROM LecturerAvailability la
                      WHERE la.profile_id      = @bk_profile
                        AND la.day_of_week     = d.day_of_week
                        AND la.lesson_block_id = lb.id
                        AND la.is_available    = 0
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM RoomAvailability ra
                      WHERE ra.room_id         = r.id
                        AND ra.day_of_week     = d.day_of_week
                        AND ra.lesson_block_id = lb.id
                        AND ra.is_available    = 0
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM ScheduleEntry se
                      WHERE se.id              <> @conflict_id
                        AND se.semester        =  @bk_semester
                        AND se.day_of_week     =  d.day_of_week
                        AND se.lesson_block_id =  lb.id
                        AND se.effective_to    IS NULL
                        AND (
                            se.week_parity_id = @bk_parity
                            OR se.week_parity_id = @every_id
                            OR @bk_parity        = @every_id
                        )
                        AND (
                            se.profile_id      = @bk_profile
                            OR se.room_id      = r.id
                            OR (se.course_group_id = @bk_cg AND @bk_cg IS NOT NULL)
                            OR (se.small_group_id  = @bk_sg AND @bk_sg IS NOT NULL)
                            OR (se.lab_group_id    = @bk_lg AND @bk_lg IS NOT NULL)
                        )
                  )
                ORDER BY d.day_of_week, lb.id;

                IF @swap_day IS NOT NULL
                BEGIN
                    EXEC sp_check_subject_constraints
                        @subject_id      = @bk_subject,
                        @course_group_id = @bk_cg,
                        @small_group_id  = @bk_sg,
                        @lab_group_id    = @bk_lg,
                        @semester        = @bk_semester,
                        @proposed_day    = @swap_day,
                        @proposed_block  = @swap_block,
                        @violation       = @swap_sc_violate OUTPUT,
                        @violation_desc  = @swap_sc_desc    OUTPUT;

                    EXEC sp_check_subject_constraints
                        @subject_id      = @subject_id,
                        @course_group_id = @course_group_id,
                        @small_group_id  = @small_group_id,
                        @lab_group_id    = @lab_group_id,
                        @semester        = @semester,
                        @proposed_day    = @day,
                        @proposed_block  = @block,
                        @violation       = @our_sc_violate OUTPUT,
                        @violation_desc  = @our_sc_desc    OUTPUT;

                    IF @swap_sc_violate = 0 AND @our_sc_violate = 0
                    BEGIN
                        UPDATE ScheduleEntry
                        SET day_of_week     = @swap_day,
                            lesson_block_id = @swap_block,
                            room_id         = @swap_room
                        WHERE id = @conflict_id;

                        INSERT INTO ScheduleEntry (
                            week_parity_id, lesson_block_id, day_of_week, semester,
                            subject_id, profile_id, room_id,
                            course_group_id, small_group_id, lab_group_id
                        )
                        VALUES (
                            @week_parity_id, @block, @day, @semester,
                            @subject_id, @profile_id, @room_id,
                            @course_group_id, @small_group_id, @lab_group_id
                        );

                        SET @new_entry_id = SCOPE_IDENTITY();

                        UPDATE SchedulingTask
                        SET is_scheduled      = 1,
                            schedule_entry_id = @new_entry_id,
                            failed_reason     = NULL
                        WHERE id = @task_id;

                        COMMIT TRANSACTION;

                        INSERT INTO SchedulingAttempt
                            (task_id, attempted_day, attempted_block_id,
                             attempted_room_id, was_successful, conflict_type)
                        VALUES (@task_id, @day, @block, @room_id, 1, 'SWAPPED');

                        DROP TABLE #pref;
                        CLOSE slot_cursor;
                        DEALLOCATE slot_cursor;
                        RETURN;
                    END;
                END;

                ROLLBACK TRANSACTION;

                INSERT INTO SchedulingAttempt
                    (task_id, attempted_day, attempted_block_id,
                     attempted_room_id, was_successful, conflict_type)
                VALUES (
                    @task_id, @day, @block, @room_id, 0,
                    (
                        SELECT TOP 1
                            CASE
                                WHEN se2.profile_id      = @profile_id                                    THEN 'LECTURER_CONFLICT'
                                WHEN se2.room_id         = @room_id                                       THEN 'ROOM_CONFLICT'
                                WHEN se2.course_group_id = @course_group_id AND @course_group_id IS NOT NULL THEN 'COURSE_GROUP_CONFLICT'
                                WHEN se2.small_group_id  = @small_group_id  AND @small_group_id  IS NOT NULL THEN 'SMALL_GROUP_CONFLICT'
                                WHEN se2.lab_group_id    = @lab_group_id    AND @lab_group_id    IS NOT NULL THEN 'LAB_GROUP_CONFLICT'
                            END
                        FROM ScheduleEntry se2
                        WHERE se2.id = @conflict_id
                    )
                );
            END;
        END TRY
        BEGIN CATCH
            IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
            INSERT INTO SchedulingAttempt
                (task_id, attempted_day, attempted_block_id,
                 attempted_room_id, was_successful, conflict_type)
            VALUES (@task_id, @day, @block, @room_id, 0, 'CONSTRAINT_VIOLATION');
        END CATCH;

        FETCH NEXT FROM slot_cursor INTO @day, @block, @room_id;
    END;

    CLOSE slot_cursor;
    DEALLOCATE slot_cursor;
    DROP TABLE #pref;

    DECLARE @fail_msg NVARCHAR(200);
    IF @any_candidate_exists = 0
        SET @fail_msg = 'STRUCTURAL: No room of type ''' + @preferred_room_type + ''' is available for profile in any slot.';
    ELSE
        SET @fail_msg = 'CONTENTION: All candidate slots were taken by other tasks.';

    UPDATE SchedulingTask
    SET failed_reason = @fail_msg
    WHERE id = @task_id;

    RAISERROR('sp_schedule_task: No valid slot found for task %d.', 16, 1, @task_id);
END;
GO

CREATE PROCEDURE sp_generate_schedule
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @task_id    INT,
            @scheduled  INT,
            @failed_cnt INT;

    PRINT 'sp_generate_schedule: starting primary pass.';

    DECLARE task_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT id
    FROM   SchedulingTask
    WHERE  is_scheduled = 0
    ORDER  BY priority_score DESC;

    OPEN task_cursor;
    FETCH NEXT FROM task_cursor INTO @task_id;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        BEGIN TRY
            EXEC sp_schedule_task @task_id;
        END TRY
        BEGIN CATCH
            PRINT 'Pass 1 failed for task '
                + CAST(@task_id AS NVARCHAR) + ': ' + ERROR_MESSAGE();
        END CATCH;
        FETCH NEXT FROM task_cursor INTO @task_id;
    END;
    CLOSE task_cursor;
    DEALLOCATE task_cursor;

    SELECT @failed_cnt = COUNT(*)
    FROM SchedulingTask
    WHERE is_scheduled   = 0
      AND failed_reason LIKE 'CONTENTION%';

    IF @failed_cnt > 0
    BEGIN
        PRINT 'sp_generate_schedule: ' + CAST(@failed_cnt AS NVARCHAR)
            + ' CONTENTION task(s) after pass 1. Starting retry pass.';

        UPDATE SchedulingTask
        SET failed_reason = NULL
        WHERE is_scheduled   = 0
          AND failed_reason LIKE 'CONTENTION%';

        DECLARE retry_cursor CURSOR LOCAL FAST_FORWARD FOR
        SELECT id
        FROM   SchedulingTask
        WHERE  is_scheduled   = 0
          AND  (failed_reason IS NULL OR failed_reason LIKE 'CONTENTION%')
        ORDER  BY priority_score DESC;

        OPEN retry_cursor;
        FETCH NEXT FROM retry_cursor INTO @task_id;

        WHILE @@FETCH_STATUS = 0
        BEGIN
            BEGIN TRY
                EXEC sp_schedule_task @task_id;
            END TRY
            BEGIN CATCH
                PRINT 'Pass 2 failed for task '
                    + CAST(@task_id AS NVARCHAR) + ': ' + ERROR_MESSAGE();
            END CATCH;
            FETCH NEXT FROM retry_cursor INTO @task_id;
        END;
        CLOSE retry_cursor;
        DEALLOCATE retry_cursor;
    END;

    SELECT @scheduled  = SUM(CASE WHEN is_scheduled = 1 THEN 1 ELSE 0 END),
           @failed_cnt = SUM(CASE WHEN is_scheduled = 0 THEN 1 ELSE 0 END)
    FROM SchedulingTask;

    PRINT 'sp_generate_schedule complete. Scheduled: '
        + CAST(@scheduled  AS NVARCHAR)
        + '  |  Still unscheduled: '
        + CAST(@failed_cnt AS NVARCHAR);

    IF @failed_cnt > 0
    BEGIN
        SELECT
            st.id,
            s.name              AS subject,
            up.full_name        AS lecturer,
            st.preferred_room_type,
            st.failed_reason,
            CASE
                WHEN st.failed_reason LIKE 'STRUCTURAL%' THEN 'Requires manual intervention'
                WHEN st.failed_reason LIKE 'CONTENTION%' THEN 'May resolve in next cycle'
                ELSE 'Unknown'
            END AS recommended_action
        FROM SchedulingTask st
        JOIN Subject     s  ON s.id  = st.subject_id
        JOIN UserProfile up ON up.id = st.profile_id
        WHERE st.is_scheduled = 0
        ORDER BY st.priority_score DESC;
    END;
END;
GO

INSERT INTO Role (name, description) VALUES
    ('student',            'Enrolled student in a course group'),
    ('lecturer',           'Academic teaching staff member'),
    ('admin',              'Faculty or system administrator'),
    ('dean',               'Dean of a faculty'),
    ('vice-rector',        'Vice-rector with university-wide authority'),
    ('head_of_department', 'Head of an academic department');
GO

INSERT INTO WeekParity (label) VALUES
    ('every'), ('numerator'), ('denominator');
GO

INSERT INTO LessonType (label) VALUES
    ('lecture'), ('practical'), ('lab'), ('language_lab');
GO

INSERT INTO LessonBlock (label, start_time, end_time, is_remote_only) VALUES
    ('1-2',  '09:30', '10:50', 0),
    ('3-4',  '11:00', '12:20', 0),
    ('5-6',  '12:50', '14:10', 0),
    ('7-8',  '14:20', '15:40', 0),
    ('9-10', '16:00', '17:20', 1);
GO

INSERT INTO EquipmentType (name, description) VALUES
    ('Projector',        'Digital projector for presentations'),
    ('PC Workstation',   'Student PC workstation'),
    ('Whiteboard',       'Standard whiteboard'),
    ('Lab Equipment',    'Specialized hardware for lab sessions'),
    ('Language Lab PC',  'PC with headset for language lab');
GO

INSERT INTO Faculty (name, code) VALUES
    ('Faculty of Informatics and Automation', 'FIA'),
    ('Faculty of Computer Science',           'FCS');
GO

INSERT INTO Department (faculty_id, name) VALUES
    (1, 'Software Engineering Department'),
    (1, 'Automation and Robotics Department'),
    (2, 'Computer Science Department'),
    (2, 'Mathematics Department');
GO

INSERT INTO Major (faculty_id, name, major_code, study_form, duration_yrs) VALUES
    (1, 'Software Engineering',    19, 'present', 4),
    (1, 'Software Engineering',    19, 'remote',  5),
    (1, 'Automation and Robotics', 14, 'present', 4),
    (2, 'Computer Science',        21, 'present', 4),
    (2, 'Computer Science',        21, 'remote',  5);
GO

INSERT INTO Building (building_number, name) VALUES
    (1, 'Main Building'),
    (2, 'Engineering Building'),
    (3, 'Lab Building');
GO

INSERT INTO Room (building_id, room_number, floor_number, room_on_floor, capacity, room_type) VALUES
    (1, '1101', 1, 1, 120, 'lecture_hall'),
    (1, '1201', 2, 1,  90, 'lecture_hall'),
    (2, '2305', 3, 5,  30, 'classroom'),
    (2, '2306', 3, 6,  30, 'classroom'),
    (3, '3101', 1, 1,  15, 'lab'),
    (3, '3102', 1, 2,  15, 'lab'),
    (3, '3201', 2, 1,  15, 'language_lab');
GO

INSERT INTO RoomEquipment (room_id, equipment_type_id, quantity) VALUES
    (1, 1, 1), (1, 3, 2),
    (2, 1, 1), (2, 3, 1),
    (3, 3, 1), (4, 3, 1),
    (5, 2, 15), (5, 4, 15),
    (6, 2, 15), (6, 4, 15),
    (7, 5, 15);
GO

INSERT INTO CourseGroup (major_id, admission_year, group_code, capacity) VALUES
    (1, 2023, '319', 90),
    (3, 2023, '314', 75),
    (4, 2023, '321', 80);
GO

INSERT INTO SmallGroup (course_group_id, label, capacity) VALUES
    (1, 'SG-1', 23), (1, 'SG-2', 23),
    (1, 'SG-3', 23), (1, 'SG-4', 21);
GO

INSERT INTO LabGroup (small_group_id, label, capacity) VALUES
    (1, 'LG-1A', 12), (1, 'LG-1B', 11),
    (2, 'LG-2A', 12), (2, 'LG-2B', 11);
GO

INSERT INTO Subject (name, lesson_type_id) VALUES
    ('Algorithms and Data Structures', 1),
    ('Algorithms and Data Structures', 2),
    ('Algorithms and Data Structures', 3),
    ('Operating Systems',              1),
    ('Operating Systems',              2),
    ('Operating Systems',              3),
    ('Discrete Mathematics',           1),
    ('Discrete Mathematics',           2),
    ('Database Systems',               1),
    ('Database Systems',               3),
    ('English Language',               4),
    ('Russian Language',               4);
GO

INSERT INTO SubjectEquipmentReq (subject_id, equipment_type_id, min_quantity) VALUES
    ( 3, 2, 12), ( 3, 4, 12),
    ( 6, 2, 12),
    (10, 2, 12),
    (11, 5, 12),
    (12, 5, 12);
GO

-- ── User accounts ─────────────────────────────────────────────
INSERT INTO [User] (email, password_hash) VALUES
    ('admin.fia@polytechnic.am',   '$2b$12$fia_admin_hash'),
    ('admin.fcs@polytechnic.am',   '$2b$12$fcs_admin_hash'),
    ('a.petrosyan@polytechnic.am', '$2b$12$lecturer_hash'),
    ('johndoe.319@polytechnic.am', '$2b$12$student_hash');
GO

-- ── UserProfile ───────────────────────────────────────────────
INSERT INTO UserProfile (user_id, full_name, faculty_id) VALUES
    (1, 'FIA Administrator', 1),
    (2, 'FCS Administrator', 2);

INSERT INTO UserProfile (user_id, full_name, department_id) VALUES
    (3, 'Dr. Armen Petrosyan', 1);

INSERT INTO UserProfile (user_id, full_name, department_id) VALUES
    (NULL, 'Dr. Lilit Hakobyan',     3),
    (NULL, 'Prof. Vahagn Grigoryan', 2),
    (NULL, 'Dr. Narine Sargsyan',    4),
    (NULL, 'Dr. Tigran Avetisyan',   3);

INSERT INTO UserProfile (user_id, full_name, course_group_id, small_group_id, lab_group_id)
VALUES (4, 'John Doe', 1, 1, 1);
GO

-- ── UserRole assignments ───────────────────────────────────────
DECLARE @rid_student  INT = (SELECT id FROM Role WHERE name = 'student');
DECLARE @rid_lecturer INT = (SELECT id FROM Role WHERE name = 'lecturer');
DECLARE @rid_admin    INT = (SELECT id FROM Role WHERE name = 'admin');

INSERT INTO UserRole (user_id, role_id) VALUES (1, @rid_admin), (2, @rid_admin);
INSERT INTO UserRole (user_id, role_id) VALUES (3, @rid_lecturer);
INSERT INTO UserRole (user_id, role_id) VALUES (4, @rid_student);
GO

INSERT INTO LecturerPreference (profile_id, preferred_day, preferred_block_id, preference_weight) VALUES
    (3, 1, 1, 3),
    (4, 2, 2, 2),
    (5, 4, 1, 2);
GO

INSERT INTO ScheduleEntry
    (week_parity_id,lesson_block_id,day_of_week,semester,subject_id,profile_id,room_id,course_group_id)
VALUES (1,1,1,3, 1,3,1, 1);

INSERT INTO ScheduleEntry
    (week_parity_id,lesson_block_id,day_of_week,semester,subject_id,profile_id,room_id,small_group_id)
VALUES (2,2,2,3, 2,4,3, 1);

INSERT INTO ScheduleEntry
    (week_parity_id,lesson_block_id,day_of_week,semester,subject_id,profile_id,room_id,small_group_id)
VALUES (2,2,2,3, 2,7,4, 2);

INSERT INTO ScheduleEntry
    (week_parity_id,lesson_block_id,day_of_week,semester,subject_id,profile_id,room_id,lab_group_id)
VALUES (1,3,3,3, 3,4,5, 1);

INSERT INTO ScheduleEntry
    (week_parity_id,lesson_block_id,day_of_week,semester,subject_id,profile_id,room_id,lab_group_id)
VALUES (1,3,3,3, 3,7,6, 2);

INSERT INTO ScheduleEntry
    (week_parity_id,lesson_block_id,day_of_week,semester,subject_id,profile_id,room_id,course_group_id)
VALUES (1,1,4,3, 4,5,2, 1);

INSERT INTO ScheduleEntry
    (week_parity_id,lesson_block_id,day_of_week,semester,subject_id,profile_id,room_id,course_group_id)
VALUES (3,2,5,3, 7,6,1, 1);

INSERT INTO ScheduleEntry
    (week_parity_id,lesson_block_id,day_of_week,semester,subject_id,profile_id,room_id,lab_group_id)
VALUES (1,2,1,3, 11,6,7, 1);
GO

INSERT INTO SchedulingTask
    (subject_id,profile_id,week_parity_id,semester,
     course_group_id,small_group_id,lab_group_id,
     preferred_room_type,priority_score)
VALUES
    ( 9, 3, 1, 3,  1,NULL,NULL, 'lecture_hall', 10),
    ( 5, 4, 3, 3, NULL, 1,NULL, 'classroom',     9),
    ( 5, 7, 3, 3, NULL, 2,NULL, 'classroom',     9),
    ( 6, 4, 1, 3, NULL,NULL, 3, 'lab',            8),
    (10, 7, 2, 3, NULL,NULL, 1, 'lab',            7),
    (12, 5, 1, 3, NULL,NULL, 2, 'language_lab',   6),
    ( 8, 6, 2, 3, NULL, 3,NULL, 'classroom',      5);
GO