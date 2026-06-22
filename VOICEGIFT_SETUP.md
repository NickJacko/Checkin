# VoiceGift Private – Setup-Anleitung

## 1. Firebase Admin-Account erstellen

Gehe in die Firebase Console → **Authentication** → **Sign-in method** → **E-Mail/Passwort aktivieren**.

Dann unter **Users** → **Add user**: Deine E-Mail + ein starkes Passwort eingeben.
Das sind deine Admin-Zugangsdaten für `voicegift.html`.

---

## 2. Firebase Storage Rules aktualisieren

Gehe in Firebase Console → **Storage** → **Rules** und ersetze den Inhalt durch:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /vg_audio/{allPaths=**} {
      // Admin (eingeloggt) kann alles lesen und schreiben
      allow read, write: if request.auth != null;
      // Gäste können Aufnahmen hochladen (max. 30 MB)
      allow create: if request.auth == null
                    && request.resource.size < 30 * 1024 * 1024;
    }
  }
}
```

---

## 3. Firebase Firestore Rules aktualisieren

Gehe in Firebase Console → **Firestore** → **Rules** und ersetze:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Projekte: Admin lesen/schreiben, Gäste öffentlich lesen (für Einladungsseite)
    match /vg_projects/{id} {
      allow read:  if true;
      allow write: if request.auth != null;
    }

    // Aufnahmen: Admin alles, Gäste nur erstellen
    match /vg_recordings/{id} {
      allow create: if true;
      allow read, update, delete: if request.auth != null;
    }

    // Teilnehmer, Exporte: nur Admin
    match /vg_participants/{id} {
      allow read, write: if request.auth != null;
    }
    match /vg_exports/{id} {
      allow read, write: if request.auth != null;
    }

    // Alle anderen bestehenden Collections (TypeMaster, Chess, Wizard)
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## 4. Firestore Composite Indexes

Für Abfragen mit `where` + `orderBy` braucht Firestore Composite Indexes.
Beim ersten Aufruf siehst du in der Browser-Konsole einen Link zum automatischen Erstellen.
Klicke einfach auf den Link – Firebase erstellt den Index in ca. 1–2 Minuten.

Benötigte Indexes:
- Collection `vg_recordings`: Felder `projectId` (ASC) + `sortOrder` (ASC)
- Collection `vg_exports`: Felder `projectId` (ASC) + `createdAt` (DESC)

---

## 5. Nutzung

### Ablauf als Admin:
1. Öffne `voicegift.html` → melde dich mit deiner E-Mail/Passwort an
2. Erstelle ein neues Projekt (Empfänger, Anlass, etc.)
3. Kopiere den Einladungslink und sende ihn per WhatsApp/Signal/E-Mail
4. Gäste öffnen den Link und nehmen ihre Nachricht auf
5. Du siehst alle Aufnahmen im Dashboard
6. Gehe zu **Studio** → sortiere, füge Intro/Outro hinzu → **WAV exportieren**
7. Erstelle die private Geschenkseite und teile sie mit dem Empfänger

### Für Gäste (kein Login nötig):
- Einladungslink öffnen → Namen eingeben → aufnehmen → absenden

### Geschenkseite:
- Wird über einen zufälligen Link erreichbar (nur wer den Link hat, kann sie öffnen)
- Enthält den Audio-Player + optionalen Download-Button

---

## 6. Technische Details

- **Aufnahmeformat**: WebM/Opus (Chrome/Firefox) oder MP4/AAC (Safari)
- **Export-Format**: WAV (44.1kHz, 16-bit, Stereo) – per Web Audio API im Browser
- **Speicher**: Firebase Storage (kostenloses Kontingent: 5 GB)
- **Datenbank**: Firestore (kostenloses Kontingent: 1 GB)
- **Max. Aufnahmelänge**: konfigurierbar, Standard 3 Minuten
- **Keine externen APIs**, keine Kosten, kein Tracking, kein Marketing

---

## 7. Self-Hosting (optional)

Die App ist eine reine Static-Web-App (HTML + JS + Firebase).
Du kannst sie auf folgenden kostenlosen Diensten hosten:

- **Firebase Hosting**: `firebase deploy` (kostenlos, schnell)
- **Netlify / Vercel**: Drag & Drop des Ordners → sofort live
- **GitHub Pages**: Repository pushen → automatisch deployed

---

## 8. Datenschutz

- Kein Tracking, keine Analytics, keine Drittanbieter außer Firebase
- Alle Projekte sind privat – nur du (Admin) hast Zugriff auf das Dashboard
- Gäste können nur aufnehmen, nicht das Dashboard sehen
- Geschenkseiten sind nur über den privaten Link erreichbar (schwer erratbar)
