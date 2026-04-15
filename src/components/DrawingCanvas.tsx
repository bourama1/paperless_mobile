import React, { useState, useRef } from 'react';
import { View, StyleSheet, PanResponder, Dimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface DrawingCanvasProps {
  onPathsChange?: (paths: string[]) => void;
}

export default function DrawingCanvas({ onPathsChange }: DrawingCanvasProps) {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [paths, setPaths] = useState<string[]>([]);
  
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
        setPaths((prev) => {
          const newPaths = [...prev, currentPath];
          onPathsChange?.(newPaths);
          return newPaths;
        });
        setCurrentPath('');
      },
    })
  ).current;

  const clear = () => {
    setPaths([]);
    onPathsChange?.([]);
  };

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
