import { useQuery } from "@tanstack/react-query";
import apiClient from "../api/client";
import { Employee } from "../types";

/**
 * The list of employee names shown in every "who did this?" picker
 * (print label, finish order, QC check, kiosk completion). Same queryKey
 * everywhere, so React Query shares one cached fetch across all of them —
 * `enabled` just controls whether THIS caller is the one triggering it
 * (typically gated to "while its modal is open").
 */
export function useEmployees(enabled: boolean = true) {
    return useQuery<Employee[]>({
        queryKey: ["employees"],
        queryFn: async () => {
            const response = await apiClient.get("/employees");
            return response.data;
        },
        enabled,
    });
}
