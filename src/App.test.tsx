import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App Smoke Test', () => {
  it('renders GTA Radio title', () => {
    render(<App />);
    expect(screen.getByText(/GTA Radio/i)).toBeInTheDocument();
  });
});
