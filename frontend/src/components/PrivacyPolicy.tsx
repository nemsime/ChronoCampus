import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";

interface PrivacyPolicyProps {
  open: boolean;
  onClose: () => void;
  language: "en" | "hy" | "ru";
}

const privacyContent = {
  en: {
    title: "Privacy Policy",
    content: `Privacy Policy for ChronoCampus

ChronoCampus is committed to protecting the privacy of all users of our university timetable and schedule application (App). This Privacy Policy explains how we collect, use, store, and protect your information.

When you use our App, we may collect personal information such as your name, university ID, email address, and other data you provide during registration or use of the App. Additionally, the App may collect schedule-related information, including course selections, class schedules, exam dates, and other timetable details, as well as usage data such as login times, features accessed, and error reports.

The information we collect is used solely to provide, maintain, and improve the App, generate personalized timetables and notifications, communicate important updates, analyze usage patterns, and ensure security and proper functioning. We do not sell or rent your personal information to third parties. However, we may share information with university administrators for academic management purposes, with trusted service providers who assist in operating the App under strict confidentiality, or when required by law to protect our rights, safety, or property.

All personal and schedule data are stored securely on your device and/or our servers. We employ reasonable technical and organizational measures to protect your information from unauthorized access, alteration, disclosure, or destruction. Users are encouraged to maintain strong passwords and secure their devices, as no method of electronic storage can guarantee absolute security.

You have control over your information and can update, correct, or delete your personal data within the App at any time. You may also adjust settings to manage notifications or other features that involve personal data, though this may affect certain App functionalities. The App does not use cookies in the traditional web sense, but may store local configuration or usage data to improve performance and user experience.

This App is intended for use by university students, faculty, and staff.`,
  },
  hy: {
    title: "Գաղտնիության Քաղաքականություն",
    content: `Գաղտնիության Քաղաքականություն ChronoCampus-ի համար

ChronoCampus-ը պարտավորվում է պաշտպանել մեր համալսարանական ժամանակացույցի և ծրագրի հավելվածի (Հավելված) բոլոր օգտատերերի գաղտնիությունը: Այս Գաղտնիության Քաղաքականությունը բացատրում է, թե ինչպե՞ս ենք մենք հավաքում, օգտագործում, պահպանում և պաշտպանում ձեր տեղեկատվությունը:

Երբ դուք օգտագործում եք մեր Հավելվածը, մենք կարող ենք հավաքել անձնական տեղեկություններ, ինչպիսիք են ձեր անունը, համալսարանի ID-ն, էլեկտրոնային հասցեն և այլ տվյալներ, որոնք դուք տրամադրում եք գրանցման կամ Հավելվածի օգտագործման ժամանակ: Բացի այդ, Հավելվածը կարող է հավաքել ժամանակացույցին առնչվող տեղեկություններ, ներառյալ դասընթացների ընտրությունները, դասերի ժամանակացույցը, քննությունների ամսաթվերը և ժամանակացույցի այլ մանրամասներ, ինչպե՞ս նաև օգտագործման տվյալներ, ինչպիսիք են մուտքի ժամանակները, մատչված հնարավորությունները և սխալների հաշվետվությունները:

Մեր կողմից հավաքված տեղեկատվությունը օգտագործվում է միայն Հավելվածը տրամադրելու, պահպանելու և բարելավելու, անհատականացված ժամանակացույցներ և ծանուցումներ ստեղծելու, կարևոր թարմացումները հաղորդելու, օգտագործման օրինաչափությունները վերլուծելու և անվտանգությունը և պատշաճ աշխատանքը ապահովելու համար: Մենք չենք վաճառում կամ վարձակալում ձեր անձնական տեղեկությունները երրորդ կողմերին: Այնուամենայնիվ, մենք կարող ենք կիսվել տեղեկատվությամբ համալսարանի ադմինիստրատորների հետ ակադեմիական կառավարման նպատակներով, վստահելի ծառայություններ մատուցողների հետ, ովքեր օգնում են Հավելվածի շահագործման հարցում խիստ գաղտնիության պայմաններով, կամ երբ պահանջվում է օրենքով՝ մեր իրավունքները, անվտանգությունը կամ գույքը պաշտպանելու համար:

Բոլոր անձնական և ժամանակացույցային տվյալները անվտանգ պահվում են ձեր սարքում /կամ մեր սերվերներում: Մենք կիրառում ենք ողջամիտ տեխնիկական և կազմակերպչական միջոցներ՝ ձեր տեղեկատվությունը չթույլատրված մուտքից, փոփոխությունից, բացահայտումից կամ ոչնչացումից պաշտպանելու համար: Օգտվողներին խրախուսվում է պահպանել ուժեղ գաղտնաբառեր և պաշտպանել իրենց սարքերը, քանի որ էլեկտրոնային պահպանման ոչ մի եղանակ չի կարող երաշխավորել բացարձակ անվտանգություն:

Դուք վերահսկում եք ձեր տեղեկատվությունը և կարող եք ցանկացած պահի թարմացնել, ուղղել կամ ջնջել ձեր անձնական տվյալները Հավելվածի մեջ: Դուք կարող եք նաև կարգավորել կարգավորումները՝ կառավարելու ծանուցումները կամ անձնական տվյալներ ներառող այլ հնարավորություններ, թեև սա կարող է ազդել որոշակի Հավելվածի գործառույթների վրա: Հավելվածը չի օգտագործում cookie-ներ ավանդական վեբ իմաստով, բայց կարող է պահել տեղական կազմաձևումը կամ օգտագործման տվյալները՝ արտադրողականությունը և օգտատիրական փորձը բարելավելու համար:

Այս հավելվածը նախատեսված է համալսարանի ուսանողների, դասախոսների և անձնակազմի կողմից օգтագործման համար:`,
  },
  ru: {
    title: "Политика Конфиденциальности",
    content: `Политика Конфиденциальности для ChronoCampus

ChronoCampus обязуется защищать конфиденциальность всех пользователей нашего университетского приложения расписания и графиков (Приложение). Настоящая Политика конфиденциальности объясняет, как мы собираем, используем, храним и защищаем вашу информацию.

Когда вы используете наше Приложение, мы можем собирать личную информацию, такую как ваше имя, университетский ID, адрес электронной почты и другие данные, которые вы предоставляете при регистрации или использовании Приложения. Кроме того, Приложение может собирать информацию, связанную с расписанием, включая выбор курсов, расписания занятий, даты экзаменов и другие детали расписания, а также данные об использовании, такие как время входа в систему, используемые функции и отчеты об ошибках.

Информация, которую мы собираем, используется исключительно для предоставления, поддержки и улучшения Приложения, создания персонализированных расписаний и уведомлений, сообщения важных обновлений, анализа моделей использования и обеспечения безопасности и надлежащего функционирования. Мы не продаем и не сдаем в аренду вашу личную информацию третьим лицам. Однако мы можем делиться информацией с администраторами университета для целей академического управления, с доверенными поставщиками услуг, которые помогают в работе Приложения в условиях строгой конфиденциальности, или когда это требуется по закону для защиты наших прав, безопасности или собственности.

Все личные данные и данные расписания надежно хранятся на вашем устройстве и/или наших серверах. Мы применяем разумные технические и организационные меры для защиты вашей информации от несанкционированного доступа, изменения, раскрытия или уничтожения. Пользователям рекомендуется использовать надежные пароли и защищать свои устройства, поскольку ни один метод электронного хранения не может гарантировать абсолютную безопасность.

Вы контролируете свою информацию и можете в любое время обновлять, исправлять или удалять свои личные данные в Приложении. Вы также можете настроить параметры для управления уведомлениями или другими функциями, связанными с личными данными, хотя это может повлиять на определенные функции Приложения. Приложение не использует файлы cookie в традиционном веб-смысле, но может хранить локальные данные конфигурации или использования для повышения производительности и удобства пользователей.

Это Приложение предназначено для использования студентами, преподавателями и сотрудниками университета.`,
  },
};

export function PrivacyPolicy({
  open,
  onClose,
  language,
}: PrivacyPolicyProps) {
  const content = privacyContent[language];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-w-[95vw] max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-200 shrink-0">
          <DialogTitle className="text-[#225b73]">
            {content.title}
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            Please read the following privacy policy carefully.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 overflow-auto">
          <div className="px-6 py-4">
            <div className="space-y-4 text-sm text-gray-700 whitespace-pre-line break-words">
              {content.content}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}