/** Per-browser conveniences. Every access is guarded: storage may be unavailable. */

const TOKEN_KEY = 'mam.token';
const NAME_KEY = 'mam.name';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Ignore: private mode or blocked storage. The game still works for this session.
  }
}

export const storage = {
  token: () => read(TOKEN_KEY),
  setToken: (token: string) => write(TOKEN_KEY, token),
  name: () => read(NAME_KEY),
  setName: (name: string) => write(NAME_KEY, name),
};
