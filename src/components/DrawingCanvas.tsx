import React, { useState, useRef, useEffect } from "react";
import { View, StyleSheet, PanResponder, LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";

interface DrawingCanvasProps {
    initialPaths?: string[];
    onPathsChange?: (paths: string[]) => void;
    onSizeChange?: (width: number, height: number) => void; // NEW
}

export default function DrawingCanvas({ initialPaths = [], onPathsChange, onSizeChange }: DrawingCanvasProps) {
    const [paths, setPaths] = useState<string[]>(initialPaths);
    const [currentPath, setCurrentPath] = useState<string>("");
    const activePathRef = useRef<string>("");

    useEffect(() => {
        if (initialPaths && initialPaths.length > 0) {
            setPaths(initialPaths);
        }
    }, [initialPaths]);

    useEffect(() => {
        if (JSON.stringify(paths) !== JSON.stringify(initialPaths)) {
            onPathsChange?.(paths);
        }
    }, [paths, initialPaths, onPathsChange]);

    // Report the actual rendered canvas size to the parent
    const handleLayout = (event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        onSizeChange?.(width, height);
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderGrant: (evt) => {
                const { locationX, locationY } = evt.nativeEvent;
                const startPoint = `M${locationX},${locationY}`;
                activePathRef.current = startPoint;
                setCurrentPath(startPoint);
            },
            onPanResponderMove: (evt) => {
                const { locationX, locationY } = evt.nativeEvent;
                const nextPoint = `${activePathRef.current} L${locationX},${locationY}`;
                activePathRef.current = nextPoint;
                setCurrentPath(nextPoint);
            },
            onPanResponderRelease: () => {
                if (activePathRef.current) {
                    const finishedPath = activePathRef.current;
                    setPaths((prev) => [...prev, finishedPath]);
                }
                activePathRef.current = "";
                setCurrentPath("");
            },
        }),
    ).current;

    return (
        <View style={styles.container} {...panResponder.panHandlers} onLayout={handleLayout}>
            <Svg style={styles.svg}>
                {paths.map((path, index) => (
                    <Path key={index} d={path} stroke="red" strokeWidth={3} fill="none" />
                ))}
                {currentPath ?
                    <Path d={currentPath} stroke="red" strokeWidth={3} fill="none" />
                :   null}
            </Svg>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "transparent",
    },
    svg: {
        flex: 1,
    },
});
