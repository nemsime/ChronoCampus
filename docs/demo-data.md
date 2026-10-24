# Demonstration data provenance

Nine legacy Word documents were read through Microsoft Word, read-only with macros disabled. No academic-year range establishing current validity was found. They inform structure, not a confirmed current timetable or authoritative curriculum.

| Source | Tables read | Use |
| --- | ---: | --- |
| `B1kurs1-1.doc` | 29 | Full-time lesson/subgroup layout |
| `B2kurs1-1.doc` | 29 | Full-time lesson/subgroup layout |
| `B3kurs1-1.doc` | 32 | Full-time lesson/subgroup layout |
| `B3kurs1.doc` | 30 | Full-time lesson/subgroup layout |
| `B4kurs1.doc` | 30 | Full-time lesson/subgroup layout |
| `heraka-1-kurs.doc` | 8 | Part-time session layout |
| `heraka-2-kurs.doc` | 11 | Part-time session layout |
| `heraka-3kurs.doc` | 9 | Part-time session layout |
| `heraka-4-kurs.doc` | 16 | Part-time session layout |

Observed: weekday columns, blocks 1–2 / 3–4 / 5–6 / 7–8 and additional 9–10 for part-time; lecture/laboratory/practical markers (`Դաս`, `Լաբ`, `Գործ`); nested subgroup splits. Mapping `Գործ` to practical is a demo assumption pending confirmation. Documents were inspected for data, not visually certified or automatically imported.

The seed reuses FIA/FCS faculties and adds DEMO majors/cohorts: four full-time and one five-year part-time cohort, nominal capacity 40 each, two subgroups of 20, four lab groups of 10. Twelve fictional lecturers, twelve rooms, and five student accounts form a working example. No Word-listed individual was imported as a demo user.

Subjects include mathematical analysis, OOP, physics, computer architecture, QA, and business. Hours and room allocations are illustrative, informed by the document structure and user examples rather than official curriculum totals. Lighter part-time load is a demonstration; actual session dates remain unconfirmed.

Demo autumn terms: 1 September 2026–29 January 2027; teaching: 1 September–18 December (16 calendar weeks). This does not assert that the university always ends classes on 18 December. Exact dates are administrator settings. A 21 September holiday demonstrates separate cancelled-hour accounting.

The idempotent seed is restricted to `ChronoCampus_Development`. Random passwords are stored only in ignored `backend/.demo-credentials.json`. Existing user records and the original database are preserved.
