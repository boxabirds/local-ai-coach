// swift-tools-version:5.9
// Local AI Coach.app (Ceetrix story 35): a menu-bar wrapper around the release's own launcher.
import PackageDescription

let package = Package(
    name: "LocalAICoach",
    platforms: [.macOS(.v13)],
    targets: [
        // The logic, tested without AppKit: the launcher's lifecycle, ports, PATH, which release tree.
        .target(name: "CoachCore"),
        // The chip with a tick, drawn once for the menu bar and the app icon.
        .target(name: "CoachIcon"),
        .executableTarget(name: "LocalAICoach", dependencies: ["CoachCore", "CoachIcon"]),
        // Build time only: renders AppIcon.iconset.
        .executableTarget(name: "make-icon", dependencies: ["CoachIcon"]),
        .testTarget(name: "CoachCoreTests", dependencies: ["CoachCore"]),
    ]
)
