/**
 * A course code with a dot in the course's own color. The dot carries the color
 * and the code keeps the surrounding text color, so light course colors (amber,
 * yellow) stay readable on any background.
 */
export function CourseTag({ code, color, className = '' }: { code: string; color: string; className?: string }) {
  return <span className={`inline-flex items-center gap-1.5 font-semibold ${className}`}>
    <span className="size-2 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: color }} aria-hidden="true" />
    {code}
  </span>;
}
