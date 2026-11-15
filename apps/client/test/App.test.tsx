import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';

describe('App', () => {
  it('starts on the home screen asking for a name', () => {
    render(<App url="ws://127.0.0.1:1/ws" />);
    expect(screen.getByRole('heading', { name: 'Make‑a‑Million' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a room' })).toBeDisabled();
  });
});
