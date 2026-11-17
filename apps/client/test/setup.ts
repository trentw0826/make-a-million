import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach } from 'vitest';

// jsdom has no layout or animation frames worth waiting for: let every motion finish at once.
MotionGlobalConfig.skipAnimations = true;

afterEach(() => cleanup());
