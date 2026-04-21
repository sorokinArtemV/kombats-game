"""
One-shot silhouette contour analysis for BodyZoneSelector polygon design.

For every y-row in src/assets/fighters/silhouette.png, find the leftmost and
rightmost opaque (alpha > 128) pixel. Report per-row body extents at the
sampling y-percentages used by the zone system, plus derived anatomical
landmarks. Also characterise the blade-y band so we can see where the
body-only extent ends and blade pixels begin.

Run:  python scripts/analyze_silhouette.py
"""

from pathlib import Path
from PIL import Image

ALPHA_THRESHOLD = 128
PNG_PATH = (
    Path(__file__).resolve().parent.parent
    / "src" / "assets" / "fighters" / "silhouette.png"
)


def pct(v: float, whole: float) -> float:
    return (v / whole) * 100.0


def find_row_extent(pixels, width, y):
    """Return (left_x, right_x, runs) for row y.

    runs is a list of (start_x, end_x_inclusive) opaque segments, useful
    for detecting gaps (between legs, pauldron cutouts) or blade
    segments separated from the torso.
    """
    left = None
    right = None
    runs = []
    run_start = None
    for x in range(width):
        a = pixels[x, y][3]
        if a > ALPHA_THRESHOLD:
            if left is None:
                left = x
            right = x
            if run_start is None:
                run_start = x
        else:
            if run_start is not None:
                runs.append((run_start, x - 1))
                run_start = None
    if run_start is not None:
        runs.append((run_start, width - 1))
    return left, right, runs


