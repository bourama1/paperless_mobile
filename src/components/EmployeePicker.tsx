import React, { useState } from "react";
import { TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Menu, Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { t } from "../i18n";
import { Employee } from "../types";

interface EmployeePickerProps {
    employees: Employee[] | undefined;
    selected: string | null;
    onSelect: (name: string) => void;
    style?: StyleProp<ViewStyle>;
}

/**
 * A dropdown for picking "who did this" — print label, finish order, QC
 * check, kiosk completion all use this exact same picker, just against
 * different pieces of state, so it owns its own open/closed state
 * internally rather than making every caller wire up a visible flag.
 */
export default function EmployeePicker({ employees, selected, onSelect, style }: EmployeePickerProps) {
    const [visible, setVisible] = useState(false);

    return (
        <Menu
            visible={visible}
            onDismiss={() => setVisible(false)}
            anchor={
                <TouchableOpacity style={[styles.dropdown, style]} onPress={() => setVisible(true)}>
                    <Text style={selected ? styles.dropdownText : styles.dropdownPlaceholder}>
                        {selected ?? t("kiosk.selectEmployee")}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color="#909090" />
                </TouchableOpacity>
            }>
            {(employees ?? []).map((emp) => (
                <Menu.Item
                    key={emp.id}
                    title={emp.name}
                    onPress={() => {
                        onSelect(emp.name);
                        setVisible(false);
                    }}
                />
            ))}
            {(employees ?? []).length === 0 && <Menu.Item title={t("kiosk.noEmployees")} disabled />}
        </Menu>
    );
}

const styles = StyleSheet.create({
    dropdown: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#ddd",
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    dropdownText: { fontSize: 16 },
    dropdownPlaceholder: { fontSize: 16, color: "#aaa" },
});
