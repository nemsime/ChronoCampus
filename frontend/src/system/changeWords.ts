export const changeWords: Record<string, [string, string, string]> = {
  "compactLab": ["Лаб.", "Լաբ.", "Lab."],
  "compactLecture": ["Лек.", "Դաս.", "Lec."],
  "compactPractical": ["Пр.", "Գործ.", "Pr."],
  "compactGroup": ["Г", "Խ", "G"],
  "semesterWholeWeek": ["Вся неделя", "Ամբողջ շաբաթը", "Whole week"],
  "semesterDayFilter": ["День расписания", "Դասացուցակի օրը", "Timetable day"],
  "semesterSheetHelp": ["Дни недели разделены на пары, группы — по строкам. Прокрутите таблицу или выберите день для крупного просмотра.", "Շաբաթվա օրերը բաժանված են զույգերի, իսկ խմբերը՝ տողերի։ Սահեցրեք աղյուսակը կամ ընտրեք օրը՝ խոշոր դիտելու համար։", "Each weekday is divided into lesson pairs, with groups in rows. Scroll across the sheet or select a day for a larger view."],
  "semesterScrollHint": ["Прокрутите таблицу вправо, чтобы увидеть все дни.", "Բոլոր օրերը տեսնելու համար աղյուսակը սահեցրեք աջ։", "Scroll the timetable sideways to see every weekday."],
"timetableNotifications": ["Изменения расписания", "Դասացուցակի փոփոխություններ", "Timetable changes"],
"notificationHelp": ["Выберите изменение, чтобы посмотреть занятие и новую дату.", "Ընտրեք փոփոխությունը՝ դասը և նոր ամսաթիվը տեսնելու համար։", "Select a change to see the lesson and its updated details."],
"allTimetableChanges": ["Все изменения", "Բոլոր փոփոխությունները", "All changes"],
"markChangesRead": ["Отметить всё прочитанным", "Նշել բոլորը որպես կարդացված", "Mark all as read"],
"semesterWeekday0": ["Понедельник", "Երկուշաբթի", "Monday"],
"semesterWeekday1": ["Вторник", "Երեքշաբթի", "Tuesday"],
"semesterWeekday2": ["Среда", "Չորեքշաբթի", "Wednesday"],
"semesterWeekday3": ["Четверг", "Հինգշաբթի", "Thursday"],
"semesterWeekday4": ["Пятница", "Ուրբաթ", "Friday"],
"semesterWeekday5": ["Суббота", "Շաբաթ", "Saturday"],
"semesterWeekday6": ["Воскресенье", "Կիրակի", "Sunday"],

  "request_no_change": ["Выберите другую дату, пару или аудиторию.", "Ընտրեք այլ ամսաթիվ, զույգ կամ լսարան։", "Choose a different date, slot or room."],
  "request_placement_changed": ["Размещение не соответствует принятому запросу.", "Տեղադրումը չի համապատասխանում ընդունված հարցմանը։", "The placement no longer matches the accepted request."],
  "requestOneTimeMove": [
    "Запросить разовый перенос",
    "Հայցել մեկանգամյա տեղափոխում",
    "Request a one-time move"
  ],
  "lecturerRequestHelp": [
    "Откройте недельный вид и выберите занятие. Запрос не меняет расписание; администратор проверит и опубликует перенос.",
    "Բացեք շաբաթական տեսքը և ընտրեք դասը։ Հարցումը չի փոխում դասացուցակը․ ադմինիստրատորը կստուգի և կհրապարակի տեղափոխումը։",
    "Select a lesson in the weekly view to request a move. The administrator must check and publish it before the timetable changes."
  ],
  "requestSent": [
    "Запрос отправлен администратору.",
    "Հարցումն ուղարկվել է ադմինիստրատորին։",
    "Request sent to the administrator."
  ],
  "replacementDay": [
    "Новая дата",
    "Նոր ամսաթիվ",
    "Replacement date"
  ],
  "changeReason": [
    "Причина изменения",
    "Փոփոխության պատճառը",
    "Reason for change"
  ],
  "submitChangeRequest": [
    "Отправить запрос",
    "Ուղարկել հարցում",
    "Submit request"
  ],
  "myChangeRequests": [
    "Мои запросы переноса",
    "Իմ տեղափոխման հարցումները",
    "My change requests"
  ],
  "noChangeRequests": [
    "Запросов пока нет.",
    "Հարցումներ դեռ չկան։",
    "No requests yet."
  ],
  "datedChangesUnavailable": [
    "Разовые изменения пока не включены.",
    "Մեկանգամյա փոփոխությունները դեռ միացված չեն։",
    "Dated changes are not enabled yet."
  ],
  "datedChanges": [
    "Разовые изменения и закрытия",
    "Մեկանգամյա փոփոխություններ և փակումներ",
    "One-time changes and closures"
  ],
  "addTeachingClosure": [
    "Добавить временное закрытие",
    "Ավելացնել ժամանակավոր փակում",
    "Add a teaching closure"
  ],
  "closureHelp": [
    "Занятия в выбранные даты станут обязательными отработками. Разместите каждое до или после закрытия в том же семестре. Изменения видны студентам после публикации.",
    "Ընտրված ամսաթվերի դասերը պետք է լրացվեն։ Տեղադրեք դրանք փակումից առաջ կամ հետո՝ նույն կիսամյակում։ Փոփոխությունները տեսանելի են հրապարակումից հետո։",
    "Affected lessons remain owed. Place every replacement before or after the closure, in the same semester. Students see changes only after publication."
  ],
  "affectedGroups": [
    "Затронутые группы",
    "Տուժած խմբերը",
    "Affected groups"
  ],
  "placeMakeupLesson": [
    "Назначить отработку",
    "Նշանակել լրացնող դաս",
    "Place replacement lesson"
  ],
  "datedChangesManualHelp": [
    "Не запускайте генерацию для черновика с разовыми изменениями. Назначьте замены вручную и опубликуйте полный черновик.",
    "Մեկանգամյա փոփոխություններով սևագրի համար մի գործարկեք գեներացիան։ Նշանակեք փոխարինումները ձեռքով և հրապարակեք ամբողջական սևագիրը։",
    "Use manual placement for drafts containing dated changes, then publish the complete draft."
  ],
  "recordOneTimeMove": [
    "Сохранить как разовый перенос",
    "Պահպանել որպես մեկանգամյա տեղափոխում",
    "Record as a one-time move"
  ],
  "applyRequestToDraft": [
    "Применить запрос к выбранному черновику",
    "Կիրառել հարցումն ընտրված սևագրին",
    "Apply request to selected draft"
  ],
  "requestPublishHelp": [
    "Принятие не меняет расписание. Примените перенос, затем опубликуйте черновик.",
    "Ընդունումը չի փոխում դասացուցակը։ Կիրառեք տեղափոխումը, ապա հրապարակեք սևագիրը։",
    "Acceptance does not change the timetable. Apply the move, then publish the draft."
  ],
  "dated_changes_migration_required": [
    "Для разовых изменений требуется обновление базы данных.",
    "Մեկանգամյա փոփոխությունների համար անհրաժեշտ է թարմացնել տվյալների բազան։",
    "Dated changes require a database update."
  ],
  "dated_changes_manual_only": [
    "Черновик с разовыми изменениями редактируется вручную.",
    "Մեկանգամյա փոփոխություններով սևագիրը խմբագրվում է ձեռքով։",
    "Edit drafts with dated changes manually."
  ],
  "teaching_closed": [
    "В эту дату занятия закрыты для группы.",
    "Այս օրը խմբի համար դասեր չեն թույլատրվում։",
    "Teaching is closed for this group on this date."
  ],
  "makeup_required": [
    "Нужна отработка занятия",
    "Պահանջվում է լրացնող դաս",
    "Replacement lesson required"
  ],
  "closure_overlaps": [
    "Закрытие пересекается с существующим.",
    "Փակումը համընկնում է գոյություն ունեցողի հետ։",
    "Closure overlaps an existing closure."
  ],
  "legacy_emergency_conflict": [
    "В выбранных занятиях есть чрезвычайная отмена с отработкой в тот же день.",
    "Ընտրված դասերում կա նույն օրվա լրացմամբ արտակարգ չեղարկում։",
    "Selected lessons include a legacy same-day emergency replacement."
  ],
  "request_not_accepted": [
    "Запрос должен быть принят администратором.",
    "Հարցումը պետք է ընդունվի ադմինիստրատորի կողմից։",
    "The administrator must accept the request first."
  ],
  "request_outdated": [
    "Расписание изменилось. Требуется новый запрос.",
    "Դասացուցակը փոխվել է։ Անհրաժեշտ է նոր հարցում։",
    "The timetable changed; submit a new request."
  ],
  "request_already_open": [
    "Для этого занятия уже есть открытый запрос.",
    "Այս դասի համար արդեն կա բաց հարցում։",
    "This lesson already has a pending request."
  ],
  "request_publish_required": [
    "Запрос выполняется только после публикации переноса.",
    "Հարցումը կատարվում է միայն տեղափոխման հրապարակումից հետո։",
    "The request is completed only when the replacement is published."
  ],
  "template_closure_makeup": [
    "Отработка из-за закрытия",
    "Փակման պատճառով լրացնող դաս",
    "Closure replacement"
  ],
  "template_one_time_move": [
    "Разовый перенос",
    "Մեկանգամյա տեղափոխում",
    "One-time move"
  ],
  "template_makeup_pending": [
    "Отработка ещё не назначена",
    "Լրացնող դասը դեռ նշանակված չէ",
    "Replacement not yet placed"
  ],
  "requestPrevious": [
    "Предыдущие",
    "Նախորդները",
    "Previous"
  ],
  "requestNext": [
    "Следующие",
    "Հաջորդները",
    "Next"
  ]
};
