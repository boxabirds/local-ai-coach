import sys, pathlib
ICONS = {
"6-zero-to-one": ("Zero to one: a coach's play arrow from 0 to 1", """
............
...#####....
..#.....#...
.#.......#..
.#.....#####
........###.
.........#..
.##.....#...
#..#...##...
#..#....#...
#..#....#...
.##....###..
"""),
"7-pointer-compass": ("Pointer compass: a mouse pointer as the needle of a compass", """
....####....
..##....##..
.#..#.....#.
.#..##....#.
#...###....#
#...####...#
#...#####..#
#...##.#...#
.#......#.#.
.#........#.
..##....##..
....####....
"""),
"8-megaphone": ("Megaphone: the coach calling out the next step", """
............
.......#....
......##....
....####.#..
########..#.
########..#.
########..#.
########..#.
....####.#..
....#.##....
....#..#....
............
"""),
"9-pixel-bulb": ("Pixel bulb: an idea, drawn in pixels", """
....####....
..##....##..
.#........#.
.#........#.
.#...##...#.
.#...##...#.
..#..##..#..
...#....#...
....####....
....####....
.....##.....
............
"""),
"10-pixel-summit": ("Pixel summit: the destination you're heading for, flag planted", """
......###...
......##....
......#.....
......#.....
.....###....
....#####...
...#######..
..#########.
.###########
############
############
############
"""),
}
for name, (title, art) in ICONS.items():
    rows = [r for r in art.strip("\n").split("\n")]
    assert len(rows) == 12 and all(len(r) == 12 for r in rows), (name, [len(r) for r in rows])
    rects = []
    for y, row in enumerate(rows):
        x = 0
        while x < 12:
            if row[x] == "#":
                start = x
                while x < 12 and row[x] == "#":
                    x += 1
                rects.append(f'<rect x="{start}" y="{y}" width="{x-start}" height="1"/>')
            else:
                x += 1
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="12" height="12" shape-rendering="crispEdges" role="img" aria-label="Local AI Coach">\n'
           f'  <title>{title}</title>\n  <g fill="currentColor">' + "".join(rects) + '</g>\n</svg>\n')
    pathlib.Path(f"{name}.svg").write_text(svg)
    print(name, len(rects), "rects")
