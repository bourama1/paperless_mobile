import React from 'react';
import { render } from '@testing-library/react-native';
import DrawingCanvas from '../DrawingCanvas';

describe('DrawingCanvas', () => {
  it('renders correctly', () => {
    const { toJSON } = render(<DrawingCanvas />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('renders with initial paths', () => {
    const initialPaths = ['M0,0 L10,10'];
    const { toJSON } = render(<DrawingCanvas initialPaths={initialPaths} />);
    expect(toJSON()).toMatchSnapshot();
  });
});
