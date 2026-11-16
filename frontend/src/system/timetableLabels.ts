/** Display-only abbreviations; catalog names remain unchanged. */
const subjects: Record<string, string> = {
  "software engineering": "Soft. Eng.",
  "software quality assurance": "QA",
  "quality assurance": "QA",
  "object-oriented programming": "OOP",
  "object oriented programming": "OOP",
  "computer architecture": "Comp. Arch.",
  "mathematical analysis": "Math. An.",
  "business fundamentals": "Bus. Fund.",
  "physics": "Phys.",
  "mathematics": "Math.",
  "english language": "Engl.",
  "программная инженерия": "Прог. инж.",
  "математический анализ": "Мат. ан.",
  "объектно-ориентированное программирование": "ООП",
  "архитектура компьютера": "Арх. комп.",
  "физика": "Физ.",
  "ծրագրային ճարտարագիտություն": "Ծրագր. ճարտ.",
  "մաթեմատիկական անալիզ": "Մաթ. ան.",
  "ֆիզիկա": "Ֆիզ.",
};
export function shortSubject(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  const key = name.toLowerCase();
  const known = Object.prototype.hasOwnProperty.call(subjects, key) ? subjects[key] : undefined;
  if (known) return known;
  if (name.length <= 12) return name;
  return name.split(" ").filter(word => !/^(and|of|the|for)$/i.test(word))
    .map(word => Array.from(word).length > 5 ? Array.from(word).slice(0, 4).join("") + "." : word).join(" ");
}
export function shortLecturer(value: string): string {
  const names = value.trim().split(/\s+/).filter(Boolean);
  if (names.length < 2) return value.trim();
  return names.slice(0, -1).map(name => /^\p{L}\.$/u.test(name) ? name : Array.from(name)[0] + ".").join(" ") + " " + names.at(-1);
}
