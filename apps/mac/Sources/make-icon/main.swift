import AppKit
import CoachIcon

// Build time only: writes AppIcon.iconset for `iconutil -c icns` (story 35).
//   make-icon <folder>/AppIcon.iconset
let sizes = [16, 32, 128, 256, 512]
let retina = 2

guard CommandLine.arguments.count == 2 else {
    FileHandle.standardError.write(Data("usage: make-icon <folder>/AppIcon.iconset\n".utf8))
    exit(1)
}
let folder = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
for size in sizes {
    for (scale, suffix) in [(1, ""), (retina, "@2x")] {
        let png = CoachIcon.appIcon(pixels: size * scale).representation(using: .png, properties: [:])!
        try png.write(to: folder.appendingPathComponent("icon_\(size)x\(size)\(suffix).png"))
    }
}
