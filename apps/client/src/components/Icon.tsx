/** Line icons for the table's small buttons. They inherit the text colour and hide from
 *  screen readers: the button that holds one carries its name. */
export type IconName = 'sheet' | 'sound' | 'muted' | 'help' | 'close';

const PATHS: Record<IconName, React.ReactNode> = {
  // A ruled score sheet with a folded corner.
  sheet: (
    <>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M15 3v3h3M9 10h6M9 14h6M9 18h4" />
    </>
  ),
  // The speaker and its waves, shifted left so the whole shape sits centred.
  sound: (
    <g transform="translate(-1.5 0)">
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      <path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" />
    </g>
  ),
  muted: (
    <g transform="translate(-0.5 0)">
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </g>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" />
      <circle cx="12" cy="17.2" r=".6" fill="currentColor" />
    </>
  ),
  // A cross, for closing a dialog or the score sheet.
  close: <path d="M6 6l12 12M18 6L6 18" />,
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
