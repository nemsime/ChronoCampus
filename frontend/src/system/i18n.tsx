import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { ruleMessages } from "./ruleMessages";
import { diagnosticWords } from "./diagnosticWords";
import { runtimeWords } from "./runtimeWords";
import { scheduleWords } from "./scheduleWords";
import { uiWords } from "./uiWords";
export type Language = "ru" | "hy" | "en";
const words: Record<string, [string, string, string]> = {
  ...ruleMessages,
  ...diagnosticWords,
  ...runtimeWords,
  ...scheduleWords,
  ...uiWords,
  schedule: ["Расписание", "Դասացուցակ", "Timetable"],
  catalogs: ["Данные и правила", "Տվյալներ և կանոններ", "Data & rules"],
  planner: ["Генератор", "Գեներատոր", "Planner"],
  feedback: ["Обращения", "Դիմումներ", "Support"],
  account: ["Аккаунт", "Հաշիվ", "Account"],
  login: ["Войти", "Մուտք գործել", "Sign in"],
  logout: ["Выйти", "Դուրս գալ", "Sign out"],
  email: ["Университетская почта", "Համալսարանի էլ․ փոստ", "University email"],
  password: ["Пароль", "Գաղտնաբառ", "Password"],
  current_password: ["Текущий пароль", "Ընթացիկ գաղտնաբառ", "Current password"],
  newPassword: [
    "Новый пароль (не менее 12 символов)",
    "Նոր գաղտնաբառ (առնվազն 12 նիշ)",
    "New password (at least 12 characters)",
  ],
  confirmPassword: [
    "Повторите новый пароль",
    "Կրկնեք նոր գաղտնաբառը",
    "Confirm new password",
  ],
  forgot: ["Забыли пароль?", "Մոռացե՞լ եք գաղտնաբառը", "Forgot password?"],
  reset: ["Восстановить доступ", "Վերականգնել մուտքը", "Reset password"],
  changePassword: ["Изменить пароль", "Փոխել գաղտնաբառը", "Change password"],
  reset_requested: [
    "Если адрес подходит для восстановления, письмо отправлено.",
    "Եթե հասցեն համապատասխանում է, նամակն ուղարկված է։",
    "If the address is eligible, a recovery email has been sent.",
  ],
  password_changed: [
    "Пароль изменён. Войдите снова.",
    "Գաղտնաբառը փոխվել է։ Մուտք գործեք կրկին։",
    "Password changed. Sign in again.",
  ],
  password_change_required: [
    "Замените временный пароль для продолжения.",
    "Շարունակելու համար փոխեք ժամանակավոր գաղտնաբառը։",
    "Change your temporary password to continue.",
  ],
  password_mismatch: [
    "Пароли не совпадают",
    "Գաղտնաբառերը չեն համընկնում",
    "Passwords do not match",
  ],
  welcome: [
    "Учёба по расписанию",
    "Ուսում՝ ըստ դասացուցակի",
    "A clearer academic day",
  ],
  welcomeText: [
    "Занятия, личные заметки и связь с университетом в одном месте.",
    "Դասերը, անձնական նշումները և կապը համալսարանի հետ՝ մեկ վայրում։",
    "Classes, personal notes and university support in one place.",
  ],
  save: ["Сохранить", "Պահպանել", "Save"],
  cancel: ["Отмена", "Չեղարկել", "Cancel"],
  add: ["Добавить", "Ավելացնել", "Add"],
  edit: ["Изменить", "Խմբագրել", "Edit"],
  delete: ["Удалить", "Ջնջել", "Delete"],
  refresh: ["Обновить", "Թարմացնել", "Refresh"],
  loading: ["Загрузка…", "Բեռնվում է…", "Loading…"],
  empty: ["Пока нет записей", "Գրառումներ դեռ չկան", "No records yet"],
  saved: ["Сохранено", "Պահպանված է", "Saved"],
  all: ["Все", "Բոլորը", "All"],
  search: ["Поиск", "Որոնում", "Search"],
  select: ["Выберите", "Ընտրեք", "Select"],
  none: ["Нет", "Չկա", "None"],
  yes: ["Да", "Այո", "Yes"],
  no: ["Нет", "Ոչ", "No"],
  confirmDelete: [
    "Удалить выбранную запись?",
    "Ջնջե՞լ ընտրված գրառումը։",
    "Delete this record?",
  ],
  admin: ["Администратор", "Ադմինիստրատոր", "Administrator"],
  lecturer: ["Преподаватель", "Դասախոս", "Lecturer"],
  student: ["Студент", "Ուսանող", "Student"],
  faculties: ["Факультеты", "Ֆակուլտետներ", "Faculties"],
  majors: ["Специальности", "Մասնագիտություններ", "Majors"],
  groups: ["Наборы", "Հոսքեր", "Cohorts"],
  subgroups: ["Подгруппы", "Ենթախմբեր", "Subgroups"],
  "lab-groups": [
    "Лабораторные подгруппы",
    "Լաբորատոր ենթախմբեր",
    "Lab subgroups",
  ],
  buildings: ["Корпуса", "Մասնաշենքեր", "Buildings"],
  rooms: ["Аудитории", "Լսարաններ", "Rooms"],
  equipment: ["Оборудование", "Սարքավորումներ", "Equipment"],
  subjects: ["Предметы", "Առարկաներ", "Subjects"],
  users: ["Пользователи", "Օգտատերեր", "Users"],
  calendars: ["Сетки занятий", "Դասերի ժամային ցանցեր", "Timetable grids"],
  terms: ["Семестры", "Կիսամյակներ", "Semesters"],
  periods: ["Периоды занятий", "Դասերի ժամանակահատվածներ", "Teaching periods"],
  holidays: ["Праздники", "Տոնական օրեր", "Holidays"],
  "extra-permissions": [
    "Дополнительные пары",
    "Լրացուցիչ դասեր",
    "Extra lesson permissions",
  ],
  availability: [
    "Доступность и пожелания",
    "Հասանելիություն և նախընտրություններ",
    "Availability & preferences",
  ],
  workloads: [
    "Учебная нагрузка",
    "Ուսումնական ծանրաբեռնվածություն",
    "Workload",
  ],
  name: ["Название", "Անվանում", "Name"],
  code: ["Код", "Կոդ", "Code"],
  faculty_id: ["Факультет", "Ֆակուլտետ", "Faculty"],
  major_id: ["Специальность", "Մասնագիտություն", "Major"],
  major_code: ["Код специальности", "Մասնագիտության կոդ", "Major code"],
  study_form: ["Форма обучения", "Ուսուցման ձև", "Study form"],
  duration_yrs: ["Длительность, лет", "Տևողությունը, տարի", "Duration, years"],
  present: ["Очная", "Առկա", "Full-time"],
  remote: ["Заочная", "Հեռակա", "Part-time"],
  admission_year: ["Год поступления", "Ընդունման տարի", "Admission year"],
  group_code: ["Код набора", "Հոսքի կոդ", "Cohort code"],
  capacity: [
    "Количество мест / студентов",
    "Տեղերի / ուսանողների քանակ",
    "Capacity / students",
  ],
  course_group_id: ["Набор", "Հոսք", "Cohort"],
  small_group_id: ["Подгруппа", "Ենթախումբ", "Subgroup"],
  lab_group_id: [
    "Лабораторная подгруппа",
    "Լաբորատոր ենթախումբ",
    "Lab subgroup",
  ],
  label: ["Обозначение", "Նշում", "Label"],
  building_number: ["Номер корпуса", "Մասնաշենքի համար", "Building number"],
  address: ["Адрес", "Հասցե", "Address"],
  building_id: ["Корпус", "Մասնաշենք", "Building"],
  room_number: ["Номер аудитории", "Լսարանի համար", "Room number"],
  floor_number: ["Этаж", "Հարկ", "Floor"],
  room_on_floor: ["Номер на этаже", "Համարը հարկում", "Number on floor"],
  room_type: ["Тип аудитории", "Լսարանի տեսակ", "Room type"],
  lecture_hall: ["Лекционная", "Դասախոսության լսարան", "Lecture hall"],
  classroom: ["Учебная", "Դասասենյակ", "Classroom"],
  lab: ["Лабораторная", "Լաբորատոր", "Laboratory"],
  language_lab: ["Языковая лаборатория", "Լեզվի լաբորատորիա", "Language lab"],
  equipment_ids: ["Оборудование", "Սարքավորումներ", "Equipment"],
  description: ["Описание", "Նկարագրություն", "Description"],
  display_name: ["Имя", "Անուն", "Display name"],
  role: ["Роль", "Դեր", "Role"],
  is_active: ["Активен", "Ակտիվ է", "Active"],
  first_start: [
    "Начало первой пары",
    "Առաջին դասի սկիզբ",
    "First lesson starts",
  ],
  lesson_minutes: [
    "Длительность пары, мин",
    "Դասի տևողությունը, րոպե",
    "Lesson duration, minutes",
  ],
  break_minutes: [
    "Обычный перерыв, мин",
    "Սովորական ընդմիջում, րոպե",
    "Default break, minutes",
  ],
  break_overrides: [
    "Особые перерывы после пары",
    "Հատուկ ընդմիջումներ դասից հետո",
    "Break overrides after lesson",
  ],
  weekdays: ["Учебные дни", "Ուսումնական օրեր", "Teaching weekdays"],
  ordinary_slots: [
    "Обычных пар в день",
    "Սովորական դասերը օրական",
    "Ordinary lessons per day",
  ],
  operating_end: [
    "Закрытие, необязательно",
    "Փակման ժամը, ոչ պարտադիր",
    "Closing time, optional",
  ],
  academic_hours_per_lesson: [
    "Учебных часов в паре",
    "Ակադեմիական ժամեր մեկ դասում",
    "Academic hours per lesson",
  ],
  academic_hour_minutes: [
    "Учебный час, мин",
    "Ակադեմիական ժամ, րոպե",
    "Academic hour, minutes",
  ],
  teaching_weeks: ["Учебных недель", "Ուսումնական շաբաթներ", "Teaching weeks"],
  confirmed: [
    "Правила подтверждены",
    "Կանոնները հաստատված են",
    "Rules confirmed",
  ],
  quality_weights: [
    "Веса дополнительных критериев",
    "Լրացուցիչ չափանիշների կշիռներ",
    "Secondary objective weights",
  ],
  teacher_gaps: [
    "Окна преподавателей",
    "Դասախոսների ազատ միջակայքեր",
    "Teacher gaps",
  ],
  daily_overload: [
    "Дневная нагрузка",
    "Օրական ծանրաբեռնվածություն",
    "Daily load",
  ],
  lecture_order: [
    "Порядок лекций",
    "Դասախոսությունների հերթականություն",
    "Lecture order",
  ],
  preferences: ["Пожелания", "Նախընտրություններ", "Preferences"],
  unconfirmed: ["Не подтверждено", "Հաստատված չէ", "Unconfirmed"],
  same_day: [
    "Лекции раньше практики в тот же день",
    "Դասախոսությունը գործնականից առաջ՝ նույն օրը",
    "Lectures before practice on same day",
  ],
  off: ["Не учитывать", "Հաշվի չառնել", "Off"],
  academic_year: ["Учебный год", "Ուսումնական տարի", "Academic year"],
  starts_on: ["Начало", "Սկիզբ", "Start"],
  ends_on: ["Окончание", "Ավարտ", "End"],
  calendar_id: ["Сетка", "Ժամային ցանց", "Grid"],
  holiday_policy: [
    "Учёт праздничных отмен",
    "Տոնական չեղարկումների հաշվառում",
    "Holiday cancellation accounting",
  ],
  exempt: [
    "Без отработки, отдельно в отчёте",
    "Առանց լրացման, առանձին հաշվետվությամբ",
    "Exempt; recorded separately",
  ],
  strict: [
    "Требуется вся нагрузка",
    "Պահանջվում է ամբողջ ծանրաբեռնվածությունը",
    "Full planned load required",
  ],
  search_seconds: [
    "Лимит поиска, секунд",
    "Որոնման սահմանը, վայրկյան",
    "Search limit, seconds",
  ],
  term_id: ["Семестр", "Կիսամյակ", "Semester"],
  day: ["Дата", "Ամսաթիվ", "Date"],
  weekday: ["День недели", "Շաբաթվա օր", "Weekday"],
  slots: [
    "Разрешённые номера пар",
    "Թույլատրված դասերի համարներ",
    "Allowed lesson numbers",
  ],
  from_time: ["С", "Սկսած", "From"],
  until_time: ["До", "Մինչև", "Until"],
  reason: ["Причина", "Պատճառ", "Reason"],
  teacher_id: ["Преподаватель", "Դասախոս", "Lecturer"],
  room_id: ["Аудитория", "Լսարան", "Room"],
  parity: ["Тип недели", "Շաբաթվա տեսակ", "Week parity"],
  every: ["Каждую неделю", "Ամեն շաբաթ", "Every week"],
  numerator: ["Числитель", "Համարիչ", "Numerator"],
  denominator: ["Знаменатель", "Հայտարար", "Denominator"],
  kind: ["Вид ограничения", "Սահմանափակման տեսակ", "Rule type"],
  unavailable: ["Недоступен", "Անհասանելի", "Unavailable"],
  preferred: ["Предпочтительно", "Նախընտրելի", "Preferred"],
  subject_id: ["Предмет", "Առարկա", "Subject"],
  lesson_type: ["Вид занятия", "Դասի տեսակ", "Lesson type"],
  lecture: ["Лекция", "Դասախոսություն", "Lecture"],
  practical: ["Практическое", "Գործնական", "Practical"],
  semester_hours: ["Часов за семестр", "Ժամեր կիսամյակում", "Semester hours"],
  assessment: ["Форма контроля", "Ստուգման ձև", "Assessment"],
  exam: ["Экзамен", "Քննություն", "Exam"],
  credit: ["Зачёт", "Ստուգարք", "Credit"],
  preferred_daily_max: [
    "Желательно пар в день, не более",
    "Ցանկալի առավելագույն դասերը օրական",
    "Preferred daily maximum",
  ],
  mon: ["Пн", "Երկ", "Mon"],
  tue: ["Вт", "Երք", "Tue"],
  wed: ["Ср", "Չրք", "Wed"],
  thu: ["Чт", "Հնգ", "Thu"],
  fri: ["Пт", "Ուրբ", "Fri"],
  sat: ["Сб", "Շբթ", "Sat"],
  sun: ["Вс", "Կիր", "Sun"],
  draft: ["Черновик", "Սևագիր", "Draft"],
  published: ["Опубликовано", "Հրապարակված", "Published"],
  createDraft: ["Создать черновик", "Ստեղծել սևագիր", "Create draft"],
  generate: [
    "Составить расписание",
    "Կազմել դասացուցակը",
    "Generate timetable",
  ],
  publish: ["Опубликовать", "Հրապարակել", "Publish"],
  seed: ["Начальное число поиска", "Որոնման սկզբնական թիվ", "Random seed"],
  algorithm: ["Алгоритм", "Ալգորիթմ", "Algorithm"],
  cp_sat: ["CP-SAT (основной)", "CP-SAT (հիմնական)", "CP-SAT (recommended)"],
  greedy_local: [
    "Жадный + локальный поиск",
    "Ագահ + տեղային որոնում",
    "Greedy + local search",
  ],
  complete: [
    "Все занятия размещены",
    "Բոլոր դասերը տեղադրված են",
    "All lessons placed",
  ],
  partial: [
    "Есть неразмещённые занятия",
    "Կան չտեղադրված դասեր",
    "Some lessons remain unplaced",
  ],
  required_hours: ["Требуется", "Պահանջվում է", "Required"],
  planned_hours: ["Назначено", "Նշանակված է", "Planned"],
  cancelled_hours: [
    "Праздничные отмены",
    "Տոնական չեղարկումներ",
    "Holiday cancellations",
  ],
  remaining_hours: ["Осталось", "Մնացել է", "Remaining"],
  pinned: ["Закреплено", "Ամրագրված", "Pinned"],
  pin: [
    "Закрепить время и аудиторию",
    "Ամրագրել ժամը և լսարանը",
    "Pin time and room",
  ],
  slot: ["Номер пары", "Դասի համար", "Lesson number"],
  emergency: [
    "Экстренная отмена с отработкой",
    "Արտակարգ չեղարկում՝ լրացումով",
    "Emergency cancellation requiring makeup",
  ],
  emergencyHelp: [
    "Сначала разрешите дополнительную пару на эту дату. Отработка сохранит связь с заметками.",
    "Նախ թույլատրեք լրացուցիչ դաս այս ամսաթվի համար։ Նշումները կպահպանվեն։",
    "First permit an extra lesson on this date. Notes will stay attached.",
  ],
  note: ["Личная заметка", "Անձնական նշում", "Personal note"],
  notes: ["Заметки", "Նշումներ", "Notes"],
  cancelled: [
    "Отменено в праздник",
    "Չեղարկված է տոնի պատճառով",
    "Cancelled for holiday",
  ],
  subject: ["Тема", "Թեմա", "Subject"],
  content: ["Сообщение", "Հաղորդագրություն", "Message"],
  reply: ["Ответить", "Պատասխանել", "Reply"],
  new: ["Новое", "Նոր", "New"],
  in_progress: ["В работе", "Ընթացքում", "In progress"],
  closed: ["Закрыто", "Փակված", "Closed"],
  status: ["Статус", "Կարգավիճակ", "Status"],
  queued: ["В очереди", "Հերթում", "Queued"],
  running: ["Поиск решения…", "Լուծման որոնում…", "Searching…"],
  failed: ["Ошибка выполнения", "Կատարման սխալ", "Failed"],
  stale: [
    "Данные изменились — повторите запуск",
    "Տվյալները փոխվել են․ կրկնեք",
    "Inputs changed; rerun",
  ],
  interrupted: [
    "Прервано перезапуском сервера",
    "Ընդհատվել է սերվերի վերագործարկմամբ",
    "Interrupted by server restart",
  ],
  rejected: [
    "Результат не прошёл проверку",
    "Արդյունքը չի անցել ստուգումը",
    "Result rejected by validation",
  ],
  publishConfirm: [
    "Опубликовать эту версию для выбранных наборов?",
    "Հրապարակե՞լ այս տարբերակը ընտրված հոսքերի համար։",
    "Publish this version for the selected cohorts?",
  ],
  unpublished: [
    "Пользователи видят только опубликованную версию.",
    "Օգտատերերը տեսնում են միայն հրապարակված տարբերակը։",
    "Users see only the published version.",
  ],
  catalogHelp: [
    "Семестр включает экзамены. В «Периодах занятий» укажите только даты обычных занятий.",
    "Կիսամյակը ներառում է քննությունները։ «Դասերի ժամանակահատվածներ»-ում նշեք միայն սովորական դասերի օրերը։",
    "A semester includes exams. Teaching periods must contain only regular class dates.",
  ],
  unavailableCalendar: [
    "Неподтверждённая сетка блокирует публикацию. Проверьте часы в паре и учебные недели.",
    "Չհաստատված ցանցը արգելափակում է հրապարակումը։ Ստուգեք ժամերը և շաբաթները։",
    "Unconfirmed grids block publication. Check academic units and teaching weeks.",
  ],
  request_failed: [
    "Не удалось выполнить запрос",
    "Հարցումը չհաջողվեց",
    "Request failed",
  ],
  invalid_credentials: [
    "Неверная почта или пароль",
    "Սխալ էլ․ փոստ կամ գաղտնաբառ",
    "Invalid email or password",
  ],
  database_unavailable: [
    "База данных недоступна",
    "Տվյալների բազան անհասանելի է",
    "Database unavailable",
  ],
  data_conflict: [
    "Запись дублируется или используется другими данными",
    "Գրառումը կրկնվում է կամ օգտագործվում է այլ տվյալներում",
    "Record duplicates or is referenced by other data",
  ],
  too_many_attempts: [
    "Слишком много попыток. Повторите позже.",
    "Չափազանց շատ փորձեր։ Փորձեք ավելի ուշ։",
    "Too many attempts. Try again later.",
  ],
  invalid_reset_token: [
    "Ссылка истекла или уже использована",
    "Հղումը ժամկետանց է կամ արդեն օգտագործված",
    "Link expired or already used",
  ],
  mail_not_configured: [
    "Администратор ещё не настроил отправку почты",
    "Ադմինիստրատորը դեռ չի կարգավորել փոստը",
    "Email delivery has not been configured",
  ],
  stale_revision: [
    "Версия изменена. Обновите страницу.",
    "Տարբերակը փոխվել է։ Թարմացրեք էջը։",
    "Version changed. Refresh this page.",
  ],
};
type Context = {
  lang: Language;
  setLang: (l: Language) => void;
  t: (key: string) => string;
};
const I18n = createContext<Context>(null!);
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>(() => {
    const v = localStorage.getItem("chronocampus.language");
    return v === "hy" || v === "en" ? v : "ru";
  });
  useEffect(() => {
    localStorage.setItem("chronocampus.language", lang);
    document.documentElement.lang = lang;
  }, [lang]);
  const t = (key: string) =>
    words[key]?.[["ru", "hy", "en"].indexOf(lang)] ?? key;
  return <I18n.Provider value={{ lang, setLang, t }}>{children}</I18n.Provider>;
}
export const useLanguage = () => useContext(I18n);
export function LanguageSwitch() {
  const { lang, setLang } = useLanguage();
  return (
    <select
      aria-label="Language / Язык / Լեզու"
      value={lang}
      onChange={(e) => setLang(e.target.value as Language)}
    >
      <option value="ru">Русский</option>
      <option value="hy">Հայերեն</option>
      <option value="en">English</option>
    </select>
  );
}
