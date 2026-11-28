import type { ReviewedMove } from '@mam/protocol';
import { type CSSProperties, type ReactNode, useState } from 'react';
import { GameReview } from '../components/analysis/GameReview';
import { CardFace } from '../components/CardFace';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/Segmented';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { Button, type ButtonVariant } from '../components/ui/Button';
import { Heading } from '../components/ui/Heading';
import { Meter } from '../components/ui/Meter';
import { Panel } from '../components/ui/Panel';
import { Text } from '../components/ui/Text';
import { Wordmark } from '../components/Wordmark';
import * as motion from '../theme/motion';
import tokensCss from '../theme/tokens.css?raw';
import styles from './StyleGuide.module.css';
import { kindOf, parseTokens, type Token, type TokenKind } from './tokens';

/*
 * Every token and shared component on one page, each component on the felt and on paper.
 * Dev-only: `pnpm dev` serves it at /styleguide.html, and `pnpm e2e` builds and screenshots
 * it (e2e/out/10-style-guide.png). Nothing in the app links here.
 */

const VARIANTS: readonly ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger', 'link'];
const BADGE_TONES: readonly BadgeTone[] = [
  'neutral',
  'quiet',
  'shade',
  'paper',
  'contract',
  'accent',
  'good',
  'bad',
  'warn',
];
const GRADE_TONES: readonly BadgeTone[] = [
  'grade-best',
  'grade-good',
  'grade-inaccuracy',
  'grade-mistake',
  'grade-blunder',
  'grade-forced',
];
const TEXT_SIZES = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const;
const HEADING_SIZES = ['sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const;

/** A sample game review: a decision of each grade, and three costly moments. */
const REVIEW: readonly ReviewedMove[] = [
  {
    ply: 0,
    hand: 1,
    trick: null,
    played: { type: 'pass' },
    label: 'mistake',
    lossK: 30,
    best: { type: 'bid', amount: 120_000 },
  },
  {
    ply: 9,
    hand: 1,
    trick: 2,
    played: { type: 'playCard', cardId: 3 },
    label: 'best',
    lossK: 0,
    best: { type: 'playCard', cardId: 3 },
  },
  {
    ply: 14,
    hand: 1,
    trick: 3,
    played: { type: 'playCard', cardId: 1 },
    label: 'forced',
    lossK: 0,
    best: { type: 'playCard', cardId: 1 },
  },
  {
    ply: 60,
    hand: 2,
    trick: 5,
    played: { type: 'playCard', cardId: 1 },
    label: 'blunder',
    lossK: 65,
    best: { type: 'playCard', cardId: 3 },
  },
  {
    ply: 70,
    hand: 2,
    trick: 7,
    played: { type: 'playCard', cardId: 3 },
    label: 'good',
    lossK: 2,
    best: { type: 'playCard', cardId: 1 },
  },
  {
    ply: 75,
    hand: 2,
    trick: 8,
    played: { type: 'playCard', cardId: 3 },
    label: 'inaccuracy',
    lossK: 9,
    best: { type: 'playCard', cardId: 1 },
  },
];

export function StyleGuide() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Wordmark />
        <Heading level={1} size="2xl">
          Style guide
        </Heading>
        <Text as="p" tone="muted" size="sm">
          Every token in theme/tokens.css and every shared component in components/ui, each on the
          felt and on paper. Build from these; add a token or a variant before a one-off.
        </Text>
      </header>

      <Section title="Button">
        <Both>
          {VARIANTS.map((v) => (
            <Row key={v} label={v}>
              <Button variant={v}>Bid $120k</Button>
              <Button variant={v} size="sm">
                Pass
              </Button>
              <Button variant={v} disabled>
                Disabled
              </Button>
            </Row>
          ))}
          <Row label="shapes">
            <Button shape="pill" size="sm">
              Show the cards ▾
            </Button>
            <Button variant="ghost" shape="square" aria-label="Score sheet">
              <Icon name="sheet" />
            </Button>
            <Button variant="ghost" shape="round" aria-label="Rules">
              ?
            </Button>
          </Row>
        </Both>
      </Section>

      <Section title="Badge">
        <Both>
          {(['sm', 'md', 'lg'] as const).map((size) => (
            <Row key={size} label={size}>
              {BADGE_TONES.map((t) => (
                <Badge key={t} tone={t} size={size}>
                  {t}
                </Badge>
              ))}
            </Row>
          ))}
          <Row label="grades">
            {GRADE_TONES.map((t) => (
              <Badge key={t} tone={t} size="md">
                {t.replace('grade-', '')}
              </Badge>
            ))}
          </Row>
        </Both>
      </Section>

      <Section title="Meter">
        <Both>
          <Row label="sm">
            <Meter value={0.3} fill="us" className={styles.meter} />
            <Meter value={0.65} fill="them" className={styles.meter} />
            <Meter value={0.9} className={styles.meter} />
          </Row>
          <Row label="md">
            <Meter value={0.3} fill="us" size="md" className={styles.meter} />
            <Meter value={0.65} fill="them" size="md" className={styles.meter} />
            <Meter value={0.9} size="md" className={styles.meter} />
          </Row>
        </Both>
      </Section>

      <Section title="Heading">
        <Both>
          {HEADING_SIZES.map((s) => (
            <Row key={s} label={s}>
              <Heading level={3} size={s}>
                Hand 3 · Your side made its bid
              </Heading>
            </Row>
          ))}
        </Both>
      </Section>

      <Section title="Text">
        <Both>
          {TEXT_SIZES.map((s) => (
            <Row key={s} label={s}>
              <Text size={s}>The bidders captured $140k</Text>
            </Row>
          ))}
          <Row label="tones">
            <Text>plain</Text>
            <Text tone="muted">muted</Text>
            <Text tone="good">+$55,000</Text>
            <Text tone="bad">−$225,000</Text>
          </Row>
          <Row label="weights">
            <Text weight="regular">regular</Text>
            <Text weight="semibold">semibold</Text>
            <Text weight="bold">bold</Text>
          </Row>
          <Row label="caps">
            <Text size="sm" tone="muted" caps>
              Choose trump
            </Text>
            <Text numeric weight="bold">
              $1,000,000
            </Text>
          </Row>
        </Both>
      </Section>

      <Section title="Panel">
        <div className={styles.felt}>
          <Row label="tones">
            {(['paper', 'raised', 'outlined', 'felt'] as const).map((t) => (
              <Panel key={t} tone={t} className={styles.panel}>
                <Text weight="bold">{t}</Text>
                <Text as="p" size="sm" tone="muted">
                  Text tones suit the surface.
                </Text>
                <Meter value={0.5} fill="us" />
              </Panel>
            ))}
          </Row>
          <Row label="pads">
            {(['sm', 'md', 'lg'] as const).map((p) => (
              <Panel key={p} tone="paper" pad={p}>
                <Text size="sm">pad {p}</Text>
              </Panel>
            ))}
          </Row>
        </div>
      </Section>

      <Section title="Game pieces">
        <div className={styles.felt}>
          <Row label="segmented">
            <LevelPicker />
          </Row>
          <Row label="cards">
            {[12, 3, 52, 53, 54].map((id) => (
              <CardFace key={id} id={id} />
            ))}
            <CardFace id={51} size="small" />
          </Row>
        </div>
        <Panel tone="paper" className={styles.review}>
          <GameReview moves={REVIEW} />
        </Panel>
      </Section>

      <Section title="Tokens">
        {parseTokens(tokensCss).map((group) => (
          <div key={group.title} className={styles.tokenGroup}>
            <Heading level={3} size="md">
              {group.title}
            </Heading>
            <ul className={styles.tokens}>
              {group.tokens.map((t) => (
                <li key={t.name} className={styles.token}>
                  <TokenSample token={t} kind={kindOf(group.title, t)} />
                  <code className={styles.tokenName}>{t.name}</code>
                  <Text size="xs" tone="muted" className={styles.tokenValue}>
                    {t.value}
                  </Text>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Section>

      <Section title="Motion presets (theme/motion.ts)">
        <ul className={styles.tokens}>
          {Object.entries(motion).map(([name, value]) => (
            <li key={name} className={styles.token}>
              <code className={styles.tokenName}>{name}</code>
              <Text size="xs" tone="muted" className={styles.tokenValue}>
                {JSON.stringify(value)}
              </Text>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section} aria-label={title}>
      <Heading level={2} size="xl">
        {title}
      </Heading>
      {children}
    </section>
  );
}

/** The same samples on the felt and on paper, side by side. */
function Both({ children }: { children: ReactNode }) {
  return (
    <div className={styles.both}>
      <div className={styles.felt}>{children}</div>
      <div className={styles.paper}>{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <Text size="xs" tone="muted" caps className={styles.rowLabel}>
        {label}
      </Text>
      <div className={styles.rowItems}>{children}</div>
    </div>
  );
}

function LevelPicker() {
  const [level, setLevel] = useState<'Easy' | 'Normal' | 'Hard' | 'Expert'>('Normal');
  return (
    <Segmented
      label="Bot level"
      options={['Easy', 'Normal', 'Hard', 'Expert'] as const}
      value={level}
      text={(l) => l}
      onChange={setLevel}
    />
  );
}

/** A picture of a token: a swatch, a sample of type, a bar of space, a corner, a shadow. */
function TokenSample({ token, kind }: { token: Token; kind: TokenKind }) {
  const v = `var(${token.name})`;
  const sample: Partial<Record<TokenKind, CSSProperties>> = {
    colour: { background: v },
    opacity: { background: 'var(--ink)', opacity: v },
    radius: { borderRadius: v },
    shadow: { boxShadow: v },
    space: { width: v },
  };
  if (kind === 'font') return <span style={{ fontFamily: v }}>Aa $40k</span>;
  if (kind === 'size') return <span style={{ fontSize: v }}>Aa</span>;
  const style = sample[kind];
  if (!style) return <span className={styles.noSample} />;
  return <span className={`${styles.sample} ${styles[`sample-${kind}`]}`} style={style} />;
}
