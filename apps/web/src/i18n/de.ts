// Texte für Teilnehmende, Leinwand und Rechtstexte auf Deutsch. Die englische Fassung (en.ts) muss
// dieselbe Form haben; fehlende Texte fallen so schon beim Typecheck auf. Die Admin-Oberfläche ist
// bewusst nicht übersetzt.

export const de = {
  common: {
    back: "Zurück",
    retry: "Erneut versuchen",
    loading: "Lade …",
    reconnecting: "Verbindung wird wiederhergestellt …",
    privacy: "Datenschutz",
    imprint: "Impressum",
  },

  /** Fehlermeldungen je Fehlercode vom Server (siehe ApiErrorBody.error) oder vom Client. */
  errors: {
    generic: "Etwas ist schiefgelaufen. Bitte erneut versuchen.",
    network: "Keine Verbindung zum Server.",
    timeout: "Der Server antwortet gerade nicht. Bitte noch einmal versuchen.",
    too_large: "Die Datei ist zu groß.",
    rate_limited: "Zu viele Anfragen. Bitte kurz warten und erneut versuchen.",
    validation: "Bitte Eingaben prüfen.",
    event_not_found: "Prüf den Link oder scanne den QR-Code noch einmal.",
    event_not_joinable: "Beitritt gerade nicht möglich. Bitte versuche es gleich noch einmal.",
    event_full: "Das Event ist voll.",
    questions_changed: "Die Fragen wurden gerade geändert. Bitte beantworte sie noch einmal.",
    participant_removed: "Die Moderation hat dich aus dem Event entfernt.",
    participant_unknown: "Deine Sitzung ist abgelaufen. Bitte neu beitreten.",
    match_changed: "Dein Match hat sich inzwischen geändert.",
    event_not_running: "Gerade läuft keine Runde.",
    code_locked: "Kurz warten, dann noch einmal versuchen.",
    not_found_too_early: "Sucht noch ein wenig weiter.",
    unsupported_media_type: "Bitte ein Foto als JPEG, PNG oder WebP senden.",
    invalid_signature: "Dieser Link ist abgelaufen.",
  },

  join: {
    eventNotFound: "Event nicht gefunden",
    failed: "Das hat nicht geklappt",
    endedTitle: "Das Event ist vorbei",
    endedText: "Danke fürs Mitmachen!",
    notOpenTitle: "Gleich geht’s los",
    notOpenText: (title: string): string =>
      `${title} ist noch nicht geöffnet. Probier es in ein paar Minuten noch einmal.`,
    reload: "Neu laden",
    welcome: "Willkommen bei",
    stepQuestionsTitle: "Drei kurze Fragen",
    stepQuestionsText: "Damit wir passende Leute für dich finden.",
    stepSelfieTitle: "Ein Selfie",
    stepSelfieText: "Daran erkennt dich dein Match im Raum.",
    stepMatchTitle: (minutes: number): string =>
      minutes === 1 ? "Jede Minute ein Match" : `Alle ${minutes} Minuten ein Match`,
    stepMatchText: "Findet euch, vergleicht eure Codes, redet.",
    noAccount: "Ohne Namen, ohne Konto, ohne App.",
    start: "Los geht’s",
    questionOf: (index: number, total: number): string => `Frage ${index} von ${total}`,
    sessionExpired: "Deine Sitzung ist abgelaufen. Du kannst neu beitreten.",
    newSelfieRequested:
      "Die Moderation bittet dich um ein neues Selfie. Achte darauf, dass dein Gesicht gut zu sehen ist.",
    leftTitle: "Du bist ausgestiegen",
    leftText: "Dein Foto und deine Antworten sind gelöscht.",
    rejoin: "Doch wieder mitmachen",
  },

  selfie: {
    title: "Zeig dich!",
    intro: "An deinem Selfie erkennt dich dein Match im Raum.",
    tips: ["Gesicht gut sichtbar", "Keine Sonnenbrille", "Gern etwas vom Outfit"],
    cameraPreview: "Kamera-Vorschau",
    yourSelfie: "Dein Selfie",
    cameraUnavailable:
      "Die Kamera lässt sich hier nicht direkt öffnen. Mach das Foto einfach mit deiner Kamera-App.",
    captureFailed: "Das Foto hat nicht geklappt. Bitte noch einmal versuchen.",
    fileUnreadable: "Dieses Bild kann ich nicht lesen. Bitte ein anderes Foto wählen.",
    consent: (hours: number): string =>
      "Ich bin einverstanden, dass mein Foto und meine Antworten für dieses Event gespeichert und " +
      "mein Foto meinen Matches sowie auf der Leinwand gezeigt wird. Das Foto wird spätestens " +
      `${hours} Stunden nach dem Event gelöscht. Ich kann jederzeit aussteigen, dann wird alles ` +
      "sofort gelöscht.",
    privacyPolicy: "Datenschutzerklärung",
    usePhoto: "Foto verwenden",
    again: "Nochmal",
    takePhoto: "Foto aufnehmen",
    pickFromGallery: "Lieber ein Foto aus der Galerie wählen",
    openCamera: "Kamera öffnen",
  },

  live: {
    leaveConfirm: "Wirklich aussteigen? Dein Foto und deine Antworten werden sofort gelöscht.",
    leaveYes: "Ja, aussteigen",
    cancel: "Abbrechen",
    changeSelfie: "Selfie ändern",
    leave: "Ich steige aus",
    inTitle: "Du bist dabei!",
    inHint: "Sobald das Event startet, bekommst du hier dein erstes Match. Lass diese Seite einfach offen.",
    firstPerson: "Du bist die erste Person. Gleich kommen weitere, dann geht es los.",
    soonTitle: "Gleich geht’s weiter",
    soonHint: (countdown: string): string =>
      `Die nächste Runde startet in ${countdown}. Dann bekommst du dein Match.`,
    researchTitle: "Neues Match wird gesucht …",
    researchHint: "Das letzte Match hat nicht geklappt. Gleich bekommst du jemand Neues.",
    searchTitle: "Wir suchen dein Match …",
    searchHint: "Das dauert höchstens eine halbe Minute. Lass diese Seite offen.",
    yourSelfie: "Dein Selfie",
    yourAnswers: "Deine Antworten",
    endedTitle: "Danke fürs Mitmachen!",
    endedText: "Das Event ist vorbei. Viel Erfolg mit deinem Startup!",
    pauseTitle: "Kurze Pause",
    pauseText: "Gleich geht es weiter. Lass diese Seite einfach offen.",
  },

  match: {
    allDifferent: "Ganz verschiedene Antworten: perfekt für neue Perspektiven.",
    bothSame: (answer: string): string => `Beide: ${answer}`,
    complements: (own: string, partner: string): string => `${own} trifft ${partner}`,
    partnerSelfie: "Selfie deines Matches",
    pickThisCode: "Diesen Code wählen",
    confirmedMe: "hat dich ✓",
    yourCode: "Dein Code",
    showYourCode: "Zeig ihn deinem Gegenüber.",
    codeConfirmed: "✓ Code bestätigt",
    waitingForOthers: "Jetzt fehlen nur noch die anderen …",
    waitingForPartner: "Jetzt muss nur noch dein Gegenüber deinen Code wählen …",
    pickMarked: "Gefunden? Wähl den Code der markierten Person:",
    pickPartner: "Gefunden? Welcher Code steht auf dem Handy deines Gegenübers?",
    typeHint: "Zeigt euch gegenseitig eure Codes und tippt den Code deines Gegenübers ein.",
    partnerCode: "Code deines Gegenübers",
    confirm: "Bestätigen",
    wrongCode: (seconds: number): string =>
      `Das war nicht der richtige Code. Noch ${seconds} s, dann nochmal.`,
    lookClosely: "Schau genau hin: Die Codes sehen sich ähnlich.",
    notFoundWait: (countdown: string): string =>
      `Noch nicht gefunden? In ${countdown} kannst du ein neues Match bekommen.`,
    newMatchConfirm: "Neues Match suchen? Dieses Match endet dann.",
    newMatchYes: "Ja, neues Match",
    keepSearching: "Weitersuchen",
    cantFindBoth: "Ich finde die beiden nicht",
    cantFindPerson: "Person nicht gefunden",
    roundInfo: (round: number, countdown: string): string => `Runde ${round} · noch ${countdown}`,
    findBoth: "Finde diese beiden!",
    findPerson: "Finde diese Person!",
    foundTitle: "Ihr habt euch gefunden!",
    foundText: (countdown: string): string => `Zeit zum Reden. Die nächste Runde startet in ${countdown}.`,
    icebreaker: "Gesprächseinstieg",
  },

  present: {
    fullscreen: "Vollbild",
    joinSoon: "Gleich öffnen wir den Beitritt.",
    howToJoin: "QR-Code scannen, drei Fragen beantworten, Selfie machen. Fertig!",
    startingSoon: "Gleich geht es los.",
    joined: (count: number): string => (count === 1 ? "Gründer*in ist dabei" : "Gründer*innen sind dabei"),
    roundPaused: (round: number): string => `Runde ${round} · Pause`,
    roundNext: (round: number): string => `Runde ${round} · nächste Runde in`,
    paused: "☕ Kurze Pause, gleich geht es weiter.",
    matchesThisRound: "Matches in dieser Runde",
    matchesTotal: "Matches insgesamt",
    active: "dabei",
    notJoinedYet: "Noch nicht dabei?",
    thanks: "Danke fürs Mitmachen! 🎉",
    matches: (count: number): string => (count === 1 ? "Match" : "Matches"),
    in: "in",
    rounds: (count: number): string => (count === 1 ? "Runde" : "Runden"),
    invalidLinkTitle: "Link ungültig",
    invalidLinkText:
      "Bitte den aktuellen Präsentationslink aus der Moderation öffnen. Er ändert sich, wenn jemand ihn neu erzeugt.",
    letsGo: "Los geht’s!",
    round: (round: number): string => `Runde ${round}`,
    newMatches: "Neue Matches! Schaut auf euer Handy 📱",
    newMatchAnnouncement: (count: number): string =>
      count === 1 ? "Neues Match!" : `${count} neue Matches!`,
    findYourMatch: "Findet euer Match und zeigt euch gegenseitig eure Codes!",
    justFound: "Gerade gefunden",
  },

  legal: {
    imprintTitle: "Impressum",
    privacyTitle: "Datenschutz",
    missing:
      "Die Angaben des Betreibers sind noch nicht hinterlegt (LEGAL_NAME, LEGAL_ADDRESS, LEGAL_EMAIL).",
    email: "E-Mail",
    phone: "Telefon",
    imprintOperator: "Angaben gemäß § 5 DDG",
    imprintResponsible: "Verantwortlich für den Inhalt",
    sameAddress: "Anschrift wie oben.",
  },
};

export type Messages = typeof de;
