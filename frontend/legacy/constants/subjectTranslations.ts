import { Language } from '../types';

export const subjectTranslations: Record<string, Record<Language, string>> = {
  'Computer Science Fundamentals': {
    en: 'Computer Science Fundamentals',
    hy: 'Ինֆորմատիկայի Հիմունքներ',
    ru: 'Основы Информатики'
  },
  'Mathematics for Computing': {
    en: 'Mathematics for Computing',
    hy: 'Մաթեմատիկա Համակարգչային Գիտությունների Համար',
    ru: 'Математика для Компьютерных Наук'
  },
  'Database Systems': {
    en: 'Database Systems',
    hy: 'Տվյալների Բազաների Համակարգեր',
    ru: 'Системы Баз Данных'
  },
  'Web Development': {
    en: 'Web Development',
    hy: 'Վեբ Մշակում',
    ru: 'Веб-Разработка'
  },
  'Software Engineering': {
    en: 'Software Engineering',
    hy: 'Ծրագրային Ճարտարագիտություն',
    ru: 'Программная Инженерия'
  },
  'Data Structures & Algorithms': {
    en: 'Data Structures & Algorithms',
    hy: 'Տվյալների Կառուցվածքներ և Ալգորիթմներ',
    ru: 'Структуры Данных и Алгоритмы'
  },
  'Operating Systems': {
    en: 'Operating Systems',
    hy: 'Օպերացիոն Համակարգեր',
    ru: 'Операционные Системы'
  },
  'Network Security': {
    en: 'Network Security',
    hy: 'Ցանցային Անվտանգություն',
    ru: 'Сетевая Безопасность'
  },
  'Artificial Intelligence': {
    en: 'Artificial Intelligence',
    hy: 'Արհեստական Բանականություն',
    ru: 'Искусственный Интеллект'
  },
  'Mobile App Development': {
    en: 'Mobile App Development',
    hy: 'Բջջային Հավելվածների Մշակում',
    ru: 'Разработка Мобильных Приложений'
  },
  'Advanced Algorithms': {
    en: 'Advanced Algorithms',
    hy: 'Առաջադեմ Ալգորիթմներ',
    ru: 'Продвинутые Алгоритмы'
  },
  'Cloud Computing': {
    en: 'Cloud Computing',
    hy: 'Ամպային Հաշվարկներ',
    ru: 'Облачные Вычисления'
  },
  'Cybersecurity Fundamentals': {
    en: 'Cybersecurity Fundamentals',
    hy: 'Կիբերանվտանգության Հիմունքներ',
    ru: 'Основы Кибербезопасности'
  },
  'Machine Learning': {
    en: 'Machine Learning',
    hy: 'Մեքենայական Ուսուցում',
    ru: 'Машинное Обучение'
  },
  'Blockchain Technology': {
    en: 'Blockchain Technology',
    hy: 'Բլոկչեյն Տեխնոլոգիա',
    ru: 'Технология Блокчейн'
  }
};

export const lecturerTranslations: Record<string, Record<Language, string>> = {
  'Prof. Sarah Johnson': {
    en: 'Prof. Sarah Johnson',
    hy: 'Պրոֆ. Սարա Ջոնսոն',
    ru: 'Проф. Сара Джонсон'
  },
  'Prof. Michael Chen': {
    en: 'Prof. Michael Chen',
    hy: 'Պրոֆ. Մայքլ Չեն',
    ru: 'Проф. Майкл Чен'
  },
  'Prof. Emily Watson': {
    en: 'Prof. Emily Watson',
    hy: 'Պրոֆ. Էմիլի Ուոթսոն',
    ru: 'Проф. Эмили Уотсон'
  },
  'Prof. James Martinez': {
    en: 'Prof. James Martinez',
    hy: 'Պրոֆ. Ջեյմս Մարտինես',
    ru: 'Проф. Джеймс Мартинес'
  },
  'Prof. Linda Brown': {
    en: 'Prof. Linda Brown',
    hy: 'Պրոֆ. Լինդա Բրաուն',
    ru: 'Проф. Линда Браун'
  },
  'Prof. Robert Lee': {
    en: 'Prof. Robert Lee',
    hy: 'Պրոֆ. Ռոբերտ Լի',
    ru: 'Проф. Роберт Ли'
  }
};

export function getSubjectTranslation(subjectName: string, language: Language): string {
  return subjectTranslations[subjectName]?.[language] || subjectName;
}

export function getLecturerTranslation(lecturerName: string, language: Language): string {
  return lecturerTranslations[lecturerName]?.[language] || lecturerName;
}
