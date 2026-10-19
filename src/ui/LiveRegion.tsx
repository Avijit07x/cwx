interface Announcement {
  readonly id: number;
  readonly text: string;
}

export function LiveRegion({ announcement }: { readonly announcement: Announcement | null }) {
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="live-region">
      {announcement && <span key={announcement.id}>{announcement.text}</span>}
    </div>
  );
}
