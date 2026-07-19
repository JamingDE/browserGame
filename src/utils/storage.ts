// LocalStorage-Helper für Local-Only-Daten (keine echten Cookies nötig,
// wir wollen nur den Namen beim Reload wieder vorschlagen).

const NAME_KEY = "vtt.playerName";

export function loadPlayerName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function savePlayerName(name: string) {
  try {
    if (name.trim()) localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    /* ignore */
  }
}
