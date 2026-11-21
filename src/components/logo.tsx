import Image from "next/image";

// The Iris logo from the brand guide (June 2026). Purple on light
// backgrounds, white in dark mode. Files live in public/brand/.
const versions = {
  horizontal: { width: 852, height: 339 },
  primary: { width: 587, height: 511 },
  mark: { width: 586, height: 415 },
} as const;

export function Logo({
  version = "horizontal",
  className = "h-9 w-auto",
  priority = false,
}: {
  version?: keyof typeof versions;
  className?: string;
  priority?: boolean;
}) {
  const { width, height } = versions[version];
  return (
    <>
      <Image
        src={`/brand/logo-${version}-purple.png`}
        width={width}
        height={height}
        alt="Iris Music Project"
        priority={priority}
        className={`${className} dark:hidden`}
      />
      <Image
        src={`/brand/logo-${version}-white.png`}
        width={width}
        height={height}
        alt="Iris Music Project"
        priority={priority}
        className={`${className} hidden dark:block`}
      />
    </>
  );
}
