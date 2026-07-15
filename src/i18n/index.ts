import cs from "./cs.json";

const dict: Record<string, string> = cs;

export function t(key: string, params?: Record<string, string | number> & { defaultValue?: string }): string {
    let val = dict[key] ?? params?.defaultValue ?? key;
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            if (k === "defaultValue") continue;
            val = val.replaceAll(`{${k}}`, String(v));
        }
    }
    return val;
}
