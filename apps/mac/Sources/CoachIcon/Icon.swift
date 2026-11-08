import AppKit

/// The coach's icon, a chip with a tick, drawn from the geometry of `apps/app/src/web/icon.svg`
/// (a 24-unit grid, strokes 2 units wide with round ends), so the menu bar, the app icon and
/// the browser tab are the same drawing (story 35; icon decided 2026-11-06).
public enum CoachIcon {
    static let grid: CGFloat = 24
    static let stroke: CGFloat = 2
    static let chip = CGRect(x: 5, y: 5, width: 14, height: 14)
    static let chipCorner: CGFloat = 2
    /// The pins: pairs of points, top, bottom, left, right.
    static let pins: [(CGPoint, CGPoint)] = [
        (CGPoint(x: 9, y: 2), CGPoint(x: 9, y: 5)), (CGPoint(x: 15, y: 2), CGPoint(x: 15, y: 5)),
        (CGPoint(x: 9, y: 19), CGPoint(x: 9, y: 22)), (CGPoint(x: 15, y: 19), CGPoint(x: 15, y: 22)),
        (CGPoint(x: 2, y: 9), CGPoint(x: 5, y: 9)), (CGPoint(x: 2, y: 15), CGPoint(x: 5, y: 15)),
        (CGPoint(x: 19, y: 9), CGPoint(x: 22, y: 9)), (CGPoint(x: 19, y: 15), CGPoint(x: 22, y: 15)),
    ]
    static let tick = [CGPoint(x: 8.5, y: 12), CGPoint(x: 11, y: 14.5), CGPoint(x: 15.5, y: 9.5)]

    /// Draws the icon filling `rect`, in `color`, into the current graphics context.
    public static func draw(in rect: CGRect, color: NSColor) {
        let scale = min(rect.width, rect.height) / grid
        // The SVG's y runs down; AppKit's runs up.
        let place = { (p: CGPoint) in CGPoint(x: rect.minX + p.x * scale, y: rect.maxY - p.y * scale) }
        color.setStroke()
        let body = NSBezierPath(roundedRect: CGRect(x: rect.minX + chip.minX * scale, y: rect.maxY - chip.maxY * scale, width: chip.width * scale, height: chip.height * scale), xRadius: chipCorner * scale, yRadius: chipCorner * scale)
        let lines = NSBezierPath()
        for (from, to) in pins {
            lines.move(to: place(from))
            lines.line(to: place(to))
        }
        lines.move(to: place(tick[0]))
        tick.dropFirst().forEach { lines.line(to: place($0)) }
        for path in [body, lines] {
            path.lineWidth = stroke * scale
            path.lineCapStyle = .round
            path.lineJoinStyle = .round
            path.stroke()
        }
    }

    /// The menu bar's size for an icon, in points.
    public static let menuBarSize: CGFloat = 18

    /// A template image: macOS colours it for a light or dark menu bar.
    public static func menuBarImage() -> NSImage {
        let image = NSImage(size: NSSize(width: menuBarSize, height: menuBarSize), flipped: false) { rect in
            draw(in: rect, color: .black)
            return true
        }
        image.isTemplate = true
        image.accessibilityDescription = "Local AI Coach"
        return image
    }

    /// Apple's app icon grid: the rounded square takes 824 of 1024 pixels, corner radius 185.
    static let iconSquare: CGFloat = 824 / 1024
    static let iconCorner: CGFloat = 185 / 1024
    /// How much of the square the chip takes.
    static let iconGlyph: CGFloat = 0.62

    /// The app icon, black on a white rounded square, `pixels` wide.
    public static func appIcon(pixels: Int) -> NSBitmapImageRep {
        let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        rep.size = NSSize(width: pixels, height: pixels)
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        let full = CGFloat(pixels)
        let side = full * iconSquare
        let square = CGRect(x: (full - side) / 2, y: (full - side) / 2, width: side, height: side)
        NSColor.white.setFill()
        NSBezierPath(roundedRect: square, xRadius: full * iconCorner, yRadius: full * iconCorner).fill()
        let glyph = side * iconGlyph
        draw(in: CGRect(x: (full - glyph) / 2, y: (full - glyph) / 2, width: glyph, height: glyph), color: .black)
        NSGraphicsContext.restoreGraphicsState()
        return rep
    }
}
