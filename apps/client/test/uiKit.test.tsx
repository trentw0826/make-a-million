import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CardFace } from '../src/components/CardFace';
import { Badge } from '../src/components/ui/Badge';
import { Button } from '../src/components/ui/Button';
import { Heading } from '../src/components/ui/Heading';
import { Meter } from '../src/components/ui/Meter';
import { Panel } from '../src/components/ui/Panel';
import { PRESSABLE } from '../src/components/ui/pressable';
import { Text } from '../src/components/ui/Text';

describe('Button', () => {
  it('is an ordinary button unless a form asks it to submit', () => {
    render(
      <form onSubmit={(e) => e.preventDefault()}>
        <Button>Stay</Button>
        <Button type="submit">Join room</Button>
      </form>,
    );
    expect(screen.getByRole('button', { name: 'Stay' })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('button', { name: 'Join room' })).toHaveAttribute('type', 'submit');
  });

  it('keeps the caller’s class and passes everything else through', () => {
    const onClick = vi.fn();
    render(
      <Button
        variant="ghost"
        size="sm"
        className="bid-pass"
        aria-keyshortcuts="P"
        onClick={onClick}
      >
        Pass
      </Button>,
    );
    const pass = screen.getByRole('button', { name: 'Pass' });
    expect(pass).toHaveClass('bid-pass');
    expect(pass).toHaveAttribute('aria-keyshortcuts', 'P');
    fireEvent.click(pass);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('gives each variant, size and shape its own look', () => {
    render(
      <>
        <Button>a</Button>
        <Button variant="primary">b</Button>
        <Button variant="primary" size="sm">
          c
        </Button>
        <Button variant="primary" shape="round">
          d
        </Button>
      </>,
    );
    const classes = ['a', 'b', 'c', 'd'].map(
      (n) => screen.getByRole('button', { name: n }).className,
    );
    expect(new Set(classes).size).toBe(4);
  });

  it('does nothing when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Pass
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pass' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('pressing', () => {
  it('makes buttons and clickable cards give under a press, but not a card that is only shown', () => {
    const { container } = render(
      <>
        <Button>Pass</Button>
        <CardFace id={12} onClick={() => {}} />
        <CardFace id={11} />
      </>,
    );
    expect(PRESSABLE).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pass' })).toHaveClass(PRESSABLE);
    const [clickable, shown] = Array.from(container.querySelectorAll('.card'));
    expect(clickable).toHaveClass(PRESSABLE);
    expect(shown).not.toHaveClass(PRESSABLE);
  });

  it('marks a greyed-out card so the press passes it by', () => {
    render(<CardFace id={12} disabled onClick={() => {}} />);
    // The press applies only to :not(:disabled, [aria-disabled="true"]).
    expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('Panel', () => {
  it('renders as the element asked for, with the caller’s class', () => {
    render(
      <ol>
        <Panel as="li" tone="outlined" pad="sm" className="sheet-hand">
          Hand 1
        </Panel>
      </ol>,
    );
    const item = screen.getByRole('listitem');
    expect(item).toHaveTextContent('Hand 1');
    expect(item).toHaveClass('sheet-hand');
  });
});

describe('Text', () => {
  it('renders as the element asked for and adds no class it was not asked for', () => {
    const { container } = render(
      <>
        <Text>plain</Text>
        <Text as="strong" tone="bad" numeric>
          −$40,000
        </Text>
      </>,
    );
    const [plain, money] = Array.from(container.children);
    expect(plain?.tagName).toBe('SPAN');
    expect(plain).not.toHaveAttribute('class');
    expect(money?.tagName).toBe('STRONG');
    expect(money?.className).not.toBe('');
  });
});

describe('Badge', () => {
  it('names its tone, defaults to neutral, and keeps the caller’s class', () => {
    render(
      <>
        <Badge>host</Badge>
        <Badge tone="grade-blunder" size="md" className="tag">
          Blunder
        </Badge>
      </>,
    );
    expect(screen.getByText('host')).toHaveAttribute('data-tone', 'neutral');
    const blunder = screen.getByText('Blunder');
    expect(blunder).toHaveAttribute('data-tone', 'grade-blunder');
    expect(blunder).toHaveClass('tag');
    expect(blunder.className).not.toBe(screen.getByText('host').className);
  });

  it('can be a list item', () => {
    render(
      <ul>
        <Badge as="li" tone="good">
          Bot 2
        </Badge>
      </ul>,
    );
    expect(screen.getByRole('listitem')).toHaveTextContent('Bot 2');
  });
});

describe('Meter', () => {
  const fill = (el: Element | undefined) =>
    (el?.firstElementChild as HTMLElement | null)?.style.width;

  it('fills to its value, clamped to the track, and is hidden from screen readers', () => {
    const { container } = render(
      <>
        <Meter value={0.25} fill="us" />
        <Meter value={-0.4} />
        <Meter value={3} />
        <Meter value={Number.NaN} />
      </>,
    );
    const [quarter, below, above, nan] = Array.from(container.children);
    expect(fill(quarter)).toBe('25%');
    expect(fill(below)).toBe('0%');
    expect(fill(above)).toBe('100%');
    expect(fill(nan)).toBe('0%');
    expect(quarter).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Heading', () => {
  it('takes its element from the level and its size apart from it', () => {
    render(
      <>
        <Heading level={2}>Score sheet</Heading>
        <Heading level={2} size="md">
          Start a table
        </Heading>
        <Heading level={3} className="sheet-hand-head">
          Hand 1
        </Heading>
      </>,
    );
    const [big, small] = screen.getAllByRole('heading', { level: 2 });
    expect(big).toHaveTextContent('Score sheet');
    expect(big?.className).not.toBe(small?.className);
    expect(screen.getByRole('heading', { level: 3 })).toHaveClass('sheet-hand-head');
  });
});
