import Image from "next/image";
import type { CSSProperties } from "react";

import { logoForSchool } from "@/lib/school-logos";
import { photoForSchool } from "@/lib/school-photos";
import { markColour, schoolInitials } from "./mark-palette";

/**
 * Presentational: the school's name is always rendered as text beside this, so
 * announcing the initials would make a screen reader say the name twice.
 *
 * A registered photograph replaces the initials; the mark's colour stays as the
 * tinted placeholder underneath, so the reserved circle never flashes empty
 * while the image loads. Schools without a photograph - currently all of them -
 * show the mark, which is a finished state rather than a gap.
 */
export function SchoolMark({ name, small }: { name: string; small?: boolean }) {
  // A logo outranks a photograph at this size: in a 44px circle an
  // institutional mark is legible and a campus scene is mush. Both are off by
  // default, so in practice this renders initials - see
  // src/lib/school-logos.ts.
  const logo = logoForSchool(name);
  const photo = logo ? undefined : photoForSchool(name);
  const size = small ? 30 : 44;
  const image = logo ?? photo;

  // Every logo arrives as a square frame with its content already inset to a
  // consistent fraction, so there is nothing left to fit, crop or centre here.
  const style: CSSProperties = logo
    ? {
      ...(logo.render?.background ? { background: logo.render.background } : {}),
      ...(logo.render?.scale ? { "--logo-scale": logo.render.scale } as CSSProperties : {}),
    }
    : { background: markColour(name), color: "#fff" };

  return (
    <span
      className={[
        "mark",
        small ? "small" : "",
        logo ? "mark-logo" : "",
        logo?.fullBleed ? "mark-bleed" : "",
      ].filter(Boolean).join(" ")}
      style={style}
      aria-hidden="true"
    >
      {image ? (
        <Image
          src={image.file}
          alt=""
          width={size * 2}
          height={size * 2}
          sizes={`${size}px`}
          style={photo ? { objectPosition: photo.focus } : undefined}
          // A logo is a fixed square asset already sized for this slot, and
          // several began life as SVG; re-encoding it buys nothing.
          unoptimized={Boolean(logo)}
        />
      ) : (
        schoolInitials(name)
      )}
    </span>
  );
}

export { MARK_COLOURS, markColour, schoolInitials } from "./mark-palette";
