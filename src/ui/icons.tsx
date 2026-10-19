import type { ReactNode, SVGProps } from 'react';
import type { ItemKind } from '../domain/types';

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  readonly size?: number;
}

function Svg({ size = 16, children, ...rest }: IconProps & { readonly children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.5 3.5 2.5 6.5l3 3" />
      <path d="M2.5 6.5h7a3.5 3.5 0 0 1 0 7H7" />
    </Svg>
  );
}

export function RedoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m10.5 3.5 3 3-3 3" />
      <path d="M13.5 6.5h-7a3.5 3.5 0 0 0 0 7H9" />
    </Svg>
  );
}

export function RotateCwIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89l1.61 1.6" />
      <path d="M13.5 2.5v3.2h-3.2" />
    </Svg>
  );
}

export function RotateCcwIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 8a5.5 5.5 0 1 0 1.61-3.89L2.5 5.7" />
      <path d="M2.5 2.5v3.2h3.2" />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.75 4.25h10.5" />
      <path d="M6.25 4.25v-1.5h3.5v1.5" />
      <path d="m4.25 4.25.6 9h6.3l.6-9" />
      <path d="M6.75 7v3.75M9.25 7v3.75" />
    </Svg>
  );
}

export function DuplicateIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5.25" y="5.25" width="8.5" height="8.5" rx="1.25" />
      <path d="M10.75 5.25V3.5c0-.69-.56-1.25-1.25-1.25h-6c-.69 0-1.25.56-1.25 1.25v6c0 .69.56 1.25 1.25 1.25h1.75" />
    </Svg>
  );
}

export function CubeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 1.75 13.75 5v6L8 14.25 2.25 11V5z" />
      <path d="M2.25 5 8 8.25 13.75 5M8 8.25v6" />
    </Svg>
  );
}

export function PlanIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="1" />
      <path d="M2.25 8h11.5M8 2.25v11.5" />
    </Svg>
  );
}

export function FocusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v2.25M8 12.25v2.25M1.5 8h2.25M12.25 8h2.25" />
    </Svg>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m7 2.25 1.2 3.55L11.75 7 8.2 8.2 7 11.75 5.8 8.2 2.25 7 5.8 5.8z" />
      <path d="M12.25 10.25v3.5M10.5 12h3.5" />
    </Svg>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 2.25 14.25 13.25H1.75z" />
      <path d="M8 6.5v3" />
      <path d="M8 11.4v.1" />
    </Svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="m5.5 8.25 1.75 1.75 3.25-3.5" />
    </Svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </Svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7" cy="7" r="4.25" />
      <path d="m10.25 10.25 3.5 3.5" />
    </Svg>
  );
}

export function GaugeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 11.5a5.5 5.5 0 1 1 11 0" />
      <path d="M8 11.5 10.75 8" />
    </Svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.75 2.25 7 9" />
      <path d="M13.75 2.25 9.5 13.75 7 9 2.25 6.5z" />
    </Svg>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="8" height="8" rx="1" />
    </Svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m4 6 4 4 4-4" />
    </Svg>
  );
}

export function ChevronUpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m4 10 4-4 4 4" />
    </Svg>
  );
}

export function KeyboardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="1.75" y="4" width="12.5" height="8" rx="1.25" />
      <path d="M4.5 6.75h.01M7 6.75h.01M9.5 6.75h.01M12 6.75h.01M5 9.5h6" />
    </Svg>
  );
}

export function CursorIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 2.5 12 7.25l-3.75 1-1.75 3.75z" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 3v10M3 8h10" />
    </Svg>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 8h10" />
    </Svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.25V11" />
      <path d="M8 5v.1" />
    </Svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5" />
    </Svg>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="0.5" />
      <path d="M2.5 6.17h11M2.5 9.83h11M6.17 2.5v11M9.83 2.5v11" />
    </Svg>
  );
}

export function ClearIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.75 4.5h10.5M2.75 8h6M2.75 11.5h4" />
      <path d="m10.5 10 3 3M13.5 10l-3 3" />
    </Svg>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.5 4h8M5.5 8h8M5.5 12h8" />
      <path d="M2.5 4h.01M2.5 8h.01M2.5 12h.01" />
    </Svg>
  );
}

export function CloudIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 12.5a3 3 0 0 1-.4-5.97A4 4 0 0 1 11.9 6a3.25 3.25 0 0 1 .35 6.5z" />
    </Svg>
  );
}

function CabinetIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.75" y="1.75" width="8.5" height="12.5" rx="0.75" />
      <path d="M8 1.75v12.5" />
      <path d="M6.6 7.25v1.5M9.4 7.25v1.5" />
    </Svg>
  );
}

function DriveIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4.25" y="1.75" width="7.5" height="12.5" rx="0.75" />
      <rect x="6" y="3.75" width="4" height="2.75" rx="0.4" />
      <path d="M6 9.5h4M6 11.75h4" />
    </Svg>
  );
}

function TransformerIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 2.75h12M2 13.25h12" />
      <rect x="2.75" y="4.5" width="2.75" height="7" rx="1.375" />
      <rect x="6.625" y="4.5" width="2.75" height="7" rx="1.375" />
      <rect x="10.5" y="4.5" width="2.75" height="7" rx="1.375" />
    </Svg>
  );
}

function UpsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.75" y="2.25" width="10.5" height="11.5" rx="0.75" />
      <path d="M8.75 4.75 6.5 8.25h3l-2.25 3" />
    </Svg>
  );
}

export function KindIcon({ kind, ...props }: IconProps & { readonly kind: ItemKind }) {
  switch (kind) {
    case 'cabinet':
      return <CabinetIcon {...props} />;
    case 'drive':
      return <DriveIcon {...props} />;
    case 'transformer':
      return <TransformerIcon {...props} />;
    case 'ups':
      return <UpsIcon {...props} />;
  }
}
