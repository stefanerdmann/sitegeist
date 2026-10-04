import { setTranslations } from "@mariozechner/mini-lit";
import { translations as webUiTranslations } from "@mariozechner/pi-web-ui";

declare module "@mariozechner/mini-lit" {
	interface i18nMessages {
		// Web-UI base keys (needed for type safety)
		"Delete this session?": string;
		Today: string;
		Yesterday: string;
		"{days} days ago": string;
		Sessions: string;
		"Load a previous conversation": string;
		"No sessions yet": string;
		messages: string;
		Delete: string;
		"Loading...": string;

		// Sitegeist extension keys
		Folder: string;
		"Working folder": string;
		"Read-only": string;
		"Read and write": string;
		"Use read-only access": string;
		"Save file": string;
		"Replace existing file": string;
		"Bytes to save": string;
		"Existing file size": string;
		"Source artifact": string;
		"New content (preview)": string;
		"Binary file: review the source artifact before saving.": string;
		"This saves only the shown file. Any existing contents at this path will be replaced. Saved changes cannot be undone by Sitegeist.": string;
		"Writing is enabled. Every save requires a separate confirmation for the exact file and content.": string;
		"Write access needs confirmation. Click Read and write to renew it.": string;
		"Read-only mode blocks Sitegeist writes even if Chrome remembers write permission. It does not undo changes already saved.": string;
		"Choose folder": string;
		"Change folder": string;
		"Grant read access": string;
		"Disconnect folder": string;
		"No working folder selected": string;
		"Choose a local folder that Sitegeist can list and read. Access starts read-only; writing requires a separate opt-in. Files cannot be deleted.": string;
		"Selecting a folder does not upload its contents. Only files read for your request are included in the chat and sent to the selected AI provider.": string;
		"The selected folder is shared across chats and windows. Chrome may ask you to grant read access again after restarting.": string;
		"Read access is ready. Ask Sitegeist to list files or read a file in this folder.": string;
		"Read access needs confirmation. Click Grant read access or choose the folder again.": string;
		"Folder access is unavailable in this browser. Use chat attachments instead.": string;
		"Disconnecting stops future folder access. Previously read content remains in the conversation; delete the session to remove its local copy.": string;
		"Supports text/code, PDF, Word, Excel, PowerPoint and common images, up to 20 MB per file. Generated artifacts can be saved to the folder only with write access and confirmation.": string;
		"Permission request failed": string;
		"JavaScript Execution Permission Required": string;
		"This extension needs permission to execute JavaScript code on web pages": string;
		"The JavaScript REPL tool allows the AI to read and interact with web pages on your behalf. This requires the userScripts permission to execute code safely and securely.": string;
		"The AI can read and modify web page content when you ask it to": string;
		"Code runs in an isolated environment with security safeguards": string;
		"Network access is blocked to prevent data exfiltration": string;
		"You can revoke this permission at any time in browser settings": string;
		"Writing JavaScript code...": string;
		"Execute JavaScript": string;
		"Preparing JavaScript...": string;
		"Getting skill": string;
		"Got skill": string;
		"Listing skills": string;
		"Creating skill": string;
		"Created skill": string;
		"Updating skill": string;
		"Updated skill": string;
		"Rewriting skill": string;
		"Rewritten skill": string;
		"Deleting skill": string;
		"Processing skill...": string;
		"No skills found": string;
		"Skills for domain": string;
		"Deleted skill": string;
		Examples: string;
		Library: string;
		"Command failed:": string;
		"Why is this needed?": string;
		"What this means:": string;
		"Continue Anyway": string;
		"Requesting...": string;
		"Grant Permission": string;
		"Navigating to": string;
		"Click to open": string;
		"Waiting...": string;
		Current: string;
		Locked: string;
		"Export failed. Check console for details.": string;
		"Invalid import file format": string;
		"Found {count} duplicate sessions. Click OK to overwrite, Cancel to skip duplicates.": string;
		"Imported {imported} sessions, skipped {skipped} duplicates": string;
		"Imported {count} sessions": string;
		"Import failed. Check console for details.": string;
		Import: string;
		"Export All": string;
		Export: string;
		"No sessions older than {days} days": string;
		"Delete {count} sessions older than {days} days?": string;
		"Failed to delete sessions. Check console for details.": string;
		"Delete Old": string;
		"All sessions": string;
		"No sessions to delete": string;
		"Delete ALL {count} sessions? This cannot be undone!": string;
		"Older than 7 days": string;
		"Older than 30 days": string;
		"Older than 90 days": string;
		"Search sessions...": string;
		"Total: {count} sessions · {messages} messages · ${cost}": string;
		"Open tabs": string;
		"Waiting for selection": string;
		"Preparing element selector...": string;
		About: string;
		"AI-powered browser extension for web navigation and interaction": string;
		"Version:": string;
		Website: string;
		Imprint: string;
		Privacy: string;
		"Checking for updates...": string;
		"Update Available": string;
		"A new version ({version}) is available": string;
		Update: string;
		"You're up to date": string;
		"Update Required": string;
		"A new version ({version}) is available. Please update to continue.": string;
		"Update Now": string;
	}
}

