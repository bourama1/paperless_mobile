import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, PanResponder } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface DrawingCanvasProps {
  onPathsChange?: (paths: string[]) => void;
}

export default function DrawingCanvas({ onPathsChange }: DrawingCanvasProps) {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [paths, setPaths] = useState<string[]>([]);
  
  // Notify parent of changes only when paths array actually updates
  useEffect(() => {
    onPathsChange?.(paths);
  }, [paths]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath(`M${locationX},${locationY}`);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath((prev) => `${prev} L${locationX},${locationY}`);
      },
      onPanResponderRelease: () => {
        if (currentPath) {
          setPaths((prev) => [...prev, currentPath]);
        }
        setCurrentPath('');
      },
    })
  ).current;

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <Svg style={styles.svg}>
        {paths.map((path, index) => (
          <Path
            key={index}
            d={path}
            stroke="red"
            strokeWidth={3}
            fill="none"
          />
        ))}
        {currentPath ? (
          <Path
            d={currentPath}
            stroke="red"
            strokeWidth={3}
            fill="none"
          />
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  svg: {
    flex: 1,
  },
});
