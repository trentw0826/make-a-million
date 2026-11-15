import { TIGER_ID } from '@mam/engine';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CardFace } from '../src/components/CardFace';

describe('CardFace', () => {
  it('shows the label and suit in colored text', () => {
    render(<CardFace id={12} />);
    const card = screen.getByLabelText('$40k Red');
    expect(card).toHaveClass('card-red');
    expect(card).toHaveClass('card-money');
  });

  it('renders special cards by name', () => {
    render(<CardFace id={TIGER_ID} />);
    expect(screen.getByText('Tiger')).toBeInTheDocument();
  });

  it('is a disabled button when the card is not legal to play', () => {
    const onClick = vi.fn();
    render(<CardFace id={0} disabled onClick={onClick} />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('calls back when a legal card is clicked', () => {
    const onClick = vi.fn();
    render(<CardFace id={0} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