const sitegeistTranslations = {
	en: {
		Folder: "Folder",
		"Working folder": "Working folder",
		"Read-only": "Read-only",
		"Read and write": "Read and write",
		"Use read-only access": "Use read-only access",
		"Save file": "Save file",
		"Replace existing file": "Replace existing file",
		"Bytes to save": "Bytes to save",
		"Existing file size": "Existing file size",
		"Source artifact": "Source artifact",
		"New content (preview)": "New content (preview)",
		"Binary file: review the source artifact before saving.":
			"Binary file: review the source artifact before saving.",
		"This saves only the shown file. Any existing contents at this path will be replaced. Saved changes cannot be undone by Sitegeist.":
			"This saves only the shown file. Any existing contents at this path will be replaced. Saved changes cannot be undone by Sitegeist.",
		"Writing is enabled. Every save requires a separate confirmation for the exact file and content.":
			"Writing is enabled. Every save requires a separate confirmation for the exact file and content.",
		"Write access needs confirmation. Click Read and write to renew it.":
			"Write access needs confirmation. Click Read and write to renew it.",
		"Read-only mode blocks Sitegeist writes even if Chrome remembers write permission. It does not undo changes already saved.":
			"Read-only mode blocks Sitegeist writes even if Chrome remembers write permission. It does not undo changes already saved.",
		"Choose folder": "Choose folder",
		"Change folder": "Change folder",
		"Grant read access": "Grant read access",
		"Disconnect folder": "Disconnect folder",
		"No working folder selected": "No working folder selected",
		"Choose a local folder that Sitegeist can list and read. Access starts read-only; writing requires a separate opt-in. Files cannot be deleted.":
			"Choose a local folder that Sitegeist can list and read. Access starts read-only; writing requires a separate opt-in. Files cannot be deleted.",
		"Selecting a folder does not upload its contents. Only files read for your request are included in the chat and sent to the selected AI provider.":
			"Selecting a folder does not upload its contents. Only files read for your request are included in the chat and sent to the selected AI provider.",
		"The selected folder is shared across chats and windows. Chrome may ask you to grant read access again after restarting.":
			"The selected folder is shared across chats and windows. Chrome may ask you to grant read access again after restarting.",
		"Read access is ready. Ask Sitegeist to list files or read a file in this folder.":
			"Read access is ready. Ask Sitegeist to list files or read a file in this folder.",
		"Read access needs confirmation. Click Grant read access or choose the folder again.":
			"Read access needs confirmation. Click Grant read access or choose the folder again.",
		"Folder access is unavailable in this browser. Use chat attachments instead.":
			"Folder access is unavailable in this browser. Use chat attachments instead.",
		"Disconnecting stops future folder access. Previously read content remains in the conversation; delete the session to remove its local copy.":
			"Disconnecting stops future folder access. Previously read content remains in the conversation; delete the session to remove its local copy.",
		"Supports text/code, PDF, Word, Excel, PowerPoint and common images, up to 20 MB per file. Generated artifacts can be saved to the folder only with write access and confirmation.":
			"Supports text/code, PDF, Word, Excel, PowerPoint and common images, up to 20 MB per file. Generated artifacts can be saved to the folder only with write access and confirmation.",
		"Permission request failed": "Permission request failed",
		"JavaScript Execution Permission Required": "JavaScript Execution Permission Required",
		"This extension needs permission to execute JavaScript code on web pages":
			"This extension needs permission to execute JavaScript code on web pages",
		"The JavaScript REPL tool allows the AI to read and interact with web pages on your behalf. This requires the userScripts permission to execute code safely and securely.":
			"The JavaScript REPL tool allows the AI to read and interact with web pages on your behalf. This requires the userScripts permission to execute code safely and securely.",
		"The AI can read and modify web page content when you ask it to":
			"The AI can read and modify web page content when you ask it to",
		"Code runs in an isolated environment with security safeguards":
			"Code runs in an isolated environment with security safeguards",
		"Network access is blocked to prevent data exfiltration":
			"Network access is blocked to prevent data exfiltration",
		"You can revoke this permission at any time in browser settings":
			"You can revoke this permission at any time in browser settings",
		"Writing JavaScript code...": "Writing JavaScript code...",
		"Execute JavaScript": "Execute JavaScript",
		"Preparing JavaScript...": "Preparing JavaScript...",
		"Getting skill": "Getting skill",
		"Got skill": "Got skill",
		"Listing skills": "Listing skills",
		"Creating skill": "Creating skill",
		"Created skill": "Created skill",
		"Updating skill": "Updating skill",
		"Updated skill": "Updated skill",
		"Rewriting skill": "Rewriting skill",
		"Rewritten skill": "Patched skill",
		"Deleting skill": "Deleting skill",
		"Processing skill...": "Processing skill...",
		"No skills found": "No skills found",
		"Skills for domain": "Skills for domain",
		"Deleted skill": "Deleted skill",
		Examples: "Examples",
		Library: "Library",
		"Command failed:": "Command failed:",
		"Why is this needed?": "Why is this needed?",
		"What this means:": "What this means:",
		"Continue Anyway": "Continue Anyway",
		"Requesting...": "Requesting...",
		"Grant Permission": "Grant Permission",
		"Navigating to": "Navigating to",
		"Click to open": "Click to open",
		"Waiting...": "Waiting...",
		Current: "Current",
		Locked: "Locked",
		"Export failed. Check console for details.": "Export failed. Check console for details.",
		"Invalid import file format": "Invalid import file format",
		"Found {count} duplicate sessions. Click OK to overwrite, Cancel to skip duplicates.":
			"Found {count} duplicate sessions. Click OK to overwrite, Cancel to skip duplicates.",
		"Imported {imported} sessions, skipped {skipped} duplicates":
			"Imported {imported} sessions, skipped {skipped} duplicates",
		"Imported {count} sessions": "Imported {count} sessions",
		"Import failed. Check console for details.": "Import failed. Check console for details.",
		Import: "Import",
		"Export All": "Export All",
		Export: "Export",
		"No sessions older than {days} days": "No sessions older than {days} days",
		"Delete {count} sessions older than {days} days?": "Delete {count} sessions older than {days} days?",
		"Failed to delete sessions. Check console for details.": "Failed to delete sessions. Check console for details.",
		"Delete Old": "Delete",
		"All sessions": "All sessions",
		"No sessions to delete": "No sessions to delete",
		"Delete ALL {count} sessions? This cannot be undone!": "Delete ALL {count} sessions? This cannot be undone!",
		"Older than 7 days": "Older than 7 days",
		"Older than 30 days": "Older than 30 days",
		"Older than 90 days": "Older than 90 days",
		"Search sessions...": "Search sessions...",
		"Total: {count} sessions · {messages} messages · ${cost}":
			"Total: {count} sessions · {messages} messages · ${cost}",
		"Open tabs": "Open tabs",
		"Waiting for selection": "Waiting for selection",
		"Preparing element selector...": "Preparing element selector...",
		About: "About",
		"AI-powered browser extension for web navigation and interaction":
			"AI-powered browser extension for web navigation and interaction",
		"Version:": "Version:",
		Website: "Website",
		Imprint: "Imprint",
		Privacy: "Privacy",
		"Checking for updates...": "Checking for updates...",
		"Update Available": "Update Available",
		"A new version ({version}) is available": "A new version ({version}) is available",
		Update: "Update",
		"You're up to date": "You're up to date",
		"Update Required": "Update Required",
		"A new version ({version}) is available. Please update to continue.":
			"A new version ({version}) is available. Please update to continue.",
		"Update Now": "Update Now",
	},
	de: {
		Folder: "Ordner",
		"Working folder": "Arbeitsordner",
		"Read-only": "Nur lesen",
		"Read and write": "Lesen und Schreiben",
		"Use read-only access": "Auf Nur lesen zurückstellen",
		"Save file": "Datei speichern",
		"Replace existing file": "Vorhandene Datei ersetzen",
		"Bytes to save": "Zu speichernde Bytes",
		"Existing file size": "Bisherige Dateigröße",
		"Source artifact": "Quellartefakt",
		"New content (preview)": "Neuer Inhalt (Vorschau)",
		"Binary file: review the source artifact before saving.":
			"Binärdatei: Prüfen Sie das Quellartefakt vor dem Speichern.",
		"This saves only the shown file. Any existing contents at this path will be replaced. Saved changes cannot be undone by Sitegeist.":
			"Es wird nur die angezeigte Datei gespeichert. Vorhandene Inhalte an diesem Pfad werden ersetzt. Sitegeist kann gespeicherte Änderungen nicht rückgängig machen.",
		"Writing is enabled. Every save requires a separate confirmation for the exact file and content.":
			"Schreiben ist aktiviert. Jeder Speichervorgang verlangt eine gesonderte Bestätigung für die konkrete Datei und den Inhalt.",
		"Write access needs confirmation. Click Read and write to renew it.":
			"Der Schreibzugriff muss bestätigt werden. Klicken Sie dazu auf Lesen und Schreiben.",
		"Read-only mode blocks Sitegeist writes even if Chrome remembers write permission. It does not undo changes already saved.":
			"Nur lesen blockiert Sitegeist-Schreibzugriffe, auch wenn Chrome eine Schreibberechtigung gespeichert hat. Bereits gespeicherte Änderungen bleiben bestehen.",
		"Choose folder": "Ordner auswählen",
		"Change folder": "Ordner wechseln",
		"Grant read access": "Lesezugriff erlauben",
		"Disconnect folder": "Ordner trennen",
		"No working folder selected": "Kein Arbeitsordner ausgewählt",
		"Choose a local folder that Sitegeist can list and read. Access starts read-only; writing requires a separate opt-in. Files cannot be deleted.":
			"Wählen Sie einen lokalen Ordner zum Auflisten und Lesen. Der Zugriff beginnt schreibgeschützt; Schreiben muss separat freigegeben werden. Dateien können nicht gelöscht werden.",
		"Selecting a folder does not upload its contents. Only files read for your request are included in the chat and sent to the selected AI provider.":
			"Die Ordnerauswahl lädt keine Inhalte hoch. Nur für Ihre Anfrage gelesene Dateien werden Teil des Chats und an den ausgewählten KI-Anbieter gesendet.",
		"The selected folder is shared across chats and windows. Chrome may ask you to grant read access again after restarting.":
			"Der ausgewählte Ordner gilt für alle Chats und Fenster. Nach einem Neustart kann Chrome erneut eine Bestätigung des Lesezugriffs verlangen.",
		"Read access is ready. Ask Sitegeist to list files or read a file in this folder.":
			"Der Lesezugriff ist bereit. Bitten Sie Sitegeist, Dateien aufzulisten oder eine Datei in diesem Ordner zu lesen.",
		"Read access needs confirmation. Click Grant read access or choose the folder again.":
			"Der Lesezugriff muss bestätigt werden. Klicken Sie auf Lesezugriff erlauben oder wählen Sie den Ordner erneut aus.",
		"Folder access is unavailable in this browser. Use chat attachments instead.":
			"Ordnerzugriff ist in diesem Browser nicht verfügbar. Nutzen Sie stattdessen Dateianhänge im Chat.",
		"Disconnecting stops future folder access. Previously read content remains in the conversation; delete the session to remove its local copy.":
			"Das Trennen beendet künftige Ordnerzugriffe. Bereits gelesene Inhalte bleiben im Chat; löschen Sie die Sitzung, um deren lokale Kopie zu entfernen.",
		"Supports text/code, PDF, Word, Excel, PowerPoint and common images, up to 20 MB per file. Generated artifacts can be saved to the folder only with write access and confirmation.":
			"Unterstützt Text/Code, PDF, Word, Excel, PowerPoint und gängige Bilder bis 20 MB pro Datei. Erzeugte Artefakte können nur mit Schreibzugriff und Bestätigung im Ordner gespeichert werden.",
		"Permission request failed": "Berechtigungsanfrage fehlgeschlagen",
		"JavaScript Execution Permission Required": "JavaScript-Ausführungsberechtigung erforderlich",
		"This extension needs permission to execute JavaScript code on web pages":
			"Diese Erweiterung benötigt die Berechtigung, JavaScript-Code auf Webseiten auszuführen",
		"The JavaScript REPL tool allows the AI to read and interact with web pages on your behalf. This requires the userScripts permission to execute code safely and securely.":
			"Das JavaScript-REPL-Tool ermöglicht es der KI, Webseiten in Ihrem Auftrag zu lesen und damit zu interagieren. Dies erfordert die userScripts-Berechtigung, um Code sicher auszuführen.",
		"The AI can read and modify web page content when you ask it to":
			"Die KI kann Webseiteninhalte lesen und ändern, wenn Sie es verlangen",
		"Code runs in an isolated environment with security safeguards":
			"Code wird in einer isolierten Umgebung mit Sicherheitsvorkehrungen ausgeführt",
		"Network access is blocked to prevent data exfiltration":
			"Netzwerkzugriff ist blockiert, um Datenexfiltration zu verhindern",
		"You can revoke this permission at any time in browser settings":
			"Sie können diese Berechtigung jederzeit in den Browsereinstellungen widerrufen",
		"Writing JavaScript code...": "Schreibe JavaScript-Code...",
		"Execute JavaScript": "Führe JavaScript aus",
		"Preparing JavaScript...": "Bereite JavaScript vor...",
		"Getting skill": "Hole Skill",
		"Got skill": "Skill erhalten",
		"Listing skills": "Liste Skills auf",
		"Creating skill": "Erstelle Skill",
		"Created skill": "Skill erstellt",
		"Updating skill": "Aktualisiere Skill",
		"Updated skill": "Skill aktualisiert",
		"Rewriting skill": "Patche Skill",
		"Rewritten skill": "Skill gepatcht",
		"Deleting skill": "Lösche Skill",
		"Processing skill...": "Verarbeite Skill...",
		"No skills found": "Keine Skills gefunden",
		"Skills for domain": "Skills für Domain",
		"Deleted skill": "Skill gelöscht",
		Examples: "Beispiele",
		Library: "Bibliothek",
		"Command failed:": "Befehl fehlgeschlagen:",
		"Why is this needed?": "Warum ist das notwendig?",
		"What this means:": "Was das bedeutet:",
		"Continue Anyway": "Trotzdem fortfahren",
		"Requesting...": "Anfrage läuft...",
		"Grant Permission": "Berechtigung erteilen",
		"Navigating to": "Navigiere zu",
		"Click to open": "Klicken zum Öffnen",
		"Waiting...": "Warte...",
		Current: "Aktuell",
		Locked: "Gesperrt",
		"Export failed. Check console for details.": "Export fehlgeschlagen. Prüfen Sie die Konsole für Details.",
		"Invalid import file format": "Ungültiges Import-Dateiformat",
		"Found {count} duplicate sessions. Click OK to overwrite, Cancel to skip duplicates.":
			"{count} doppelte Sitzungen gefunden. OK zum Überschreiben, Abbrechen zum Überspringen.",
		"Imported {imported} sessions, skipped {skipped} duplicates":
			"{imported} Sitzungen importiert, {skipped} Duplikate übersprungen",
		"Imported {count} sessions": "{count} Sitzungen importiert",
		"Import failed. Check console for details.": "Import fehlgeschlagen. Prüfen Sie die Konsole für Details.",
		Import: "Importieren",
		"Export All": "Alle exportieren",
		Export: "Exportieren",
		"No sessions older than {days} days": "Keine Sitzungen älter als {days} Tage",
		"Delete {count} sessions older than {days} days?": "{count} Sitzungen älter als {days} Tage löschen?",
		"Failed to delete sessions. Check console for details.":
			"Löschen fehlgeschlagen. Prüfen Sie die Konsole für Details.",
		"Delete Old": "Löschen",
		"All sessions": "Alle Sitzungen",
		"No sessions to delete": "Keine Sitzungen zum Löschen",
		"Delete ALL {count} sessions? This cannot be undone!":
			"ALLE {count} Sitzungen löschen? Dies kann nicht rückgängig gemacht werden!",
		"Older than 7 days": "Älter als 7 Tage",
		"Older than 30 days": "Älter als 30 Tage",
		"Older than 90 days": "Älter als 90 Tage",
		"Search sessions...": "Sitzungen durchsuchen...",
		"Total: {count} sessions · {messages} messages · ${cost}":
			"Gesamt: {count} Sitzungen · {messages} Nachrichten · ${cost}",
		"Open tabs": "Offene Tabs",
		"Waiting for selection": "Warte auf Auswahl",
		"Preparing element selector...": "Bereite Element-Auswahl vor...",
		About: "Über",
		"AI-powered browser extension for web navigation and interaction":
			"KI-gestützte Browser-Erweiterung für Webnavigation und -interaktion",
		"Version:": "Version:",
		Website: "Webseite",
		Imprint: "Impressum",
		Privacy: "Datenschutz",
		"Checking for updates...": "Suche nach Updates...",
		"Update Available": "Update verfügbar",
		"A new version ({version}) is available": "Eine neue Version ({version}) ist verfügbar",
		Update: "Aktualisieren",
		"You're up to date": "Sie sind auf dem neuesten Stand",
		"Update Required": "Update erforderlich",
		"A new version ({version}) is available. Please update to continue.":
			"Eine neue Version ({version}) ist verfügbar. Bitte aktualisieren Sie, um fortzufahren.",
		"Update Now": "Jetzt aktualisieren",
	},
};

// Merge web-ui translations with sitegeist translations
const mergedTranslations = {
	en: { ...webUiTranslations.en, ...sitegeistTranslations.en },
	de: { ...webUiTranslations.de, ...sitegeistTranslations.de },
};

setTranslations(mergedTranslations);
