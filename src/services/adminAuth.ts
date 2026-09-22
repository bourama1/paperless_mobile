/**
 * Holds the PIN entered to unlock the hidden employee-admin screen — pure
 * in-memory, never persisted (AsyncStorage, route params, etc). A web page
 * refresh or the native app restarting wipes it, same as leaving and
 * re-entering the screen; either way the PIN has to be typed again. This
 * exists specifically so the PIN never has to travel as a route/query
 * param, which on the web build would otherwise show up in the address
 * bar and browser history.
 */
let adminPin: string | null = null;

export function setAdminPin(pin: string): void {
    adminPin = pin;
}

export function getAdminPin(): string | null {
    return adminPin;
}

export function clearAdminPin(): void {
    adminPin = null;
}
