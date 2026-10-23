export const ruleMessages: Record<string, [string, string, string]> = {
  previous_page: ["Предыдущая страница", "Նախորդ էջ", "Previous page"],
  next_page: ["Следующая страница", "Հաջորդ էջ", "Next page"],
  cohort_identity_has_workload: [
    "Нельзя менять специальность или год набора с существующей нагрузкой.",
    "Ծանրաբեռնվածություն ունեցող հոսքի մասնագիտությունը կամ ընդունման տարին փոխել չի կարելի։",
    "A cohort with workload cannot change its major or admission year.",
  ],
  study_form_has_workload: [
    "Нельзя менять форму обучения специальности с существующей нагрузкой.",
    "Ծանրաբեռնվածություն ունեցող մասնագիտության ուսուցման ձևը փոխել չի կարելի։",
    "A major with workload cannot change its study form.",
  ],
  manual_holiday_move: [
    "Нельзя переносить занятие на праздник и засчитывать его как отменённое. Выберите учебный день.",
    "Դասը չի կարելի տեղափոխել տոնական օր և հաշվառել որպես չեղարկված։ Ընտրեք ուսումնական օր։",
    "A manual move cannot turn a lesson into a holiday exemption. Choose a teaching day.",
  ],
  invalid_reference: [
    "Выберите существующую связанную запись.",
    "Ընտրեք գոյություն ունեցող կապակցված գրառում։",
    "Select an existing related record.",
  ],
  no_workload: [
    "Для выбранного набора и семестра ещё нет учебной нагрузки.",
    "Ընտրված հոսքի և կիսամյակի ծանրաբեռնվածությունը դեռ չկա։",
    "No workload exists for the selected cohort and semester.",
  ],
  academic_units_required: [
    "Укажите количество учебных часов в одной паре.",
    "Նշեք ակադեմիական ժամերի քանակը մեկ դասում։",
    "Set academic hours per lesson.",
  ],
  indivisible_workload: [
    "Часы нагрузки должны делиться на количество часов в паре без остатка.",
    "Ծանրաբեռնվածության ժամերը պետք է բաժանվեն մեկ դասի ժամերին առանց մնացորդի։",
    "Workload hours must be divisible by hours per lesson.",
  ],
  configuration_unconfirmed: [
    "Подтвердите настройки семестра и сетки перед публикацией.",
    "Հրապարակումից առաջ հաստատեք կիսամյակի և ժամային ցանցի կարգավորումները։",
    "Confirm semester and grid settings before publication.",
  ],
  teaching_period_required: [
    "Задайте период обычных занятий, исключая экзамены.",
    "Նշեք սովորական դասերի ժամանակահատվածը՝ առանց քննությունների։",
    "Set regular teaching periods, excluding exams.",
  ],
  teaching_week_count_mismatch: [
    "Число недель в учебных периодах не совпадает с настройкой сетки. Проверьте периоды и число учебных недель.",
    "Դասերի ժամանակահատվածների շաբաթների թիվը չի համընկնում կարգավորման հետ։ Ստուգեք դրանք։",
    "Teaching periods and configured week count differ. Check both settings.",
  ],
  room_capacity: [
    "Недостаточно мест в аудитории. Выберите более вместительную.",
    "Լսարանում տեղերը բավարար չեն։ Ընտրեք ավելի մեծ լսարան։",
    "Room capacity is too small. Choose a larger room.",
  ],
  room_type: [
    "Аудитория не подходит для этого вида занятия.",
    "Լսարանը չի համապատասխանում դասի տեսակին։",
    "Room type does not support this lesson.",
  ],
  room_equipment: [
    "В аудитории нет необходимого оборудования.",
    "Լսարանում անհրաժեշտ սարքավորումները չկան։",
    "Required equipment is missing from the room.",
  ],
  room_unavailable: [
    "Аудитория закрыта в это время.",
    "Լսարանն այս ժամին անհասանելի է։",
    "Room is blocked at this time.",
  ],
  teacher_unavailable: [
    "У преподавателя запрет на это время.",
    "Դասախոսն այս ժամին անհասանելի է։",
    "Teacher is unavailable at this time.",
  ],
  room_conflict: [
    "Аудитория уже занята другим занятием.",
    "Լսարանն արդեն զբաղված է այլ դասով։",
    "Room is occupied by another lesson.",
  ],
  teacher_conflict: [
    "У преподавателя уже есть другое занятие.",
    "Դասախոսն արդեն ունի այլ դաս։",
    "Teacher has another lesson at this time.",
  ],
  group_conflict: [
    "У этих студентов уже есть другое занятие.",
    "Այս ուսանողներն արդեն ունեն այլ դաս։",
    "These students already have another lesson.",
  ],
  external_room_conflict: [
    "Аудитория занята в опубликованном расписании другого набора.",
    "Լսարանը զբաղված է այլ հոսքի հրապարակված դասացուցակում։",
    "Room is occupied in another published timetable.",
  ],
  external_teacher_conflict: [
    "Преподаватель занят в другом опубликованном расписании.",
    "Դասախոսը զբաղված է այլ հրապարակված դասացուցակում։",
    "Teacher is occupied in another published timetable.",
  ],
  external_group_conflict: [
    "Набор занят в другом опубликованном расписании.",
    "Հոսքը զբաղված է այլ հրապարակված դասացուցակում։",
    "Cohort is occupied in another published timetable.",
  ],
  slot_not_permitted: [
    "Дополнительная пара не разрешена на эту дату.",
    "Լրացուցիչ դասն այս ամսաթվին թույլատրված չէ։",
    "This additional lesson is not permitted on this date.",
  ],
  outside_teaching_period: [
    "Дата вне периода занятий или учебных дней.",
    "Ամսաթիվը դուրս է դասերի ժամանակահատվածից կամ ուսումնական օրերից։",
    "Date is outside teaching periods or teaching weekdays.",
  ],
  outside_operating_hours: [
    "Пара выходит за допустимое время работы.",
    "Դասը դուրս է թույլատրելի աշխատանքային ժամերից։",
    "Lesson exceeds operating hours.",
  ],
  emergency_extra_permission_required: [
    "Разрешите дополнительную пару и интервал на дату отработки.",
    "Թույլատրեք լրացուցիչ դաս և ժամանակահատված լրացման ամսաթվին։",
    "Permit an extra lesson and time interval on the makeup date.",
  ],
  emergency_requires_extra_slot: [
    "Отработка должна пройти в тот же день после обычных пар.",
    "Լրացումը պետք է լինի նույն օրը՝ սովորական դասերից հետո։",
    "Makeup must be on the same date after ordinary lessons.",
  ],
  search_incomplete: [
    "Поиск не разместил занятие. Проверьте доступность ресурсов или увеличьте лимит поиска.",
    "Որոնումը չի տեղադրել դասը։ Ստուգեք ռեսուրսները կամ մեծացրեք որոնման ժամանակը։",
    "Search did not place this lesson. Check resource availability or increase the search limit.",
  ],
  pin_changed: [
    "Закреплённое занятие нельзя перемещать при генерации.",
    "Ամրագրված դասը գեներացման ընթացքում չի կարող տեղափոխվել։",
    "Pinned lesson must remain fixed during generation.",
  ],
  schedule_conflict: [
    "Изменение не сохранено: найдены нарушения.",
    "Փոփոխությունը չի պահպանվել․ կան խախտումներ։",
    "Change was not saved because constraints were violated.",
  ],
  publication_blocked: [
    "Публикация заблокирована до устранения всех проблем.",
    "Հրապարակումն արգելափակված է մինչև բոլոր խնդիրների լուծումը։",
    "Publication is blocked until all problems are resolved.",
  ],
  subgroup_capacity: [
    "Сумма размеров подгрупп превышает размер родительской группы.",
    "Ենթախմբերի ընդհանուր չափը գերազանցում է ծնող խմբի չափը։",
    "Combined subgroup sizes exceed the parent group size.",
  ],
  invalid_subgroup: [
    "Подгруппа не принадлежит выбранному набору.",
    "Ենթախումբը չի պատկանում ընտրված հոսքին։",
    "Subgroup does not belong to this cohort.",
  ],
  invalid_lab_group: [
    "Лабораторная подгруппа не принадлежит выбранной подгруппе.",
    "Լաբորատոր ենթախումբը չի պատկանում ընտրված ենթախմբին։",
    "Lab subgroup does not belong to this subgroup.",
  ],
  group_parent_immutable: [
    "Родитель существующей подгруппы не меняется. Создайте новую подгруппу.",
    "Գոյություն ունեցող ենթախմբի ծնողը չի փոխվում։ Ստեղծեք նոր ենթախումբ։",
    "Create a new subgroup to use a different parent.",
  ],
  student_group_required: [
    "Выберите набор для студента.",
    "Ընտրեք ուսանողի հոսքը։",
    "Choose a cohort for this student.",
  ],
  student_membership_only: [
    "Привязка к студенческим группам доступна только для роли студента.",
    "Ուսանողական խմբին կապելը հասանելի է միայն ուսանողի դերի համար։",
    "Only students can have student group membership.",
  ],
  teacher_has_workload: [
    "У преподавателя есть учебная нагрузка. Сначала решите вопрос с его назначениями.",
    "Դասախոսն ունի ուսումնական ծանրաբեռնվածություն։ Նախ կարգավորեք նշանակումները։",
    "Teacher has assigned workload; resolve those assignments first.",
  ],
  lecturer_required: [
    "Выберите активного преподавателя.",
    "Ընտրեք ակտիվ դասախոս։",
    "Select an active lecturer.",
  ],
  study_form_mismatch: [
    "Форма обучения набора и сетки семестра не совпадает.",
    "Հոսքի և կիսամյակի ուսուցման ձևերը չեն համընկնում։",
    "Cohort and semester grid study forms differ.",
  ],
  workload_has_occurrences: [
    "По этой нагрузке уже созданы занятия. Для изменения учебного плана создайте новый семестр, чтобы сохранить опубликованное расписание и заметки.",
    "Այս ծանրաբեռնվածությամբ դասեր արդեն կան։ Փոփոխության համար ստեղծեք նոր կիսամյակ՝ պահպանելով հրապարակված դասացուցակն ու նշումները։",
    "Lessons already exist for this workload. Use a new semester to revise it while preserving published schedules and notes.",
  ],
  cannot_disable_self: [
    "Нельзя отключить собственную учётную запись администратора.",
    "Չեք կարող անջատել ձեր ադմինիստրատորի հաշիվը։",
    "You cannot disable your own administrator account.",
  ],
  password_required: [
    "Для нового пользователя нужен временный пароль от 12 символов.",
    "Նոր օգտատիրոջ համար անհրաժեշտ է առնվազն 12 նիշով ժամանակավոր գաղտնաբառ։",
    "New users need a temporary password of at least 12 characters.",
  ],
  invalid_email: [
    "Проверьте адрес электронной почты.",
    "Ստուգեք էլեկտրոնային փոստի հասցեն։",
    "Check the email address.",
  ],
  unpin_before_cancellation: [
    "Сначала сохраните занятие без закрепления.",
    "Նախ պահպանեք դասն առանց ամրագրման։",
    "Save the lesson without its pin first.",
  ],
  outside_term: [
    "Период должен находиться внутри дат семестра.",
    "Ժամանակահատվածը պետք է լինի կիսամյակի սահմաններում։",
    "Period must be within semester dates.",
  ],
  generation_already_running: [
    "Для этого черновика уже идёт поиск.",
    "Այս սևագրի որոնումն արդեն ընթանում է։",
    "Generation is already running for this draft.",
  ],
  generation_queue_full: [
    "Очередь генерации заполнена. Дождитесь завершения текущих запусков.",
    "Գեներացման հերթը լիքն է։ Սպասեք ընթացիկ գործարկումների ավարտին։",
    "Generation queue is full. Wait for current runs to finish.",
  ],
  invalid_input: [
    "Проверьте заполнение полей формы.",
    "Ստուգեք ձևի դաշտերը։",
    "Check the form fields.",
  ],
};
