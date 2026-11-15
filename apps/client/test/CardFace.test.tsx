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

  it('marks trump and widow cards, and says so in its name', () => {
    render(<CardFace id={TIGER_ID} trump fresh />);
    const card = screen.getByLabelText('Tiger top trump, trump, from the widow');
    expect(card).toHaveAttribute('data-trump');
    expect(card).toHaveTextContent('★');
    expect(card).toHaveTextContent('new');
  });

  it('carries a tooltip explaining why it is greyed out', () => {
    render(<CardFace id={0} disabled onClick={() => {}} title="You must follow Red." />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'You must follow Red.');
  });
});
