export function Icon({
  name = "file",
  size = 18,
}: {
  name?: string;
  size?: number;
}) {
  const paths: Record<string, string> = {
    file: "M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6",
    download: "M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5",
    search: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14 M15 15l6 6",
    plus: "M12 5v14 M5 12h14",
    close: "M6 6l12 12 M6 18L18 6",
    chevron: "M9 5l7 7-7 7",
    menu: "M5 6h14 M5 12h14 M5 18h14",
    filter: "M4 5h16 M7 12h10 M10 19h4",
    settings: "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
    pause: "M8 5v14 M16 5v14",
    check: "M5 12l4 4L19 6",
    clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2",
    error: "M12 3L2 21h20z M12 9v5 M12 17v1",
    video: "M3 5h18v14H3z M10 9l5 3-5 3z",
    folder: "M3 6h7l2 3h9v11H3z",
    box: "M3 7l9-4 9 4v13H3z M3 7h18 M12 7v13",
    code: "M8 6l-6 6 6 6 M16 6l6 6-6 6",
    more: "M5 12h1 M11 12h1 M17 12h1",
    link: "M10 8l3-3a4 4 0 0 1 6 6l-3 3 M14 16l-3 3a4 4 0 0 1-6-6l3-3 M8 16l8-8",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.file} />
    </svg>
  );
}