def main() -> None:
    img = Image.open(PNG_PATH).convert("RGBA")
    w, h = img.size
    px = img.load()
    print(f"# Silhouette contour analysis\n")
    print(f"Source: `{PNG_PATH.relative_to(Path.cwd()) if PNG_PATH.is_relative_to(Path.cwd()) else PNG_PATH}`")
    print(f"Dimensions: {w} × {h} px (alpha threshold > {ALPHA_THRESHOLD})\n")

    # --- 1. Sampled rows (every 5% from y=10 to y=95) ---
    print("## Per-row extents (5% grid)\n")
    print("| y% | y_px | body_left_x% | body_right_x% | body_width% | runs | notes |")
    print("|---:|-----:|-------------:|--------------:|------------:|-----:|-------|")
    sample_ys_pct = list(range(10, 100, 5))
    for yp in sample_ys_pct:
        y_px = int(round(yp / 100 * (h - 1)))
        left, right, runs = find_row_extent(px, w, y_px)
        if left is None:
            print(f"| {yp} | {y_px} | — | — | — | 0 | empty row |")
            continue
        lp = pct(left, w)
        rp = pct(right, w)
        notes = []
        if len(runs) > 1:
            gap_widths_px = [
                runs[i + 1][0] - runs[i][1] - 1 for i in range(len(runs) - 1)
            ]
            notes.append(
                "gaps: "
                + ", ".join(
                    f"{pct(runs[i][1], w):.1f}→{pct(runs[i + 1][0], w):.1f} ({gw}px)"
                    for i, gw in enumerate(gap_widths_px)
                )
            )
        print(
            f"| {yp} | {y_px} | {lp:.1f} | {rp:.1f} | {rp - lp:.1f} | {len(runs)} | "
            f"{'; '.join(notes)} |"
        )

    # --- 2. Anatomical landmarks ---
    # Topmost opaque row
    top_y = None
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > ALPHA_THRESHOLD:
                top_y = y
                break
        if top_y is not None:
            break

    # Bottom opaque row
    bot_y = None
    for y in range(h - 1, -1, -1):
        for x in range(w):
            if px[x, y][3] > ALPHA_THRESHOLD:
                bot_y = y
                break
        if bot_y is not None:
            break

    # Per-row (width, leftmost_run_of_body, full_extent) for all rows
    # from top_y to bot_y — used to find widest, narrowest-above-hips,
    # leg split, blade band.
    rows = []
    for y in range(top_y, bot_y + 1):
        left, right, runs = find_row_extent(px, w, y)
        rows.append((y, left, right, runs))

    # Widest point overall (pauldrons likely)
    widest = max(
        rows,
        key=lambda r: (r[2] - r[1]) if r[1] is not None else -1,
    )

    # Leg split detection: first row below top_y + 50% h where runs >= 2
    leg_split_y = None
    for y, left, right, runs in rows:
        if y > top_y + (bot_y - top_y) * 0.5 and len(runs) >= 2:
            leg_split_y = y
            break

    # Narrowest row above the leg split (torso waist)
    narrowest = None
    for y, left, right, runs in rows:
        if left is None:
            continue
        # Exclude pauldron/hood region (top 20% of figure) and legs
        # region; narrowest between ~30%..60% figure height.
        figure_span = bot_y - top_y
        rel = (y - top_y) / figure_span if figure_span else 0
        if 0.30 <= rel <= 0.55:
            w_here = right - left
            if narrowest is None or w_here < (narrowest[2] - narrowest[1]):
                narrowest = (y, left, right)

    # Hip flare: widest row in rel 0.55..0.70
    hip_flare = None
    for y, left, right, runs in rows:
        if left is None:
            continue
        figure_span = bot_y - top_y
        rel = (y - top_y) / figure_span if figure_span else 0
        if 0.55 <= rel <= 0.72:
            w_here = right - left
            if hip_flare is None or w_here > (hip_flare[2] - hip_flare[1]):
                hip_flare = (y, left, right)

    # Ankle: row just above bot_y where two runs are present and combined
    # extent is narrowest (boots tapering).
    ankle = None
    # Scan bottom 15% of figure
    figure_span = bot_y - top_y
    ankle_start = top_y + int(figure_span * 0.85)
    for y in range(ankle_start, bot_y + 1):
        left, right, runs = find_row_extent(px, w, y)
        if left is None:
            continue
        w_here = right - left
        if ankle is None or w_here < (ankle[2] - ankle[1]):
            ankle = (y, left, right)

    print("\n## Anatomical landmarks\n")
    print("| landmark | y_px | y% | x_left% | x_right% | width% | notes |")
    print("|----------|-----:|---:|--------:|---------:|-------:|-------|")

    def row_line(label: str, y: int, left: int, right: int, note: str = ""):
        return (
            f"| {label} | {y} | {pct(y, h):.1f} | {pct(left, w):.1f} | "
            f"{pct(right, w):.1f} | {pct(right - left, w):.1f} | {note} |"
        )

    # Topmost
    top_row = next((r for r in rows if r[0] == top_y), None)
    if top_row:
        _, tl, tr, _ = top_row
        print(row_line("Hood peak (topmost opaque)", top_y, tl, tr))

    if widest and widest[1] is not None:
        print(row_line(
            "Widest point (pauldrons)", widest[0], widest[1], widest[2]
        ))

    if narrowest:
        print(row_line(
            "Narrowest above hips (waist)", narrowest[0], narrowest[1], narrowest[2]
        ))

    if hip_flare:
        print(row_line("Hip flare widest", hip_flare[0], hip_flare[1], hip_flare[2]))

    if leg_split_y is not None:
        left, right, runs = find_row_extent(px, w, leg_split_y)
        gap_note = ""
        if len(runs) >= 2:
            gap_note = (
                f"gap x={pct(runs[0][1], w):.1f}→{pct(runs[1][0], w):.1f} "
                f"({runs[1][0] - runs[0][1] - 1}px)"
            )
        print(row_line(
            "Legs start (gap first appears)", leg_split_y, left, right, gap_note
        ))

    if ankle:
        print(row_line("Ankle / boot", ankle[0], ankle[1], ankle[2]))

    bottom_row = next((r for r in rows if r[0] == bot_y), None)
    if bottom_row:
        _, bl, br, _ = bottom_row
        print(row_line("Bottom (sole)", bot_y, bl, br))

    # --- 3. Blade band analysis (y ~52..65 as requested) ---
    print("\n## Blade band analysis\n")
    print(
        "For each y in the blade range: number of opaque runs, body-only inner "
        "extent (the two runs closest to center), full extent (leftmost to "
        "rightmost pixel), and the blade-gap positions.\n"
    )
    print(
        "| y% | y_px | runs | full_left% | full_right% | body_left% | body_right% |"
        " body_width% | blade_gap_left | blade_gap_right |"
    )
    print(
        "|---:|-----:|-----:|-----------:|------------:|-----------:|------------:|"
        "-----------:|----------------|-----------------|"
    )
    for yp in [50, 52, 54, 56, 58, 60, 62, 64, 66, 68]:
        y_px = int(round(yp / 100 * (h - 1)))
        left, right, runs = find_row_extent(px, w, y_px)
        if left is None:
            print(f"| {yp} | {y_px} | 0 | — | — | — | — | — | — | — |")
            continue
        full_l_pct = pct(left, w)
        full_r_pct = pct(right, w)
        if len(runs) >= 3:
            # Expect: left-blade, body, right-blade. Middle run = body.
            center_run = runs[len(runs) // 2]
            body_l = center_run[0]
            body_r = center_run[1]
            # Blade gaps: between runs[0] and runs[1] (left), runs[-2] and runs[-1] (right)
            left_gap = f"{pct(runs[0][1], w):.1f}→{pct(runs[1][0], w):.1f}"
            right_gap = f"{pct(runs[-2][1], w):.1f}→{pct(runs[-1][0], w):.1f}"
        elif len(runs) == 2:
            # Two runs: blade might be attached to one side (e.g. blade
            # fused with hand/arm). Report the wider run as body.
            r0w = runs[0][1] - runs[0][0]
            r1w = runs[1][1] - runs[1][0]
            if r0w >= r1w:
                body_l, body_r = runs[0]
                left_gap = "—"
                right_gap = f"{pct(runs[0][1], w):.1f}→{pct(runs[1][0], w):.1f}"
            else:
                body_l, body_r = runs[1]
                left_gap = f"{pct(runs[0][1], w):.1f}→{pct(runs[1][0], w):.1f}"
                right_gap = "—"
        else:
            # One run — blades and body are joined; no inner contour to
            # derive. Body = full extent.
            body_l, body_r = left, right
            left_gap = "—"
            right_gap = "—"
        body_l_pct = pct(body_l, w)
        body_r_pct = pct(body_r, w)
        body_w_pct = body_r_pct - body_l_pct
        print(
            f"| {yp} | {y_px} | {len(runs)} | {full_l_pct:.1f} | {full_r_pct:.1f} | "
            f"{body_l_pct:.1f} | {body_r_pct:.1f} | {body_w_pct:.1f} | "
            f"{left_gap} | {right_gap} |"
        )

    # --- 4. Interpretation ---
    print("\n## Interpretation (derived)\n")
    figure_span_px = bot_y - top_y
    figure_top_pct = pct(top_y, h)
    figure_bot_pct = pct(bot_y, h)
    print(f"- Figure vertical span: y {figure_top_pct:.1f}% → {figure_bot_pct:.1f}% "
          f"({figure_span_px}px of {h})")
    if widest and widest[1] is not None:
        print(f"- Pauldrons widest at y {pct(widest[0], h):.1f}%: "
              f"x {pct(widest[1], w):.1f}..{pct(widest[2], w):.1f}% "
              f"(width {pct(widest[2] - widest[1], w):.1f}%)")
    if narrowest:
        print(f"- Narrowest torso (waist-ish) at y {pct(narrowest[0], h):.1f}%: "
              f"x {pct(narrowest[1], w):.1f}..{pct(narrowest[2], w):.1f}% "
              f"(width {pct(narrowest[2] - narrowest[1], w):.1f}%)")
    if hip_flare:
        print(f"- Hip flare widest at y {pct(hip_flare[0], h):.1f}%: "
              f"x {pct(hip_flare[1], w):.1f}..{pct(hip_flare[2], w):.1f}% "
              f"(width {pct(hip_flare[2] - hip_flare[1], w):.1f}%)")
    if leg_split_y is not None:
        left, right, runs = find_row_extent(px, w, leg_split_y)
        print(f"- Legs separate (first gap) at y {pct(leg_split_y, h):.1f}%")


if __name__ == "__main__":
    main()
