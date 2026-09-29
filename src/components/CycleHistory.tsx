import React, { useRef } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Text } from "react-native-paper";
import { t } from "../i18n";
import { OrderHistoryEvent } from "../types";

const EVENT_LABEL: Record<OrderHistoryEvent["type"], string> = {
    prepared: "history.prepared",
    completed: "history.completed",
    check: "history.check",
    qc: "history.qc",
};

// Completion statuses reuse the Docs tab's labels; check results the check modal's.
const RESULT_LABEL: Record<string, string> = {
    complete: "docs.statusComplete",
    complete_with_changes: "docs.statusCompleteWithChanges",
    missing_product: "docs.statusMissing",
    shipped_incomplete: "docs.statusIncomplete",
    ok: "document.checkStatusOk",
    issue: "document.checkStatusIssue",
};

const PROBLEM_RESULTS = new Set(["issue", "missing_product", "shipped_incomplete"]);

function formatTime(iso: string): string {
    return new Date(iso).toLocaleString("cs-CZ", {
        timeZone: "Europe/Prague",
        day: "numeric",
        month: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/**
 * Everything that happened to one cycle, oldest first — preparation,
 * completion, and every standard check and QC round with its notes (a
 * cycle can go check → QC problem → fix → check → QC … several times).
 * Shown in both the standard check modal and the QC modal.
 */
export default function CycleHistory({ events, cycleIndex }: { events: OrderHistoryEvent[]; cycleIndex: number }) {
    const cycleEvents = events.filter((e) => e.cycleIndex === cycleIndex);
    const scrollRef = useRef<ScrollView>(null);

    return (
        <View style={styles.box}>
            <Text variant="labelMedium" style={styles.title}>
                {t("history.title", { cycle: cycleIndex })}
            </Text>
            {/* Oldest first, but opened scrolled to the end — the latest round
                is what the checker needs first. */}
            <ScrollView
                ref={scrollRef}
                style={styles.scroll}
                nestedScrollEnabled
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
            {cycleEvents.length === 0 ?
                <Text variant="bodySmall" style={styles.line}>
                    {t("history.empty")}
                </Text>
            :   cycleEvents.map((e, i) => {
                    const problem = e.status !== null && PROBLEM_RESULTS.has(e.status);
                    return (
                        <View key={i} style={i > 0 && styles.separated}>
                            <Text variant="bodySmall" style={[styles.line, problem && styles.problem]}>
                                <Text style={styles.time}>{formatTime(e.at)}  </Text>
                                <Text style={styles.type}>{t(EVENT_LABEL[e.type])}</Text>
                                {` · ${e.by}`}
                                {e.status ? ` · ${RESULT_LABEL[e.status] ? t(RESULT_LABEL[e.status]!) : e.status}` : ""}
                            </Text>
                            {e.note ?
                                <Text variant="bodySmall" style={[styles.note, problem && styles.problem]}>
                                    „{e.note}“
                                </Text>
                            :   null}
                        </View>
                    );
                })
            }
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    box: { backgroundColor: "#f6f3f9", borderRadius: 8, padding: 10, marginBottom: 12 },
    scroll: { maxHeight: 180 },
    title: { color: "#333", marginBottom: 4 },
    separated: { marginTop: 4 },
    line: { color: "#444" },
    time: { color: "#888" },
    type: { fontWeight: "600" },
    note: { color: "#555", marginLeft: 8, fontStyle: "italic" },
    problem: { color: "#c62828" },
});
