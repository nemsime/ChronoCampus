import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';

interface TermsOfServiceProps {
  open: boolean;
  onClose: () => void;
  language: 'en' | 'hy' | 'ru';
}

const termsContent = {
  en: {
    title: 'Terms of Service',
    content: `Terms of Service for ChronoCampus

Last Updated: October 7, 2025

1. Acceptance of Terms
By accessing and using ChronoCampus (the "App"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the App.

2. Description of Service
ChronoCampus provides university students, faculty, and staff with access to class schedules, timetables, and related academic information. The service is provided for educational and administrative purposes.

3. User Accounts
You must provide accurate and complete information when creating your account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. Only users with valid @polytechnic.am email addresses are permitted to register.

4. Acceptable Use
You agree to use the App only for lawful purposes and in accordance with these Terms. You must not:
- Use the App in any way that violates applicable laws or regulations
- Attempt to gain unauthorized access to the App or its related systems
- Interfere with or disrupt the App's functionality
- Share your account credentials with others

5. Intellectual Property
All content, features, and functionality of the App are owned by the university and are protected by copyright, trademark, and other intellectual property laws.

6. Data and Privacy
Your use of the App is also governed by our Privacy Policy. By using the App, you consent to the collection and use of your information as described in the Privacy Policy.

7. Modifications to Service
We reserve the right to modify, suspend, or discontinue the App at any time without prior notice. We will not be liable to you or any third party for any modification, suspension, or discontinuance of the service.

8. Limitation of Liability
The App is provided "as is" without warranties of any kind. We shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the App.

9. Academic Information Accuracy
While we strive to provide accurate and up-to-date information, class schedules and timetables are subject to change. Users should verify critical information through official university channels.

10. Termination
We may terminate or suspend your access to the App immediately, without prior notice or liability, for any reason, including breach of these Terms.

11. Contact Information
For questions about these Terms of Service, please contact your university administration.

By using ChronoCampus, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.`
  },
  hy: {
    title: 'Օգտագործման Պայմաններ',
    content: `Օգտագործման Պայմաններ ChronoCampus-ի համար

Վերջին Թարմացում՝ Հոկտեմբերի 7, 2025

1. Պայմանների Ընդունում
ChronoCampus-ը («Հավելված») մուտք գործելով և օգտագործելով, դուք համաձայնում եք պահպանել սույն Օգտագործման Պայմանները: Եթե դուք համաձայն չեք այս պայմանների հետ, խնդրում ենք չօգտագործել Հավելվածը:

2. Ծառայության Նկարագրություն
ChronoCampus-ը համալսարանի ուսանողներին, դասախոսներին և անձնակազմին տրամադրում է մուտք դասերի ժամանակացույցներ, ծրագրեր և հարակից ակադեմիական տեղեկություններ: Ծառայությունը տրամադրվում է կրթական և վարչական նպատակներով:

3. Օգտատիրոջ Հաշիվներ
Դուք պետք է տրամադրեք ճշգրիտ և ամբողջական տեղեկություններ ձեր հաշիվը ստեղծելիս: Դուք պատասխանատու եք ձեր հաշվի հավատարմագրերի գաղտնիությունը պահպանելու և ձեր հաշվի ներքո տեղի ունեցող բոլոր գործունեության համար: Միայն @polytechnic.am էլեկտրոնային հասցեով օգտվողներին թույլատրվում է գրանցվել:

4. Ընդունելի Օգտագործում
Դուք համաձայնում եք օգտագործել Հավելվածը միայն օրինական նպատակներով և սույն Պայմաններին համապատասխան: Դուք չպետք է՝
- Օգտագործեք Հավելվածը կիրառելի օրենքները կամ կանոնակարգերը խախտող եղանակով
- Փորձեք անարտոնված մուտք ստանալ Հավելված կամ դրա հետ կապված համակարգեր
- Խանգարել կամ խաթարել Հավելվածի գործառույթները
- Կիսվել ձեր հաշվի հավատարմագրերով այլոց հետ

5. Մտավոր Սեփականություն
Հավելվածի բոլոր բովանդակությունը, հնարավորությունները և գործառույթները պատկանում են համալսարանին և պաշտպանված են հեղինակային իրավունքի, առևտրային նշանի և մտավոր սեփականության այլ օրենքներով:

6. Տվյալներ և Գաղտնիություն
Հավելվածի ձեր օգտագործումը նաև կարգավորվում է մեր Գաղտնիության Քաղաքականությամբ: Հավելվածը օգտագործելով՝ դուք համաձայնում եք ձեր տեղեկատվության հավաքմանը և օգտագործմանը, ինչպե՞ս նկարագրված է Գաղտնիության Քաղաքականությունում:

7. Ծառայության Փոփոխություններ
Мենք պահպանում ենք իրավունքը՝ ցանկացած պահի փոփոխելու, կասեցնելու կամ դադարեցնելու Հավելվածը առանց նախապես ծանուցելու: Մենք պատասխանատու չենք լինի ձեր կամ ցանկացած երրորդ կողմի առջև ծառայության փոփոխման, կասեցման կամ դադարեցման համար:

8. Պատասխանատվության Սահմանափակում
Հավելվածը տրамադրվում է «ինչպե՞ս կա» առանց որևէ երաշխիքի: Մենք պատасխանատու չենք լինի ձեր կողմից Հավելվածի օգտագործումից կամ անկարողությունից օգտագործել Հավելվածը բխող անուղղակի, պատահական, հատուկ, հետևողական կամ պատժող վնասների համար:

9. Ակադեմիական Տեղեկատվության Ճշգրտություն
Թեև մենք ձգտում ենք տրամադрել ճշգրիտ և արդիական տեղեկություններ, դասերի ժամանակացույցները և ծրագրերը ենթակա են փոփոխությունների: Օգտվողները պետք է ստուգեն կարևոր տեղեկությունները համալսարանի պաշտոնական ալիքներով:

10. Լուծարում
Мենք կարող ենք անմիջապե՞ս դադարեցնել կամ կասեցնել ձեր մուտքը Հավելված՝ առանց նախապես ծանուցելու կամ պատասխանատվության, ցանկացած պատճառով, ներառյալ սույն Պայմանների խախտումը:

11. Կոնտակտային Տեղեկություններ
Օգտագործման Պայմանների վերաբերյալ հարցերի դեպքում խնդրում ենք կապվել ձեր համալսարանի վարչությանը հետ:

ChronoCampus-ը օգտագործելով՝ դուք հաստատում եք, որ կարդացել, հասկացել եք և համաձայնում եք պահպանել սույն Օգտագործման Պայմանները:`
  },
  ru: {
    title: 'Условия Использования',
    content: `Условия Использования для ChronoCampus

Последнее обновление: 7 октября 2025 г.

1. Принятие Условий
Получая доступ и используя ChronoCampus («Приложение»), вы соглашаетесь соблюдать настоящие Условия использования. Если вы не согласны с этими условиями, пожалуйста, не используйте Приложение.

2. Описание Услуги
ChronoCampus предоставляет студентам, преподавателям и сотрудникам университета доступ к расписаниям занятий, учебным планам и связанной академической информации. Услуга предоставляется в образовательных и административных целях.

3. Учетные Записи Пользователей
Вы должны предоставлять точную и полную информацию при создании учетной записи. Вы несете ответственность за сохранение конфиденциальности учетных данных вашей учетной записи и за все действия, происходящие под вашей учетной записью. Только пользователи с действующими адресами электронной почты @polytechnic.am могут зарегистрироваться.

4. Допустимое Использование
Вы соглашаетесь использовать Приложение только в законных целях и в соответствии с настоящими Условиями. Вы не должны:
- Использовать Приложение способом, нарушающим применимые законы или правила
- Пытаться получить несанкционированный доступ к Приложению или связанным с ним системам
- Вмешиваться или нарушать функциональность Приложения
- Делиться учетными данными своей учетной записи с другими

5. Интеллектуальная Собственность
Весь контент, функции и функциональность Приложения принадлежат университету и защищены законами об авторском праве, товарных знаках и другой интеллектуальной собственности.

6. Данные и Конфиденциальность
Использование вами Приложения также регулируется нашей Политикой конфиденциальности. Используя Приложение, вы соглашаетесь на сбор и использование вашей информации, как описано в Политике конфиденциальности.

7. Изменения в Услуге
Мы оставляем за собой право изменять, приостанавливать или прекращать работу Приложения в любое время без предварительного уведомления. Мы не несем ответственности перед вами или любой третьей стороной за любое изменение, приостановку или прекращение услуги.

8. Ограничение Ответственности
Приложение предоставляется «как есть» без каких-либо гарантий. Мы не несем ответственности за любые косвенные, случайные, особые, последующие или штрафные убытки, возникающие в результате использования вами или невозможности использования Приложения.

9. Точность Академической Информации
Хотя мы стремимся предоставлять точную и актуальную информацию, расписания занятий и учебные планы могут быть изменены. Пользователи должны проверять критическую информацию через официальные каналы университета.

10. Прекращение
Мы можем немедленно прекратить или приостановить ваш доступ к Приложению без предварительного уведомления или ответственности по любой причине, включая нарушение настоящих Условий.

11. Контактная Информация
По вопросам, касающимся настоящих Условий использования, обращайтесь в администрацию вашего университета.

Используя ChronoCampus, вы подтверждаете, что прочитали, поняли и соглашаетесь соблюдать настоящие Условия использования.`
  }
};

export function TermsOfService({ open, onClose, language }: TermsOfServiceProps) {
  const content = termsContent[language];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-w-[95vw] max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-200 shrink-0">
          <DialogTitle className="text-[#225b73]">{content.title}</DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            Please read the following terms and conditions carefully before using the application.
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