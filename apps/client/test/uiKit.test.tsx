import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../src/components/ui/Button';
import { Panel } from '../src/components/ui/Panel';
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
        className="plaque-pass"
        aria-keyshortcuts="P"
        onClick={onClick}
      >
        Pass
      </Button>,
    );
    const pass = screen.getByRole('button', { name: 'Pass' });
    expect(pass).toHaveClass('plaque-pass');
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
