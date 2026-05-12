// questions.js — Daily Schätzfragen, rotiert per Datum

const QUESTIONS = [
  { q: "Wie viele E-Mails verschickt ein Büroangestellter im Schnitt pro Tag?", answer: 40, unit: "E-Mails", hint: "Weltweit gemessener Durchschnitt" },
  { q: "Wie viele Minuten dauert eine durchschnittliche Besprechung?", answer: 31, unit: "Minuten", hint: "Laut globalen Meeting-Studien" },
  { q: "Wie viele Prozent aller Meetings werden als unproduktiv eingestuft?", answer: 71, unit: "%", hint: "Aus einer Microsoft-Studie" },
  { q: "Wie viele Stunden pro Woche verbringen Wissensarbeiter in Meetings?", answer: 23, unit: "Stunden", hint: "Durchschnitt laut HBR" },
  { q: "Wie viele Sekunden dauert es, einen ersten Eindruck zu bilden?", answer: 7, unit: "Sekunden", hint: "Psychologische Forschung" },
  { q: "Wie viele km Kabel stecken in einem modernen Auto?", answer: 5000, unit: "Meter", hint: "Mittelklassewagen" },
  { q: "Wie viele Mal öffnet ein Smartphone-Nutzer sein Handy pro Tag?", answer: 96, unit: "Mal", hint: "Durchschnitt 2023" },
  { q: "Wie viele Liter Wasser trinkt ein Mensch im Schnitt pro Tag?", answer: 2, unit: "Liter", hint: "Empfohlene Tagesmenge" },
  { q: "Wie viele Sprachen gibt es weltweit?", answer: 7000, unit: "Sprachen", hint: "Grobe Schätzung der Linguisten" },
  { q: "Wie viele Knochen hat ein erwachsener Mensch?", answer: 206, unit: "Knochen", hint: "Medizinisches Standardwissen" },
  { q: "Wie viele Stunden schläft ein Erwachsener im Schnitt pro Nacht?", answer: 7, unit: "Stunden", hint: "WHO-Empfehlung: 7–9h" },
  { q: "Wie viele Gramm Zucker enthält eine Dose Cola (330ml)?", answer: 35, unit: "Gramm", hint: "Klassische Coca-Cola" },
  { q: "Wie viele Länder gibt es auf der Welt?", answer: 195, unit: "Länder", hint: "UN-anerkannte Staaten" },
  { q: "Wie viele Minuten dauert der durchschnittliche Arbeitsweg in Deutschland?", answer: 28, unit: "Minuten", hint: "Laut Statistischem Bundesamt" },
  { q: "Wie viele Tassen Kaffee trinken Deutsche im Schnitt pro Tag?", answer: 3, unit: "Tassen", hint: "Laut Deutschem Kaffeeverband" },
  { q: "Wie viele Wörter umfasst ein typischer Roman?", answer: 90000, unit: "Wörter", hint: "Durchschnitt populärer Romane" },
  { q: "Wie viele Prozent des Internets sind im Dark Web?", answer: 96, unit: "%", hint: "Deep + Dark Web zusammen" },
  { q: "Wie viele Muskeln hat der menschliche Körper?", answer: 640, unit: "Muskeln", hint: "Skelettmuskeln" },
  { q: "Wie hoch ist der Eiffelturm in Metern?", answer: 330, unit: "Meter", hint: "Inkl. Antenne" },
  { q: "Wie viele Beine hat eine Spinne?", answer: 8, unit: "Beine", hint: "Klassische Biologie" },
  { q: "Wie viele GB Daten werden weltweit pro Sekunde übertragen?", answer: 150000, unit: "GB/s", hint: "Grobe Schätzung globaler Internettraffic" },
  { q: "Wie viele Kilometer ist die Strecke Erde–Mond?", answer: 384400, unit: "km", hint: "Durchschnittliche Entfernung" },
  { q: "Wie viele Stunden hat ein Jahr?", answer: 8760, unit: "Stunden", hint: "365 × 24" },
  { q: "Wie viele Kalorien hat ein durchschnittliches Mittagessen?", answer: 700, unit: "kcal", hint: "Westliche Ernährungsgewohnheiten" },
  { q: "Wie viele Seiten hat ein durchschnittliches Sachbuch?", answer: 280, unit: "Seiten", hint: "Populäres Non-Fiction" },
  { q: "Wie viele Prozent der Erdoberfläche sind Ozean?", answer: 71, unit: "%", hint: "Gut bekannte Zahl" },
  { q: "Wie viele Minuten pro Tag verbringen Menschen im Schnitt auf Social Media?", answer: 147, unit: "Minuten", hint: "Global Stat 2024" },
  { q: "Wie viele Kilometer Autobahn gibt es in Deutschland?", answer: 13200, unit: "km", hint: "Bundesautobahnnetz" },
  { q: "Wie viele Prozent aller Startups scheitern innerhalb von 5 Jahren?", answer: 90, unit: "%", hint: "Klassische Startup-Statistik" },
  { q: "Wie viele Stunden Videoinhalt werden pro Minute auf YouTube hochgeladen?", answer: 500, unit: "Stunden/Min", hint: "YouTube-Statistik" },
];

const Questions = {
  getToday() {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    return QUESTIONS[dayOfYear % QUESTIONS.length];
  },
  getForDate(dateStr) {
    const d = new Date(dateStr);
    const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
    return QUESTIONS[dayOfYear % QUESTIONS.length];
  }
};
